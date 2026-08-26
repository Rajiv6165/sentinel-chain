import pytest
from utils.aggregator import aggregate_risk_scores

def test_aggregator_safe():
    res = aggregate_risk_scores("safe-pkg", None, [], None)
    assert res["overall_risk"] == "SAFE"

def test_aggregator_typosquat_critical():
    ts = {"risk_level": "medium", "distance_score": 1}
    res = aggregate_risk_scores("bad-pkg", ts, [], None)
    # A medium/high typosquat goes to CRITICAL
    assert res["overall_risk"] == "CRITICAL"

def test_aggregator_typosquat_low():
    ts = {"risk_level": "low", "distance_score": 2}
    res = aggregate_risk_scores("kinda-bad-pkg", ts, [], None)
    # A low typosquat goes to HIGH
    assert res["overall_risk"] == "HIGH"

def test_aggregator_cve_reachable_high_epss():
    cves = [{"cve_id": "CVE-2023-123", "reachability": "REACHABLE", "epss_score": 0.8}]
    res = aggregate_risk_scores("vuln-pkg", None, cves, None)
    assert res["overall_risk"] == "CRITICAL"

def test_aggregator_cve_reachable_low_epss():
    cves = [{"cve_id": "CVE-2023-123", "reachability": "REACHABLE", "epss_score": 0.1}]
    res = aggregate_risk_scores("vuln-pkg", None, cves, None)
    assert res["overall_risk"] == "MEDIUM"

def test_aggregator_cve_unreachable():
    cves = [{"cve_id": "CVE-2023-123", "reachability": "UNREACHABLE", "epss_score": 0.9}]
    res = aggregate_risk_scores("vuln-pkg", None, cves, None)
    assert res["overall_risk"] == "LOW"

def test_aggregator_sandbox_critical():
    sb = {"score": 110, "risk_level": "critical"}
    res = aggregate_risk_scores("mal-pkg", None, [], sb)
    assert res["overall_risk"] == "CRITICAL"

def test_aggregator_sandbox_medium():
    sb = {"score": 35, "risk_level": "medium"}
    res = aggregate_risk_scores("sketchy-pkg", None, [], sb)
    assert res["overall_risk"] == "MEDIUM"

def test_aggregator_all_engines():
    ts = {"risk_level": "low"} # -> HIGH
    cves = [{"reachability": "UNREACHABLE", "epss_score": 0.9}] # -> LOW
    sb = {"score": 110} # -> CRITICAL
    
    res = aggregate_risk_scores("everything-pkg", ts, cves, sb)
    assert res["overall_risk"] == "CRITICAL"
