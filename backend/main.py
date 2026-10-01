from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import uuid
from typing import List

from utils.parser import parse_dependencies
from utils.scoring import score_dependencies
from utils.reachability import analyze_reachability
from utils.sandbox import run_sandbox_install
from utils.behavior_scoring import analyze_behavior
from utils.aggregator import aggregate_risk_scores
from utils.llm_narrative import generate_narrative
from utils.epss import get_epss_score
from utils.parser import parse_dependencies, parse_dependencies_with_versions
from utils.sbom.generator import generate_cyclonedx, generate_spdx, generate_cyclonedx_vex
from utils.signing import generate_attestation, sign_data
from utils.license import load_policy, normalize_license, categorize_license, evaluate_compliance
from utils.license.fetcher import get_package_license
import tempfile
import zipfile
import shutil

app = FastAPI(title="Sentinel-chain Typosquat Detector")

# In-memory job store for sandbox scans
sandbox_jobs = {}
full_scan_jobs = {}

class SandboxScanRequest(BaseModel):
    ecosystem: str
    package_name: str
    version: str = None

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the actual frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load top packages dataset
TOP_PACKAGES = []
TOP_PACKAGES_PATH = os.path.join(os.path.dirname(__file__), "data", "top_packages.json")

@app.on_event("startup")
async def load_data():
    global TOP_PACKAGES
    if os.path.exists(TOP_PACKAGES_PATH):
        try:
            with open(TOP_PACKAGES_PATH, "r", encoding="utf-8") as f:
                TOP_PACKAGES = json.load(f)
        except Exception as e:
            print(f"Failed to load top packages: {e}")
            TOP_PACKAGES = []
    else:
        print(f"Top packages file not found at {TOP_PACKAGES_PATH}")

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "loaded_packages": len(TOP_PACKAGES)}

@app.post("/api/scan")
async def scan_dependencies(file: UploadFile = File(...)):
    if not file.filename.endswith((".json", ".txt")):
        raise HTTPException(status_code=400, detail="Only .json (package.json) or .txt (requirements.txt) files are supported")
    
    try:
        content = await file.read()
        content_str = content.decode("utf-8")
    except Exception as e:
         raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
         
    # Parse dependencies
    dependencies = parse_dependencies(file.filename, content_str)
    
    if not dependencies:
        return {"findings": [], "message": "No dependencies found in file."}
        
    # Analyze against known top packages
    findings = score_dependencies(dependencies, TOP_PACKAGES)
    
    return {
        "scanned_count": len(dependencies),
        "findings": findings
    }

@app.post("/api/reachability-scan")
async def reachability_scan(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported for reachability scans")
        
    temp_dir = tempfile.mkdtemp()
    zip_path = os.path.join(temp_dir, "repo.zip")
    
    try:
        with open(zip_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            
        # 1. Find package.json or requirements.txt
        manifest_path = None
        manifest_content = ""
        for root, _, files in os.walk(extract_dir):
            if "package.json" in files:
                manifest_path = os.path.join(root, "package.json")
                break
            elif "requirements.txt" in files:
                manifest_path = os.path.join(root, "requirements.txt")
                break
                
        if not manifest_path:
            return {"findings": [], "message": "No package.json or requirements.txt found in the repository."}
            
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest_content = f.read()
            
        dependencies = parse_dependencies(os.path.basename(manifest_path), manifest_content)
        
        # 2. Get Phase 1 findings
        findings = score_dependencies(dependencies, TOP_PACKAGES)
        
        # 3. Add Phase 2 reachability analysis
        if findings:
            findings = await analyze_reachability(extract_dir, findings)
            
        return {
            "scanned_count": len(dependencies),
            "findings": findings
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

async def process_sandbox_scan(job_id: str, ecosystem: str, package_name: str, version: str):
    try:
        sandbox_jobs[job_id]["status"] = "running"
        sandbox_result = await run_sandbox_install(ecosystem, package_name, version)
        analysis = analyze_behavior(sandbox_result)
        
        sandbox_jobs[job_id]["status"] = "completed"
        sandbox_jobs[job_id]["result"] = analysis
        sandbox_jobs[job_id]["raw"] = sandbox_result
    except Exception as e:
        sandbox_jobs[job_id]["status"] = "failed"
        sandbox_jobs[job_id]["error"] = str(e)

@app.post("/api/sandbox-scan")
async def start_sandbox_scan(req: SandboxScanRequest, background_tasks: BackgroundTasks):
    if req.ecosystem not in ["npm", "pypi"]:
        raise HTTPException(status_code=400, detail="ecosystem must be 'npm' or 'pypi'")
        
    job_id = str(uuid.uuid4())
    sandbox_jobs[job_id] = {
        "status": "pending",
        "package": req.package_name,
        "version": req.version,
        "ecosystem": req.ecosystem
    }
    
    background_tasks.add_task(process_sandbox_scan, job_id, req.ecosystem, req.package_name, req.version)
    
    return {"job_id": job_id, "status": "pending"}

@app.get("/api/sandbox-scan/{job_id}")
async def get_sandbox_scan_status(job_id: str):
    if job_id not in sandbox_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return sandbox_jobs[job_id]

async def process_full_scan(job_id: str, extract_dir: str, manifest_path: str):
    try:
        full_scan_jobs[job_id]["status"] = "running"
        ecosystem = "npm" if "package.json" in manifest_path else "pypi"
        
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest_content = f.read()
            
        dependencies = parse_dependencies(os.path.basename(manifest_path), manifest_content)
        deps_with_versions = parse_dependencies_with_versions(os.path.basename(manifest_path), manifest_content)
        full_scan_jobs[job_id]["dependencies"] = deps_with_versions
        full_scan_jobs[job_id]["ecosystem"] = ecosystem
        
        # 1. Typosquat (Phase 1)
        phase1_findings = score_dependencies(dependencies, TOP_PACKAGES)
        
        # 2. Reachability & EPSS (Phase 2)
        # Re-using the Phase 1 findings as the target list for Phase 2 as per current implementation
        if phase1_findings:
            phase2_findings = await analyze_reachability(extract_dir, phase1_findings)
        else:
            phase2_findings = []
            
        # 3. Sandbox (Phase 3)
        # To avoid scanning 500 dependencies and timing out the demo, we'll only deep-scan the flagged ones
        # In a real enterprise product, this would be distributed across a cluster.
        aggregated_results = []
        for f in phase2_findings:
            pkg_name = f.get("package_name")
            
            # Fetch EPSS
            epss_score = await get_epss_score(f.get("cve_id", ""))
            f["epss_score"] = epss_score
            
            # Run Sandbox
            try:
                sandbox_raw = await run_sandbox_install(ecosystem, pkg_name, "latest")
                sandbox_finding = analyze_behavior(sandbox_raw)
            except Exception as se:
                print(f"Sandbox scan failed for {pkg_name}: {se}")
                sandbox_finding = {"score": 0, "risk_level": "low", "evidence": []}
            
            # Aggregate
            unified = aggregate_risk_scores(pkg_name, f, [f], sandbox_finding)
            
            # Generate Narratives
            if unified["typosquat"]:
                unified["typosquat"]["narrative"] = await generate_narrative(pkg_name, "typosquat", unified["typosquat"])
            if unified.get("cves"):
                for c in unified["cves"]:
                    c["narrative"] = await generate_narrative(pkg_name, "reachability", c)
            if unified.get("sandbox"):
                unified["sandbox"]["narrative"] = await generate_narrative(pkg_name, "sandbox", unified["sandbox"])
                
            aggregated_results.append(unified)
            
        # 4. License Compliance (Phase 9)
        policy = load_policy(extract_dir)
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
            
            # Update overall risk based on license compliance
            if compliance["status"] == "fail":
                finding_map[pkg_name]["overall_risk"] = "CRITICAL"
                finding_map[pkg_name]["risk_level"] = "critical"
            elif compliance["status"] == "warn" and finding_map[pkg_name]["overall_risk"] == "LOW":
                finding_map[pkg_name]["overall_risk"] = "MEDIUM"
                finding_map[pkg_name]["risk_level"] = "medium"

        final_results = list(finding_map.values())
        
        full_scan_jobs[job_id]["status"] = "completed"
        full_scan_jobs[job_id]["result"] = final_results
        
    except Exception as e:
        full_scan_jobs[job_id]["status"] = "failed"
        full_scan_jobs[job_id]["error"] = str(e)
    finally:
        shutil.rmtree(extract_dir, ignore_errors=True)

@app.post("/api/full-scan")
async def start_full_scan(file: UploadFile = File(...), background_tasks: BackgroundTasks = BackgroundTasks()):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported for full scans")
        
    temp_dir = tempfile.mkdtemp()
    zip_path = os.path.join(temp_dir, "repo.zip")
    
    try:
        with open(zip_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        extract_dir = os.path.join(temp_dir, "extracted")
        os.makedirs(extract_dir)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            
        manifest_path = None
        for root, _, files in os.walk(extract_dir):
            if "package.json" in files:
                manifest_path = os.path.join(root, "package.json")
                break
            elif "requirements.txt" in files:
                manifest_path = os.path.join(root, "requirements.txt")
                break
                
        if not manifest_path:
            shutil.rmtree(temp_dir, ignore_errors=True)
            return {"findings": [], "message": "No package.json or requirements.txt found in the repository."}
            
        job_id = str(uuid.uuid4())
        full_scan_jobs[job_id] = {
            "status": "pending"
        }
        
        # Pass the extracted directory path to the background task
        background_tasks.add_task(process_full_scan, job_id, temp_dir, manifest_path)
        
        return {"job_id": job_id, "status": "pending"}
        
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/full-scan/{job_id}")
async def get_full_scan_status(job_id: str):
    if job_id not in full_scan_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return full_scan_jobs[job_id]

@app.get("/api/sbom/{job_id}")
async def get_sbom(job_id: str, format: str = "cyclonedx"):
    if job_id not in full_scan_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = full_scan_jobs[job_id]
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Scan not completed yet")
        
    deps = job.get("dependencies", {})
    ecosystem = job.get("ecosystem", "generic")
    findings = job.get("result", [])
    
    if format == "cyclonedx":
        return generate_cyclonedx(ecosystem, deps, findings)
    elif format == "spdx":
        return generate_spdx(ecosystem, deps, findings)
    elif format == "vex":
        return generate_cyclonedx_vex(ecosystem, deps, findings)
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Supported formats: cyclonedx, spdx, vex")

@app.get("/api/sbom/{job_id}/attestation")
async def get_attestation(job_id: str, sign: bool = False):
    if job_id not in full_scan_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = full_scan_jobs[job_id]
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Scan not completed yet")
        
    deps = job.get("dependencies", {})
    ecosystem = job.get("ecosystem", "generic")
    findings = job.get("result", [])
    
    cdx_sbom = generate_cyclonedx(ecosystem, deps, findings)
    report = {"scanned_count": len(deps), "findings": findings}
    
    # Generate attestation
    attestation = generate_attestation(
        repo_path="uploaded_archive.zip",
        sbom_content=cdx_sbom,
        report_content=report,
        engines_run=["typosquat", "reachability", "sandbox"]
    )
    
    response = {"attestation": attestation}
    
    if sign:
        try:
            # Try to sign the attestation
            attestation_bytes = json.dumps(attestation, sort_keys=True).encode('utf-8')
            # This might block if interactive auth is triggered
            bundle = sign_data(attestation_bytes)
            response["signature"] = json.loads(bundle.to_json())
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Signing failed: {str(e)}")
            
    return response
