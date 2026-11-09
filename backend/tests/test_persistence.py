import os
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.job_store import JobStore
from utils.diff import diff_scans

SAMPLE_FINDINGS = [
    {
        "package_name": "reqeusts",
        "overall_risk": "HIGH",
        "risk_level": "high",
        "typosquat": {"distance_score": 1, "suspected_target": "requests", "risk_level": "high"},
        "cves": [],
        "sandbox": None,
        "license": {"spdx_id": "MIT", "category": "Permissive", "status": "pass"}
    },
    {
        "package_name": "express",
        "overall_risk": "SAFE",
        "risk_level": "safe",
        "typosquat": None,
        "cves": [],
        "sandbox": None,
        "license": {"spdx_id": "MIT", "category": "Permissive", "status": "pass"}
    }
]

def test_in_memory_job_store():
    # Fresh store with no DB
    store = JobStore()

    # Project
    proj = store.get_or_create_project("my-test-repo")
    assert proj["name"] == "my-test-repo"

    # Full Scan Job
    job = store.create_full_scan_job("job-123", project_name="my-test-repo")
    assert job["id"] == "job-123"
    assert job["status"] == "pending"

    # Running
    store.update_full_scan_job_running("job-123", dependencies={"reqeusts": "1.0.0", "express": "4.17.1"}, ecosystem="npm")
    job_running = store.get_full_scan_job("job-123")
    assert job_running["status"] == "running"

    # Completed
    store.complete_full_scan_job("job-123", results=SAMPLE_FINDINGS, dependencies={"reqeusts": "1.0.0", "express": "4.17.1"}, ecosystem="npm")
    job_completed = store.get_full_scan_job("job-123")
    assert job_completed["status"] == "completed"
    assert job_completed["overall_risk"] == "HIGH"
    assert job_completed["risk_score"] == 15.0
    assert len(job_completed["result"]) == 2

    # Sandbox Scan Job
    sb_job = store.create_sandbox_job("sb-456", "npm", "express", "4.18.0")
    assert sb_job["status"] == "pending"
    store.complete_sandbox_job("sb-456", result={"score": 0, "risk_level": "low"}, raw={"network": []})
    sb_completed = store.get_sandbox_job("sb-456")
    assert sb_completed["status"] == "completed"
    assert sb_completed["result"]["score"] == 0

    # Project list & scans
    projects = store.list_projects()
    assert len(projects) == 1
    assert projects[0]["name"] == "my-test-repo"

    scans = store.list_project_scans("my-test-repo")
    assert len(scans) == 1
    assert scans[0]["id"] == "job-123"

def test_db_backed_job_store():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        db_url = f"sqlite:///{db_path}"
        os.environ["DATABASE_URL"] = db_url

        # Run Alembic migrations to set up the DB
        from alembic.config import Config
        from alembic import command
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cfg = Config(os.path.join(backend_dir, "alembic.ini"))
        cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
        cfg.set_main_option("sqlalchemy.url", db_url)
        command.upgrade(cfg, "head")

        # Re-initialize engine in session module
        import db.session as session_module
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        session_module.DATABASE_URL = db_url
        session_module.engine = create_engine(db_url, connect_args={"check_same_thread": False})
        session_module.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=session_module.engine)

        assert session_module.is_db_enabled() is True

        store = JobStore()

        # Create project and scan in DB
        proj = store.get_or_create_project("db-project")
        assert proj["name"] == "db-project"

        job = store.create_full_scan_job("db-job-1", project_name="db-project")
        assert job["id"] == "db-job-1"

        store.update_full_scan_job_running("db-job-1", dependencies={"reqeusts": "1.0.0"}, ecosystem="npm")
        store.complete_full_scan_job("db-job-1", results=SAMPLE_FINDINGS, dependencies={"reqeusts": "1.0.0"}, ecosystem="npm")

        job_db = store.get_full_scan_job("db-job-1")
        assert job_db["status"] == "completed"
        assert job_db["overall_risk"] == "HIGH"
        assert job_db["risk_score"] == 15.0

        # Artifacts automatically generated in DB
        cdx = store.get_artifact("db-job-1", "cyclonedx")
        assert cdx is not None
        assert cdx.get("bomFormat") == "CycloneDX"

        spdx = store.get_artifact("db-job-1", "spdx")
        assert spdx is not None

        # Verify second scan for diff
        job2 = store.create_full_scan_job("db-job-2", project_name="db-project")
        resolved_findings = [
            {"package_name": "reqeusts", "overall_risk": "SAFE", "license": {"status": "pass"}}
        ]
        store.complete_full_scan_job("db-job-2", results=resolved_findings, dependencies={"reqeusts": "1.0.0"}, ecosystem="npm")

        job1_data = store.get_full_scan_job("db-job-1")
        job2_data = store.get_full_scan_job("db-job-2")

        diff = diff_scans(current=job2_data, previous=job1_data)
        assert diff["summary"]["resolved_count"] == 1
        assert diff["resolved"][0]["package_name"] == "reqeusts"

    finally:
        os.environ.pop("DATABASE_URL", None)
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass
