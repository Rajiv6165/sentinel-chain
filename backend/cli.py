import argparse
import asyncio
import json
import sys
import os

# Ensure stdout uses utf-8 encoding for emojis
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from utils.parser import parse_dependencies, parse_dependencies_with_versions
from utils.sbom.generator import generate_cyclonedx, generate_spdx, generate_cyclonedx_vex
from utils.scoring import score_dependencies
from utils.reachability import analyze_reachability
from utils.sandbox import run_sandbox_install
from utils.behavior_scoring import analyze_behavior
from utils.aggregator import aggregate_risk_scores
from utils.llm_narrative import generate_narrative
from utils.epss import get_epss_score
from utils.markdown_formatter import format_markdown_summary
from utils.signing import sign_file, verify_file, generate_attestation

async def run_cli():
    if len(sys.argv) >= 2 and sys.argv[1] == "verify":
        parser = argparse.ArgumentParser(description="Verify a Sentinel-Chain scan signature")
        parser.add_argument("artifact", help="Path to the artifact (e.g. report.json)")
        parser.add_argument("signature", help="Path to the signature bundle (e.g. report.json.sigstore.json)")
        args = parser.parse_args(sys.argv[2:])
        
        print(f"Verifying {args.artifact} against {args.signature}...")
        success, message = verify_file(args.artifact, args.signature)
        if success:
            print(f"✅ {message}")
            sys.exit(0)
        else:
            print(f"❌ Verification failed: {message}")
            sys.exit(1)

    parser = argparse.ArgumentParser(description="Sentinel-Chain CLI Scanner")
    parser.add_argument("--path", required=True, help="Path to the repository to scan")
    parser.add_argument("--output", help="Path to save JSON output")
    parser.add_argument("--fail-on-severity", default="critical", choices=["none", "low", "medium", "high", "critical"], help="Exit with non-zero code if findings meet or exceed this severity")
    parser.add_argument("--enable-sandbox", action="store_true", help="Enable Phase 3 sandbox scanning (requires Docker)")
    parser.add_argument("--generate-sbom", action="store_true", help="Generate SBOMs (CycloneDX and SPDX) and VEX along with the scan results")
    parser.add_argument("--sign", action="store_true", help="Sign the generated outputs (SBOM, report) using Sigstore and generate a SLSA attestation")
    
    args = parser.parse_args()
    
    repo_path = os.path.abspath(args.path)
    if not os.path.isdir(repo_path):
        print(f"Error: Path {repo_path} is not a valid directory.")
        sys.exit(1)
        
    manifest_path = None
    for root, _, files in os.walk(repo_path):
        if "package.json" in files:
            manifest_path = os.path.join(root, "package.json")
            break
        elif "requirements.txt" in files:
            manifest_path = os.path.join(root, "requirements.txt")
            break
            
    if not manifest_path:
        print(f"Error: No package.json or requirements.txt found in {repo_path}")
        sys.exit(1)
        
    ecosystem = "npm" if "package.json" in manifest_path else "pypi"
    
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest_content = f.read()
        
    dependencies = parse_dependencies(os.path.basename(manifest_path), manifest_content)
    deps_with_versions = parse_dependencies_with_versions(os.path.basename(manifest_path), manifest_content)
    
    # Load Top Packages
    top_packages = []
    top_packages_path = os.path.join(os.path.dirname(__file__), "data", "top_packages.json")
    if os.path.exists(top_packages_path):
        with open(top_packages_path, "r", encoding="utf-8") as f:
            top_packages = json.load(f)
            
    # Phase 1: Typosquat
    phase1_findings = score_dependencies(dependencies, top_packages)
    
    # Phase 2: Reachability
    if phase1_findings:
        phase2_findings = await analyze_reachability(repo_path, phase1_findings)
    else:
        phase2_findings = []
        
    # Phase 3 & Aggregation
    aggregated_results = []
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    
    for f in phase2_findings:
        pkg_name = f.get("package_name")
        
        # EPSS
        epss_score = await get_epss_score(f.get("cve_id", ""))
        f["epss_score"] = epss_score
        
        # Sandbox (Conditional)
        sandbox_finding = {}
        if args.enable_sandbox:
            try:
                sandbox_raw = await run_sandbox_install(ecosystem, pkg_name, "latest")
                sandbox_finding = analyze_behavior(sandbox_raw)
            except Exception as se:
                print(f"Sandbox scan failed for {pkg_name}: {se}")
                sandbox_finding = {"score": 0, "risk_level": "low", "evidence": []}
        
        unified = aggregate_risk_scores(pkg_name, f, [f], sandbox_finding)
        
        # Narratives
        if anthropic_key:
            if unified.get("typosquat"):
                unified["typosquat"]["narrative"] = await generate_narrative(pkg_name, "typosquat", unified["typosquat"])
            if unified.get("cves"):
                for c in unified["cves"]:
                    c["narrative"] = await generate_narrative(pkg_name, "reachability", c)
            if unified.get("sandbox"):
                unified["sandbox"]["narrative"] = await generate_narrative(pkg_name, "sandbox", unified["sandbox"])
                
        aggregated_results.append(unified)
        
    # Phase 9: License Compliance
    from utils.license import load_policy, normalize_license, categorize_license, evaluate_compliance
    from utils.license.fetcher import get_package_license
    
    policy = load_policy(repo_path)
    finding_map = {f["package_name"]: f for f in aggregated_results}
    
    for pkg_name, version in deps_with_versions.items():
        if pkg_name not in finding_map:
            finding_map[pkg_name] = {
                "package_name": pkg_name, 
                "risk_level": "low", 
                "overall_risk": "LOW",
                "typosquat": None,
                "cves": [],
                "sandbox": None
            }
            
        raw_lic = await get_package_license(ecosystem, pkg_name, version)
        spdx_id = normalize_license(raw_lic)
        cat = categorize_license(spdx_id)
        compliance = evaluate_compliance(spdx_id, cat, policy)
        
        finding_map[pkg_name]["license"] = {
            "raw": raw_lic,
            "spdx_id": spdx_id,
            "category": cat,
            "status": compliance["status"],
            "reason": compliance["reason"]
        }
        
        if compliance["status"] == "fail":
            finding_map[pkg_name]["overall_risk"] = "CRITICAL"
            finding_map[pkg_name]["risk_level"] = "critical"
        elif compliance["status"] == "warn" and finding_map[pkg_name]["overall_risk"] == "LOW":
            finding_map[pkg_name]["overall_risk"] = "MEDIUM"
            finding_map[pkg_name]["risk_level"] = "medium"
            
    aggregated_results = list(finding_map.values())
        
    # Generate Output
    md_summary = format_markdown_summary(aggregated_results, len(dependencies))
    
    print(md_summary)
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump({"scanned_count": len(dependencies), "findings": aggregated_results}, f, indent=2)

    if args.generate_sbom:
        cdx = generate_cyclonedx(ecosystem, deps_with_versions, aggregated_results)
        spdx = generate_spdx(ecosystem, deps_with_versions, aggregated_results)
        vex = generate_cyclonedx_vex(ecosystem, deps_with_versions, aggregated_results)
        
        with open("sbom.cyclonedx.json", "w", encoding="utf-8") as f:
            json.dump(cdx, f, indent=2)
        with open("sbom.spdx.json", "w", encoding="utf-8") as f:
            json.dump(spdx, f, indent=2)
        with open("vex.cyclonedx.json", "w", encoding="utf-8") as f:
            json.dump(vex, f, indent=2)
            
        print("\n📄 Generated SBOM and VEX files in the current directory.")
        
    if args.sign:
        engines = ["typosquat", "reachability"]
        if args.enable_sandbox:
            engines.append("sandbox")
        
        # Generate attestation
        sbom_content = None
        if args.generate_sbom and os.path.exists("sbom.cyclonedx.json"):
            with open("sbom.cyclonedx.json", "r", encoding="utf-8") as f:
                sbom_content = f.read()
                
        report_content = None
        if args.output and os.path.exists(args.output):
            with open(args.output, "r", encoding="utf-8") as f:
                report_content = f.read()
                
        attestation = generate_attestation(repo_path, sbom_content, report_content, engines)
        with open("attestation.json", "w", encoding="utf-8") as f:
            json.dump(attestation, f, indent=2)
        print("\n📄 Generated SLSA provenance attestation (attestation.json).")
        
        # Sign files
        files_to_sign = ["attestation.json"]
        if args.output:
            files_to_sign.append(args.output)
        if args.generate_sbom:
            files_to_sign.extend(["sbom.cyclonedx.json", "sbom.spdx.json"])
            
        print("\n🔐 Signing files with Sigstore...")
        for file in files_to_sign:
            if os.path.exists(file):
                sig_path = sign_file(file)
                print(f"  Signed {file} -> {sig_path}")
            
    # Exit code logic
    risk_levels = {"none": -1, "safe": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    threshold = risk_levels.get(args.fail_on_severity.lower(), 4)
    
    highest_risk_found = "safe"
    for r in aggregated_results:
        r_risk = r.get("overall_risk", "safe").lower()
        if risk_levels.get(r_risk, 0) > risk_levels.get(highest_risk_found, 0):
            highest_risk_found = r_risk
            
    if risk_levels.get(highest_risk_found, 0) >= threshold and threshold > -1:
        print(f"\n❌ Pipeline failed: found {highest_risk_found.upper()} risk which meets or exceeds threshold {args.fail_on_severity.upper()}.")
        sys.exit(1)
    else:
        print("\n✅ Pipeline passed risk threshold check.")
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(run_cli())
