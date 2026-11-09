import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.diff import diff_scans, calculate_scan_risk_score, is_active_finding, get_finding_fingerprint

# Fixture Scans
SCAN_BASELINE = [
    {
        "package_name": "reqeusts",
        "overall_risk": "HIGH",
        "risk_level": "high",
        "typosquat": {
            "distance_score": 1,
            "suspected_target": "requests",
            "risk_level": "high"
        },
        "cves": [],
        "sandbox": None,
        "license": {"spdx_id": "MIT", "status": "pass"}
    },
    {
        "package_name": "vulnerable-lib",
        "overall_risk": "CRITICAL",
        "risk_level": "critical",
        "typosquat": None,
        "cves": [
            {
                "cve_id": "CVE-2023-1234",
                "reachability": "REACHABLE",
                "epss_score": 0.85
            }
        ],
        "sandbox": None,
        "license": {"spdx_id": "Apache-2.0", "status": "pass"}
    },
    {
        "package_name": "express",
        "overall_risk": "SAFE",
        "risk_level": "safe",
        "typosquat": None,
        "cves": [],
        "sandbox": None,
        "license": {"spdx_id": "MIT", "status": "pass"}
    }
]

SCAN_SUBSEQUENT = [
    # reqeusts is still present (unchanged)
    {
        "package_name": "reqeusts",
        "overall_risk": "HIGH",
        "risk_level": "high",
        "typosquat": {
            "distance_score": 1,
            "suspected_target": "requests",
            "risk_level": "high"
        },
        "cves": [],
        "sandbox": None,
        "license": {"spdx_id": "MIT", "status": "pass"}
    },
    # vulnerable-lib is FIXED / removed (resolved)
    # express is still safe
    {
        "package_name": "express",
        "overall_risk": "SAFE",
        "risk_level": "safe",
        "typosquat": None,
        "cves": [],
        "sandbox": None,
        "license": {"spdx_id": "MIT", "status": "pass"}
    },
    # new malicious package introduced (new)
    {
        "package_name": "evil-logger",
        "overall_risk": "CRITICAL",
        "risk_level": "critical",
        "typosquat": None,
        "cves": [],
        "sandbox": {
            "score": 95,
            "risk_level": "critical",
            "evidence": [{"message": "Opens reverse shell on port 4444", "level": "critical"}]
        },
        "license": {"spdx_id": "MIT", "status": "pass"}
    }
]

def test_diff_new_resolved_unchanged():
    diff = diff_scans(current=SCAN_SUBSEQUENT, previous=SCAN_BASELINE)

    # Check new
    assert diff["summary"]["new_count"] == 1
    assert len(diff["new"]) == 1
    assert diff["new"][0]["package_name"] == "evil-logger"

    # Check resolved
    assert diff["summary"]["resolved_count"] == 1
    assert len(diff["resolved"]) == 1
    assert diff["resolved"][0]["package_name"] == "vulnerable-lib"

    # Check unchanged
    assert diff["summary"]["unchanged_count"] == 1
    assert len(diff["unchanged"]) == 1
    assert diff["unchanged"][0]["package_name"] == "reqeusts"

    # express should not be in any list because it is SAFE
    all_packages = [f["package_name"] for f in diff["new"] + diff["resolved"] + diff["unchanged"]]
    assert "express" not in all_packages

def test_diff_identical_scans():
    diff = diff_scans(current=SCAN_BASELINE, previous=SCAN_BASELINE)

    assert diff["summary"]["new_count"] == 0
    assert diff["summary"]["resolved_count"] == 0
    assert diff["summary"]["unchanged_count"] == 2  # reqeusts and vulnerable-lib
    assert len(diff["new"]) == 0
    assert len(diff["resolved"]) == 0
    assert len(diff["unchanged"]) == 2

def test_diff_all_resolved():
    clean_scan = [
        {"package_name": "reqeusts", "overall_risk": "SAFE", "license": {"status": "pass"}},
        {"package_name": "express", "overall_risk": "SAFE", "license": {"status": "pass"}}
    ]

    diff = diff_scans(current=clean_scan, previous=SCAN_BASELINE)

    assert diff["summary"]["new_count"] == 0
    assert diff["summary"]["resolved_count"] == 2
    assert diff["summary"]["unchanged_count"] == 0
    resolved_names = {f["package_name"] for f in diff["resolved"]}
    assert resolved_names == {"reqeusts", "vulnerable-lib"}

def test_diff_fresh_initial_scan():
    diff = diff_scans(current=SCAN_BASELINE, previous=[])

    assert diff["summary"]["new_count"] == 2
    assert diff["summary"]["resolved_count"] == 0
    assert diff["summary"]["unchanged_count"] == 0
    new_names = {f["package_name"] for f in diff["new"]}
    assert new_names == {"reqeusts", "vulnerable-lib"}

def test_diff_with_scan_dict_objects():
    scan_a = {
        "id": "scan-100",
        "result": SCAN_BASELINE
    }
    scan_b = {
        "id": "scan-101",
        "result": SCAN_SUBSEQUENT
    }

    diff = diff_scans(current=scan_b, previous=scan_a)

    assert diff["scan_id"] == "scan-101"
    assert diff["against_scan_id"] == "scan-100"
    assert diff["summary"]["new_count"] == 1
    assert diff["summary"]["resolved_count"] == 1
    assert diff["summary"]["unchanged_count"] == 1

def test_diff_license_policy_violation():
    scan_prev = [
        {
            "package_name": "my-pkg",
            "overall_risk": "SAFE",
            "license": {"spdx_id": "MIT", "status": "pass"}
        }
    ]
    scan_curr = [
        {
            "package_name": "my-pkg",
            "overall_risk": "CRITICAL",
            "license": {"spdx_id": "AGPL-3.0", "status": "fail", "reason": "Disallowed AGPL"}
        }
    ]

    diff = diff_scans(current=scan_curr, previous=scan_prev)

    assert diff["summary"]["new_count"] == 1
    assert diff["new"][0]["package_name"] == "my-pkg"
    assert diff["summary"]["resolved_count"] == 0

def test_calculate_scan_risk_score():
    # Empty
    score, risk = calculate_scan_risk_score([])
    assert score == 0.0
    assert risk == "SAFE"

    # Only safe
    score, risk = calculate_scan_risk_score([{"overall_risk": "SAFE"}])
    assert score == 0.0
    assert risk == "SAFE"

    # 1 Medium
    score, risk = calculate_scan_risk_score([{"overall_risk": "MEDIUM"}])
    assert score == 5.0
    assert risk == "MEDIUM"

    # 1 High + 1 Medium
    score, risk = calculate_scan_risk_score([{"overall_risk": "HIGH"}, {"overall_risk": "MEDIUM"}])
    assert score == 20.0
    assert risk == "HIGH"

    # 2 Critical + 1 High
    score, risk = calculate_scan_risk_score([
        {"overall_risk": "CRITICAL"},
        {"overall_risk": "CRITICAL"},
        {"overall_risk": "HIGH"}
    ])
    assert score == 75.0
    assert risk == "CRITICAL"

