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
import tempfile
import zipfile
import shutil

app = FastAPI(title="Sentinel-chain Typosquat Detector")

# In-memory job store for sandbox scans
sandbox_jobs = {}

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

