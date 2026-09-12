def format_markdown_summary(results: list, scanned_count: int) -> str:
    """
    Format the aggregated results into a Markdown summary for GitHub PR comments.
    """
    if not results:
        return f"## 🛡️ Sentinel-Chain Scan Results\n\n✅ Scanned {scanned_count} dependencies. No risks found!"
        
    critical_count = sum(1 for r in results if r.get("overall_risk") == "CRITICAL")
    high_count = sum(1 for r in results if r.get("overall_risk") == "HIGH")
    medium_count = sum(1 for r in results if r.get("overall_risk") == "MEDIUM")
    low_count = sum(1 for r in results if r.get("overall_risk") == "LOW")
    
    md = [
        "## 🛡️ Sentinel-Chain Scan Results",
        "",
        f"**Dependencies Scanned:** {scanned_count}",
        "",
        "### 📊 Risk Summary",
        f"- 🚨 **CRITICAL**: {critical_count}",
        f"- 🔴 **HIGH**: {high_count}",
        f"- 🟡 **MEDIUM**: {medium_count}",
        f"- 🟢 **LOW/SAFE**: {low_count}",
        "",
        "<details open>" if len(results) <= 10 else "<details>",
        "<summary><strong>Detailed Findings</strong></summary>",
        "",
        "| Package | Overall Risk | Issues Found | Reachability |",
        "|---|---|---|---|"
    ]
    
    for r in sorted(results, key=lambda x: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "SAFE": 4}.get(x.get("overall_risk", "SAFE"), 5)):
        pkg_name = r.get("package_name", "Unknown")
        risk = r.get("overall_risk", "SAFE")
        
        # Determine risk emoji
        risk_emoji = "🟢"
        if risk == "CRITICAL": risk_emoji = "🚨"
        elif risk == "HIGH": risk_emoji = "🔴"
        elif risk == "MEDIUM": risk_emoji = "🟡"
        
        # Gather issues
        issues = []
        if r.get("typosquat"):
            issues.append("Typo-squatting")
        if r.get("cves"):
            issues.append(f"{len(r['cves'])} CVE(s)")
        if r.get("sandbox") and r["sandbox"].get("score", 0) > 0:
            issues.append("Suspicious Behavior")
            
        issue_str = ", ".join(issues) if issues else "None"
        
        # Gather reachability
        reachable_cves = [cve for cve in r.get("cves", []) if cve.get("reachability") == "REACHABLE"]
        reachability_str = f"Yes ({len(reachable_cves)})" if reachable_cves else "No"
        
        md.append(f"| `{pkg_name}` | {risk_emoji} {risk} | {issue_str} | {reachability_str} |")
        
    md.extend([
        "",
        "</details>",
        ""
    ])
    
    # Add LLM narratives if present
    narratives = []
    for r in results:
        if r.get("typosquat") and r["typosquat"].get("narrative"):
            narratives.append(f"**Typosquat ({r['package_name']}):**\n{r['typosquat']['narrative']}\n")
        if r.get("cves"):
            for cve in r["cves"]:
                if cve.get("narrative"):
                    narratives.append(f"**Vulnerability ({r['package_name']} - {cve.get('cve_id')}):**\n{cve['narrative']}\n")
        if r.get("sandbox") and r["sandbox"].get("narrative"):
            narratives.append(f"**Behavior ({r['package_name']}):**\n{r['sandbox']['narrative']}\n")
            
    if narratives:
        md.append("### 🧠 AI Analysis Narratives")
        md.extend(narratives)
        
    return "\n".join(md)
