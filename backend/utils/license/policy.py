import yaml
import os

DEFAULT_POLICY = {
    "deny": ["GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later", "AGPL-3.0-only", "AGPL-3.0-or-later"],
    "allow": ["MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "ISC", "Unlicense", "WTFPL"],
    "unknown-license-policy": "warn",
    "project-license": "Proprietary" # Can be used to determine compatibility
}

def load_policy(workspace_dir: str) -> dict:
    policy_path = os.path.join(workspace_dir, ".sentinel-chain", "license-policy.yml")
    if os.path.exists(policy_path):
        try:
            with open(policy_path, "r", encoding="utf-8") as f:
                user_policy = yaml.safe_load(f)
                
            # Merge with defaults
            policy = DEFAULT_POLICY.copy()
            if user_policy:
                if "deny" in user_policy: policy["deny"] = user_policy["deny"]
                if "allow" in user_policy: policy["allow"] = user_policy["allow"]
                if "unknown-license-policy" in user_policy: policy["unknown-license-policy"] = user_policy["unknown-license-policy"]
                if "project-license" in user_policy: policy["project-license"] = user_policy["project-license"]
            return policy
        except Exception as e:
            print(f"Error loading license policy: {e}")
            return DEFAULT_POLICY
    return DEFAULT_POLICY

def evaluate_compliance(spdx_id: str, category: str, policy: dict) -> dict:
    """
    Evaluates a single license against the policy.
    Returns: {"status": "pass" | "warn" | "fail", "reason": "..."}
    """
    status = "pass"
    reason = "License is permitted."
    
    if spdx_id == "UNKNOWN" or category == "Unknown":
        if policy.get("unknown-license-policy") == "fail":
            status = "fail"
            reason = "Unknown license, policy set to fail."
        else:
            status = "warn"
            reason = "Unknown license, compliance cannot be guaranteed."
        return {"status": status, "reason": reason}
        
    # Check if any component in OR/AND expressions violates the policy
    # Simplification: we check the entire expression against deny list first,
    # but practically we should parse. For simplicity, we check if ANY part of an AND is denied,
    # and if ALL parts of an OR are denied.
    
    parts_to_check = []
    if " OR " in spdx_id:
        parts_to_check = [p.strip() for p in spdx_id.split(" OR ")]
        # For OR, it passes if AT LEAST ONE is allowed and not denied
        passed = False
        reasons = []
        for p in parts_to_check:
            if p in policy.get("deny", []):
                reasons.append(f"{p} is denied")
            elif p in policy.get("allow", []):
                passed = True
                reason = f"At least one license ({p}) is permitted."
                break
            elif policy.get("allow"): # If an allowlist exists but p is not in it
                pass # it's implicitly denied if not explicitly allowed and allow list isn't empty, but usually allow is optional
        
        if passed:
            return {"status": "pass", "reason": reason}
        else:
            return {"status": "fail", "reason": f"No license in OR expression is permitted. Denied: {', '.join(reasons)}"}
                
    elif " AND " in spdx_id:
        parts_to_check = [p.strip() for p in spdx_id.split(" AND ")]
    else:
        parts_to_check = [spdx_id]
        
    for p in parts_to_check:
        if p in policy.get("deny", []):
            return {"status": "fail", "reason": f"License {p} is explicitly denied."}
            
        # If project is proprietary, strong copyleft is generally a fail anyway,
        # but the deny list should catch it. We can add a smart check here if needed.
        if policy.get("project-license", "").lower() == "proprietary":
            from .classifier import categorize_license
            cat = categorize_license(p)
            if cat == "Strong Copyleft" and p not in policy.get("allow", []):
                 return {"status": "fail", "reason": f"License {p} is Strong Copyleft, which is typically incompatible with Proprietary projects."}
                 
    return {"status": status, "reason": reason}
