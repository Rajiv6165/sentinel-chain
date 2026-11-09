import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.job_store import JobStore
from utils.diff import diff_scans

SAMPLE_SCAN_1 = [
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
        "package_name": "vuln-pkg",
        "overall_risk": "CRITICAL",
        "risk_level": "critical",
        "typosquat": None,
        "cves": [{"cve_id": "CVE-2022-9999", "reachability": "REACHABLE", "epss_score": 0.9}],
        "sandbox": None,
        "license": {"spdx_id": "MIT", "category": "Permissive", "status": "pass"}
    }
]

SAMPLE_SCAN_2 = [
    # reqeusts unchanged
    {
        "package_name": "reqeusts",
        "overall_risk": "HIGH",
        "risk_level": "high",
        "typosquat": {"distance_score": 1, "suspected_target": "requests", "risk_level": "high"},
        "cves": [],
        "sandbox": None,
        "license": {"spdx_id": "MIT", "category": "Permissive", "status": "pass"}
    },
    # vuln-pkg resolved
    # new malicious pkg
    {
        "package_name": "miner-daemon",
        "overall_risk": "CRITICAL",
        "risk_level": "critical",
        "typosquat": None,
        "cves": [],
        "sandbox": {"score": 100, "risk_level": "critical", "evidence": [{"message": "High CPU mining", "level": "critical"}]},
        "license": {"spdx_id": "MIT", "category": "Permissive", "status": "pass"}
    }
]

def test_history_workflow():
    store = JobStore()

    # 1. Register project
    proj = store.get_or_create_project("frontend-app", description="UI Project")
    assert proj["name"] == "frontend-app"

    # 2. List projects
    projects = store.list_projects()
    assert any(p["name"] == "frontend-app" for p in projects)

    # 3. Simulate first scan completed
    store.create_full_scan_job("scan-alpha", project_name="frontend-app")
    store.update_full_scan_job_running("scan-alpha", dependencies={"reqeusts": "1.0", "vuln-pkg": "2.0"}, ecosystem="npm")
    store.complete_full_scan_job("scan-alpha", results=SAMPLE_SCAN_1, dependencies={"reqeusts": "1.0", "vuln-pkg": "2.0"}, ecosystem="npm")

    # 4. Check project scans
    scans_data = store.list_project_scans("frontend-app")
    assert len(scans_data) >= 1
    assert scans_data[0]["id"] == "scan-alpha"
    assert scans_data[0]["overall_risk"] == "CRITICAL"

    # 5. Simulate second scan completed
    store.create_full_scan_job("scan-beta", project_name="frontend-app")
    store.update_full_scan_job_running("scan-beta", dependencies={"reqeusts": "1.0", "miner-daemon": "0.1"}, ecosystem="npm")
    store.complete_full_scan_job("scan-beta", results=SAMPLE_SCAN_2, dependencies={"reqeusts": "1.0", "miner-daemon": "0.1"}, ecosystem="npm")

    # 6. Test Diff with explicit against
    scan_b = store.get_full_scan_job("scan-beta")
    scan_a = store.get_full_scan_job("scan-alpha")
    diff = diff_scans(current=scan_b, previous=scan_a)

    assert diff["scan_id"] == "scan-beta"
    assert diff["against_scan_id"] == "scan-alpha"
    assert diff["summary"]["new_count"] == 1
    assert diff["new"][0]["package_name"] == "miner-daemon"
    assert diff["summary"]["resolved_count"] == 1
    assert diff["resolved"][0]["package_name"] == "vuln-pkg"
    assert diff["summary"]["unchanged_count"] == 1
    assert diff["unchanged"][0]["package_name"] == "reqeusts"

    # 7. Test Diff with auto-detected previous scan
    prev_scan = store.get_latest_project_scan("frontend-app", exclude_scan_id="scan-beta")
    assert prev_scan["id"] == "scan-alpha"
    diff_auto = diff_scans(current=scan_b, previous=prev_scan)
    assert diff_auto["summary"]["new_count"] == 1
    assert diff_auto["new"][0]["package_name"] == "miner-daemon"
