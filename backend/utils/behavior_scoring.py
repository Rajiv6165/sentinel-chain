from utils.baseline import get_baseline

def analyze_behavior(sandbox_result):
    baseline = get_baseline()
    
    score = 0
    evidence = []
    
    network_calls = sandbox_result.get("network", [])
    fs_diffs = sandbox_result.get("fs_diffs", [])
    strace_logs = sandbox_result.get("strace", "")
    
    # 1. Analyze Network
    suspicious_domains = []
    for call in network_calls:
        domain = call.get("domain", "")
        # Remove port if present
        domain = domain.split(":")[0]
        
        is_trusted = False
        for trusted in baseline["trusted_domains"]:
            if trusted in domain:
                is_trusted = True
                break
                
        if not is_trusted and domain not in suspicious_domains:
            suspicious_domains.append(domain)
            
    if suspicious_domains:
        score += 50
        evidence.append({
            "type": "network",
            "level": "high",
            "message": f"Contacted non-registry domains: {', '.join(suspicious_domains)}"
        })
        
    # 2. Analyze Filesystem
    suspicious_writes = []
    for diff in fs_diffs:
        path = diff.get("Path", "")
        kind = diff.get("Kind", 0) # 0: modify, 1: add, 2: delete
        
        if kind in (0, 1): # Modifying or adding files
            # Check if it writes to critical paths
            for crit in baseline["critical_read_paths"]:
                if crit in path:
                    score += 100
                    evidence.append({
                        "type": "filesystem",
                        "level": "critical",
                        "message": f"Modified critical path: {path}"
                    })
                    break
            
            # Check if it writes outside allowed paths
            is_allowed = False
            for allowed in baseline["allowed_write_paths"]:
                if path.startswith(allowed):
                    is_allowed = True
                    break
                    
            if not is_allowed:
                suspicious_writes.append(path)
                
    if len(suspicious_writes) > 5:
        score += 30
        evidence.append({
            "type": "filesystem",
            "level": "medium",
            "message": f"Unusually high file write count outside expected directories ({len(suspicious_writes)} files)"
        })
        
    # 3. Analyze Strace / Environment
    if "execve" in strace_logs and "curl " in strace_logs:
        score += 40
        evidence.append({
            "type": "process",
            "level": "high",
            "message": "Spawned 'curl' process during installation"
        })
        
    if "execve" in strace_logs and "wget " in strace_logs:
        score += 40
        evidence.append({
            "type": "process",
            "level": "high",
            "message": "Spawned 'wget' process during installation"
        })
        
    # Determine overall risk
    risk_level = "low"
    if score >= 100:
        risk_level = "critical"
    elif score >= 50:
        risk_level = "high"
    elif score >= 30:
        risk_level = "medium"
        
    return {
        "risk_level": risk_level,
        "score": score,
        "evidence": evidence
    }
