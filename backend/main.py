from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import json
import os
import uuid
import asyncio
from typing import List, Optional
import tempfile
import shutil

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from utils.parser import parse_dependencies, parse_dependencies_with_versions
from utils.scoring import score_dependencies
from utils.reachability import analyze_reachability
from utils.sandbox import run_sandbox_install
from utils.behavior_scoring import analyze_behavior
from utils.aggregator import aggregate_risk_scores
from utils.llm_narrative import generate_narrative
from utils.epss import get_epss_score
from utils.sbom.generator import generate_cyclonedx, generate_spdx, generate_cyclonedx_vex
from utils.signing import generate_attestation, sign_data
from utils.license import load_policy, normalize_license, categorize_license, evaluate_compliance
from utils.license.fetcher import get_package_license
from utils.diff import diff_scans
from utils.safe_zip import (
    save_upload_with_size_limit,
    safe_extract_zip,
    get_active_limits,
    MAX_UPLOAD_SIZE,
    SCAN_TIMEOUT_SECONDS,
)
from db.session import is_db_enabled
from db.migrations import run_migrations
from db.job_store import job_store

# ==========================
# Deployment Configuration
# ==========================
# Default ENABLE_SANDBOX=false: sandbox execution is disabled by default for public deployment safety
ENABLE_SANDBOX = os.environ.get("ENABLE_SANDBOX", "false").lower() in ("true", "1", "yes")

# CORS restricted to frontend origins (configurable via CORS_ORIGINS)
DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
CORS_ORIGINS_RAW = os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
ALLOWED_ORIGINS = [o.strip() for o in CORS_ORIGINS_RAW.split(",") if o.strip()]

# Rate Limiting configuration
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

app = FastAPI(
    title="Sentinel-chain Supply Chain Security Platform",
    docs_url="/api/docs" if os.environ.get("ENABLE_DOCS", "true").lower() in ("true", "1") else None,
    redoc_url=None
)

app.state.limiter = limiter

async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit reached, try again in a minute.",
            "error": f"Rate limit exceeded: {exc.detail}"
        }
    )

app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# Global generic error handler to prevent internal stack trace leakage in public deployment
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    if isinstance(exc, RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Rate limit reached, try again in a minute.",
                "error": f"Rate limit exceeded: {exc.detail}"
            }
        )
    
    print(f"Internal error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )


class SandboxScanRequest(BaseModel):
    ecosystem: str
    package_name: str
    version: str = None


class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None


# Load top packages dataset
TOP_PACKAGES = []
TOP_PACKAGES_PATH = os.path.join(os.path.dirname(__file__), "data", "top_packages.json")


@app.on_event("startup")
async def startup_event():
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

    if is_db_enabled():
        try:
            run_migrations()
            print("✅ Database persistence enabled and migrations applied.")
        except Exception as e:
            print(f"⚠️ Warning: Failed to run migrations on startup: {e}")
    else:
        print("ℹ️ Persistence disabled (DATABASE_URL not set). Using in-memory job store.")


@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "loaded_packages": len(TOP_PACKAGES),
        "db_enabled": is_db_enabled(),
        "sandbox_enabled": ENABLE_SANDBOX
    }


@app.get("/api/config")
async def get_public_config():
    """Returns runtime public deployment configuration for the frontend."""
    limits = get_active_limits()
    return {
        "sandbox_enabled": ENABLE_SANDBOX,
        "public_demo": True,
        "max_upload_mb": limits["max_upload_mb"],
        "max_uncompressed_mb": limits["max_uncompressed_mb"],
        "max_zip_files": limits["max_zip_files"],
        "max_upload_size_mb": limits["max_upload_mb"],
        "llm_enabled": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "demo_notice": "Public demo - don't upload private code."
    }


@app.post("/api/scan")
@limiter.limit("20/minute")
async def scan_dependencies(request: Request, file: UploadFile = File(...)):
    if not file.filename.endswith((".json", ".txt")):
        raise HTTPException(status_code=400, detail="Only .json (package.json) or .txt (requirements.txt) files are supported")

    limits = get_active_limits()
    max_upload_bytes = limits["max_upload_size"]

    try:
        content = await file.read(max_upload_bytes + 1024)
        if len(content) > max_upload_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Upload exceeds maximum permitted size of {limits['max_upload_mb']} MB."
            )
        content_str = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Uploaded file must be a valid UTF-8 text file.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    dependencies = parse_dependencies(file.filename, content_str)
    if not dependencies:
        return {"findings": [], "message": "No dependencies found in file."}

    findings = score_dependencies(dependencies, TOP_PACKAGES)
    return {
        "scanned_count": len(dependencies),
        "findings": findings
    }


@app.post("/api/reachability-scan")
@limiter.limit("10/minute")
async def reachability_scan(request: Request, file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported for reachability scans")

    temp_dir = tempfile.mkdtemp(prefix="reachability_scan_")
    zip_path = os.path.join(temp_dir, "repo.zip")

    try:
        # Enforce upload size limits safely
        await save_upload_with_size_limit(file, zip_path, max_size=MAX_UPLOAD_SIZE)

        extract_dir = os.path.join(temp_dir, "extracted")
        # Enforce zip-slip, symlink rejection, uncompressed size limit, and file count limit
        safe_extract_zip(zip_path, extract_dir)

        manifest_path = None
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
        findings = score_dependencies(dependencies, TOP_PACKAGES)

        if findings:
            # Enforce timeout on static reachability analysis
            findings = await asyncio.wait_for(
                analyze_reachability(extract_dir, findings),
                timeout=SCAN_TIMEOUT_SECONDS
            )

        return {
            "scanned_count": len(dependencies),
            "findings": findings
        }
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail=f"Reachability scan timed out after {SCAN_TIMEOUT_SECONDS}s.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to complete reachability scan.")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# ==========================
# Sandbox Scan Endpoints
# ==========================
async def process_sandbox_scan(job_id: str, ecosystem: str, package_name: str, version: str):
    try:
        job_store.update_sandbox_job_running(job_id)
        if not ENABLE_SANDBOX:
            job_store.fail_sandbox_job(job_id, "Sandbox execution is disabled in this public demo environment.")
            return

        sandbox_result = await run_sandbox_install(ecosystem, package_name, version)
        analysis = analyze_behavior(sandbox_result)
        job_store.complete_sandbox_job(job_id, analysis, sandbox_result)
    except Exception as e:
        job_store.fail_sandbox_job(job_id, str(e))


@app.post("/api/sandbox-scan")
@limiter.limit("10/minute")
async def start_sandbox_scan(request: Request, req: SandboxScanRequest, background_tasks: BackgroundTasks):
    if not ENABLE_SANDBOX:
        raise HTTPException(
            status_code=403,
            detail="Sandbox engine is disabled in this public demo deployment for security (untrusted execution requires isolated worker infrastructure)."
        )

    if req.ecosystem not in ["npm", "pypi"]:
        raise HTTPException(status_code=400, detail="ecosystem must be 'npm' or 'pypi'")

    job_id = str(uuid.uuid4())
    job_store.create_sandbox_job(job_id, req.ecosystem, req.package_name, req.version)
    background_tasks.add_task(process_sandbox_scan, job_id, req.ecosystem, req.package_name, req.version)

    return {"job_id": job_id, "status": "pending"}


@app.get("/api/sandbox-scan/{job_id}")
async def get_sandbox_scan_status(job_id: str):
    job = job_store.get_sandbox_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ==========================
# Full Scan Endpoints
# ==========================
async def _execute_full_scan_pipeline(job_id: str, temp_dir: str, manifest_path: str):
    extract_dir = os.path.join(temp_dir, "extracted")
    ecosystem = "npm" if "package.json" in manifest_path else "pypi"

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest_content = f.read()

    dependencies = parse_dependencies(os.path.basename(manifest_path), manifest_content)
    deps_with_versions = parse_dependencies_with_versions(os.path.basename(manifest_path), manifest_content)

    job_store.update_full_scan_job_running(job_id, deps_with_versions, ecosystem)

    # 1. Typosquat (Phase 1)
    phase1_findings = score_dependencies(dependencies, TOP_PACKAGES)

    # 2. Reachability & EPSS (Phase 2)
    if phase1_findings:
        phase2_findings = await analyze_reachability(extract_dir, phase1_findings)
    else:
        phase2_findings = []

    # 3. Sandbox (Phase 3)
    aggregated_results = []
    for f in phase2_findings:
        pkg_name = f.get("package_name")

        # Fetch EPSS
        epss_score = await get_epss_score(f.get("cve_id", ""))
        f["epss_score"] = epss_score

        # Run Sandbox (or skip safely if disabled)
        if ENABLE_SANDBOX:
            try:
                sandbox_raw = await run_sandbox_install(ecosystem, pkg_name, "latest")
                sandbox_finding = analyze_behavior(sandbox_raw)
            except Exception as se:
                print(f"Sandbox scan failed for {pkg_name}: {se}")
                sandbox_finding = {"score": 0, "risk_level": "low", "evidence": []}
        else:
            sandbox_finding = {
                "score": 0,
                "risk_level": "low",
                "evidence": [],
                "disabled": True,
                "message": "Sandbox engine is disabled in this public demo deployment."
            }

        # Aggregate unified score
        unified = aggregate_risk_scores(pkg_name, f, [f], sandbox_finding)

        # Generate Narratives (with daily cap & graceful fallback)
        if unified.get("typosquat"):
            unified["typosquat"]["narrative"] = await generate_narrative(pkg_name, "typosquat", unified["typosquat"])
        if unified.get("cves"):
            for c in unified["cves"]:
                c["narrative"] = await generate_narrative(pkg_name, "reachability", c)
        if unified.get("sandbox") and not unified["sandbox"].get("disabled"):
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

        if compliance["status"] == "fail":
            finding_map[pkg_name]["overall_risk"] = "CRITICAL"
            finding_map[pkg_name]["risk_level"] = "critical"
        elif compliance["status"] == "warn" and finding_map[pkg_name]["overall_risk"] == "LOW":
            finding_map[pkg_name]["overall_risk"] = "MEDIUM"
            finding_map[pkg_name]["risk_level"] = "medium"

    final_results = list(finding_map.values())
    job_store.complete_full_scan_job(job_id, final_results, deps_with_versions, ecosystem)


async def process_full_scan(job_id: str, temp_dir: str, manifest_path: str):
    try:
        await asyncio.wait_for(
            _execute_full_scan_pipeline(job_id, temp_dir, manifest_path),
            timeout=SCAN_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        job_store.fail_full_scan_job(job_id, f"Full scan timed out after {SCAN_TIMEOUT_SECONDS} seconds.")
    except Exception as e:
        job_store.fail_full_scan_job(job_id, str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/api/full-scan")
@limiter.limit("10/minute")
async def start_full_scan(
    request: Request,
    file: UploadFile = File(...),
    project_name: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported for full scans")

    temp_dir = tempfile.mkdtemp(prefix="full_scan_")
    zip_path = os.path.join(temp_dir, "repo.zip")

    try:
        await save_upload_with_size_limit(file, zip_path, max_size=MAX_UPLOAD_SIZE)
        extract_dir = os.path.join(temp_dir, "extracted")
        safe_extract_zip(zip_path, extract_dir)

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
        job_store.create_full_scan_job(job_id, project_name=project_name)

        background_tasks.add_task(process_full_scan, job_id, temp_dir, manifest_path)
        return {"job_id": job_id, "status": "pending"}

    except HTTPException:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Failed to initialize full scan.")


@app.get("/api/full-scan/{job_id}")
async def get_full_scan_status(job_id: str):
    job = job_store.get_full_scan_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ==========================
# SBOM & Attestation Endpoints
# ==========================
@app.get("/api/sbom/{job_id}")
async def get_sbom(job_id: str, format: str = "cyclonedx"):
    job = job_store.get_full_scan_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Scan not completed yet")

    cached = job_store.get_artifact(job_id, format)
    if cached:
        return cached

    deps = job.get("dependencies", {})
    ecosystem = job.get("ecosystem", "generic")
    findings = job.get("result", [])

    if format == "cyclonedx":
        doc = generate_cyclonedx(ecosystem, deps, findings)
    elif format == "spdx":
        doc = generate_spdx(ecosystem, deps, findings)
    elif format == "vex":
        doc = generate_cyclonedx_vex(ecosystem, deps, findings)
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Supported formats: cyclonedx, spdx, vex")

    job_store.save_artifact(job_id, format, doc)
    return doc


@app.get("/api/sbom/{job_id}/attestation")
async def get_attestation(job_id: str, sign: bool = False):
    job = job_store.get_full_scan_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Scan not completed yet")

    existing_att = job_store.get_attestation_artifact(job_id)
    if existing_att and (not sign or existing_att.get("signature")):
        return existing_att

    deps = job.get("dependencies", {})
    ecosystem = job.get("ecosystem", "generic")
    findings = job.get("result", [])

    cdx_sbom = job_store.get_artifact(job_id, "cyclonedx") or generate_cyclonedx(ecosystem, deps, findings)
    report = {"scanned_count": len(deps), "findings": findings}

    attestation = generate_attestation(
        repo_path="uploaded_archive.zip",
        sbom_content=cdx_sbom,
        report_content=report,
        engines_run=["typosquat", "reachability"] + (["sandbox"] if ENABLE_SANDBOX else [])
    )

    signature = None
    if sign:
        try:
            attestation_bytes = json.dumps(attestation, sort_keys=True).encode('utf-8')
            bundle = sign_data(attestation_bytes)
            signature = json.loads(bundle.to_json())
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Signing not available on server: {str(e)}")

    job_store.save_artifact(job_id, "attestation", attestation, signature=signature)

    response = {"attestation": attestation}
    if signature:
        response["signature"] = signature
    return response


# ==========================
# History & Trend API
# ==========================
@app.get("/api/projects")
async def get_projects():
    """List all projects with scan count and latest scan summary."""
    return job_store.list_projects()


@app.post("/api/projects")
async def create_project(req: ProjectCreateRequest):
    """Create or retrieve a project by name."""
    proj = job_store.get_or_create_project(req.name, req.description)
    return proj


@app.get("/api/projects/{project_id}/scans")
async def get_project_scans(project_id: str):
    """List all historical scans for a project."""
    return job_store.list_project_scans(project_id)


@app.get("/api/scans/{scan_id}/diff")
async def get_scan_diff(scan_id: str, against: Optional[str] = None):
    """
    Diffs scan_id against another scan.
    If 'against' is omitted, diffs against the previous completed scan for the project.
    Returns findings that are new, resolved, or unchanged.
    """
    current_scan = job_store.get_full_scan_job(scan_id)
    if not current_scan:
        raise HTTPException(status_code=404, detail="Current scan not found")

    against_scan = None
    if against:
        against_scan = job_store.get_full_scan_job(against)
        if not against_scan:
            raise HTTPException(status_code=404, detail=f"Comparison scan '{against}' not found")
    else:
        proj_ref = current_scan.get("project_id") or current_scan.get("project_name")
        if proj_ref:
            against_scan = job_store.get_latest_project_scan(proj_ref, exclude_scan_id=scan_id)

    diff = diff_scans(current=current_scan, previous=against_scan or [])
    return diff
