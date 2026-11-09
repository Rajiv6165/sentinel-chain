import json
from typing import Any, Dict, List, Optional, Tuple, Union

def get_finding_fingerprint(finding: dict) -> str:
    """
    Computes a stable fingerprint for a finding.
    Can handle both granular findings (cve, typosquat, license, sandbox)
    and unified package-level findings.
    """
    if not isinstance(finding, dict):
        return str(finding)

    if finding.get("fingerprint"):
        return str(finding["fingerprint"])

    # Granular finding row
    ftype = finding.get("finding_type")
    pkg = finding.get("package_name") or finding.get("package") or ""
    
    if ftype and pkg:
        extra = finding.get("cve_id") or finding.get("title") or finding.get("rule_id") or ""
        return f"{ftype}:{pkg}:{extra}".lower()

    if finding.get("cve_id") and pkg:
        return f"cve:{pkg}:{finding['cve_id']}".lower()

    if pkg:
        return f"pkg:{pkg}".lower()

    if finding.get("id"):
        return f"id:{finding['id']}".lower()

    if finding.get("name"):
        return f"name:{finding['name']}".lower()

    try:
        return json.dumps(finding, sort_keys=True)
    except Exception:
        return str(finding)

def is_active_finding(finding: dict) -> bool:
    """
    Determines whether a dictionary represents an active risk / finding,
    as opposed to a safe / clean dependency.
    """
    if not isinstance(finding, dict):
        return True

    if finding.get("is_resolved") is True:
        return False
    if finding.get("is_finding") is not None:
        return bool(finding["is_finding"])

    # Explicit granular types are always findings
    if finding.get("finding_type") in ("typosquat", "cve", "reachability", "sandbox", "license"):
        return True

    # If it has a CVE ID
    if finding.get("cve_id"):
        return True

    # Elevated risk status
    overall_risk = str(finding.get("overall_risk", "")).upper()
    if overall_risk in ("CRITICAL", "HIGH", "MEDIUM"):
        return True

    risk_level = str(finding.get("risk_level", "")).lower()
    if risk_level in ("critical", "high", "medium"):
        return True

    # Sub-engines
    typo = finding.get("typosquat")
    if typo and isinstance(typo, dict):
        if typo.get("risk_level", "").lower() not in ("none", "safe"):
            return True

    cves = finding.get("cves")
    if cves and isinstance(cves, list) and len(cves) > 0:
        return True

    sandbox = finding.get("sandbox")
    if sandbox and isinstance(sandbox, dict):
        if sandbox.get("score", 0) > 0 or len(sandbox.get("evidence", [])) > 0:
            return True

    lic = finding.get("license")
    if lic and isinstance(lic, dict):
        if lic.get("status") in ("fail", "warn"):
            return True

    # If explicitly marked safe / low with no issues
    if overall_risk in ("SAFE", "LOW") or risk_level in ("safe", "low"):
        return False

    # Test fixtures / items without risk indicators default to being considered findings
    return True

def extract_findings_list(scan_or_findings: Any) -> Tuple[List[dict], Optional[str]]:
    """
    Extracts a list of finding dicts and optional scan ID from various scan formats.
    """
    scan_id = None
    if scan_or_findings is None:
        return [], None

    if isinstance(scan_or_findings, list):
        return scan_or_findings, None

    if isinstance(scan_or_findings, dict):
        scan_id = scan_or_findings.get("id") or scan_or_findings.get("scan_id") or scan_or_findings.get("job_id")
        for key in ("findings", "result", "result_summary"):
            val = scan_or_findings.get(key)
            if isinstance(val, list):
                return val, scan_id
        return [], scan_id

    return [], None

def diff_scans(
    current: Union[dict, list],
    previous: Union[dict, list],
    filter_active_only: bool = True
) -> Dict[str, Any]:
    """
    Compares two scans and returns findings that are new, resolved, or unchanged.

    - new: Active findings present in current scan that were absent (or clean) in previous.
    - resolved: Findings present in previous scan that are absent (or clean) in current.
    - unchanged: Findings present in both scans.
    """
    curr_list, curr_id = extract_findings_list(current)
    prev_list, prev_id = extract_findings_list(previous)

    # Filter for active findings if requested
    if filter_active_only:
        curr_findings = [f for f in curr_list if is_active_finding(f)]
        prev_findings = [f for f in prev_list if is_active_finding(f)]
    else:
        curr_findings = list(curr_list)
        prev_findings = list(prev_list)

    curr_by_fp = {}
    for f in curr_findings:
        fp = get_finding_fingerprint(f)
        curr_by_fp[fp] = f

    prev_by_fp = {}
    for f in prev_findings:
        fp = get_finding_fingerprint(f)
        prev_by_fp[fp] = f

    new_fps = set(curr_by_fp.keys()) - set(prev_by_fp.keys())
    resolved_fps = set(prev_by_fp.keys()) - set(curr_by_fp.keys())
    unchanged_fps = set(curr_by_fp.keys()) & set(prev_by_fp.keys())

    # Deduplicate preserving order
    def dedupe(items):
        seen = set()
        res = []
        for it in items:
            fp = get_finding_fingerprint(it)
            if fp not in seen:
                seen.add(fp)
                res.append(it)
        return res

    new_findings = dedupe([curr_by_fp[fp] for fp in new_fps])
    resolved_findings = dedupe([prev_by_fp[fp] for fp in resolved_fps])
    unchanged_findings = dedupe([curr_by_fp[fp] for fp in unchanged_fps])

    return {
        "scan_id": curr_id,
        "against_scan_id": prev_id,
        "new": new_findings,
        "resolved": resolved_findings,
        "unchanged": unchanged_findings,
        "summary": {
            "new_count": len(new_findings),
            "resolved_count": len(resolved_findings),
            "unchanged_count": len(unchanged_findings),
            "total_current": len(curr_findings),
            "total_previous": len(prev_findings)
        }
    }

def calculate_scan_risk_score(findings: list) -> Tuple[float, str]:
    """
    Computes an aggregate numeric risk score (0.0 to 100.0) and overall risk level
    for a list of package findings.
    """
    if not findings:
        return 0.0, "SAFE"

    critical_count = sum(1 for f in findings if f.get("overall_risk") == "CRITICAL")
    high_count = sum(1 for f in findings if f.get("overall_risk") == "HIGH")
    medium_count = sum(1 for f in findings if f.get("overall_risk") == "MEDIUM")
    low_count = sum(1 for f in findings if f.get("overall_risk") == "LOW")

    if critical_count > 0:
        overall = "CRITICAL"
    elif high_count > 0:
        overall = "HIGH"
    elif medium_count > 0:
        overall = "MEDIUM"
    elif low_count > 0:
        overall = "LOW"
    else:
        overall = "SAFE"

    # Weighted risk score capped at 100
    raw_score = (critical_count * 30.0) + (high_count * 15.0) + (medium_count * 5.0) + (low_count * 1.0)
    score = min(100.0, raw_score)
    return round(score, 1), overall
