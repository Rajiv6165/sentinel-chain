def aggregate_risk_scores(package_name: str, typosquat_finding: dict, cve_reachability_findings: list, sandbox_finding: dict) -> dict:
    """
    Aggregates risk scores from all three engines into one unified risk score for a package.
    
    Formula:
    - Typosquat flagged (risk_level high/medium) -> CRITICAL (active malicious intent)
    - Sandbox score >= 100 -> CRITICAL
    - Sandbox score >= 50 -> HIGH
    - REACHABLE Critical/High CVE OR REACHABLE CVE with high EPSS (>0.5) -> CRITICAL
    - REACHABLE Medium CVE OR REACHABLE CVE with medium EPSS (>0.2) -> HIGH
    - REACHABLE Low CVE -> MEDIUM
    - UNREACHABLE CVE -> LOW
    
    If no findings across all three -> SAFE
    """
    overall_score = 0
    highest_risk = "SAFE"
    
    def update_risk(new_risk):
        nonlocal highest_risk
        risk_levels = {"SAFE": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
        if risk_levels.get(new_risk, 0) > risk_levels.get(highest_risk, 0):
            highest_risk = new_risk

    # 1. Typosquat Check
    if typosquat_finding:
        risk = typosquat_finding.get("risk_level", "low").upper()
        if risk in ["HIGH", "MEDIUM"]:
            # Even a medium typosquat indicates intent, treat as critical for aggregation
            update_risk("CRITICAL")
        elif risk == "LOW":
            update_risk("HIGH")

    # 2. CVE & Reachability Check
    if cve_reachability_findings:
        for cve in cve_reachability_findings:
            reachability = cve.get("reachability", "UNKNOWN").upper()
            epss_score = cve.get("epss_score", 0.0)
            
            if reachability == "REACHABLE":
                if epss_score > 0.5:
                    update_risk("CRITICAL")
                elif epss_score > 0.2:
                    update_risk("HIGH")
                else:
                    update_risk("MEDIUM")
            else:
                # UNREACHABLE or UNKNOWN
                update_risk("LOW")

    # 3. Sandbox Behavior Check
    if sandbox_finding:
        sb_score = sandbox_finding.get("score", 0)
        sb_risk = sandbox_finding.get("risk_level", "low").upper()
        
        if sb_score >= 100 or sb_risk == "CRITICAL":
            update_risk("CRITICAL")
        elif sb_score >= 50 or sb_risk == "HIGH":
            update_risk("HIGH")
        elif sb_score >= 30 or sb_risk == "MEDIUM":
            update_risk("MEDIUM")
        elif sb_score > 0:
            update_risk("LOW")
            
    return {
        "package_name": package_name,
        "overall_risk": highest_risk,
        "typosquat": typosquat_finding,
        "cves": cve_reachability_findings,
        "sandbox": sandbox_finding
    }
