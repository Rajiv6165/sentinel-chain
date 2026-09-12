import argparse
import asyncio
import json
import sys
import os

# Ensure stdout uses utf-8 encoding for emojis
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from utils.parser import parse_dependencies
from utils.scoring import score_dependencies
from utils.reachability import analyze_reachability
from utils.sandbox import run_sandbox_install
from utils.behavior_scoring import analyze_behavior
from utils.aggregator import aggregate_risk_scores
from utils.llm_narrative import generate_narrative
from utils.epss import get_epss_score
from utils.markdown_formatter import format_markdown_summary

async def run_cli():
    parser = argparse.ArgumentParser(description="Sentinel-Chain CLI Scanner")
    parser.add_argument("--path", required=True, help="Path to the repository to scan")
    parser.add_argument("--output", help="Path to save JSON output")
    parser.add_argument("--fail-on-severity", default="critical", choices=["none", "low", "medium", "high", "critical"], help="Exit with non-zero code if findings meet or exceed this severity")
    parser.add_argument("--enable-sandbox", action="store_true", help="Enable Phase 3 sandbox scanning (requires Docker)")
    
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
        
    # Generate Output
    md_summary = format_markdown_summary(aggregated_results, len(dependencies))
    
    print(md_summary)
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump({"scanned_count": len(dependencies), "findings": aggregated_results}, f, indent=2)
            
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
