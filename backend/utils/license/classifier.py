import re

PERMISSIVE = {"MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "ISC", "Unlicense", "WTFPL"}
WEAK_COPYLEFT = {"LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later", "MPL-2.0", "EPL-2.0"}
STRONG_COPYLEFT = {"GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later", "AGPL-3.0-only", "AGPL-3.0-or-later"}

def normalize_license(raw_license: str) -> str:
    """Normalizes a raw license string to an SPDX identifier."""
    if not raw_license or raw_license.lower() in ("unknown", "none", "null"):
        return "UNKNOWN"
        
    raw = raw_license.lower().strip()
    
    # Handle explicit OR / AND conditions if they are straightforward
    if " or " in raw:
        parts = [p.strip() for p in raw.split(" or ")]
        return " OR ".join(normalize_license(p) for p in parts if p.strip())
    if " and " in raw:
        parts = [p.strip() for p in raw.split(" and ")]
        return " AND ".join(normalize_license(p) for p in parts if p.strip())
        
    # Simplify common strings
    if "mit" in raw: return "MIT"
    if "apache" in raw and "2" in raw: return "Apache-2.0"
    if "bsd" in raw and "3" in raw: return "BSD-3-Clause"
    if "bsd" in raw and "2" in raw: return "BSD-2-Clause"
    if "isc" in raw: return "ISC"
    
    if "agpl" in raw:
        if "3" in raw: return "AGPL-3.0-or-later" if "later" in raw or "+" in raw else "AGPL-3.0-only"
        return "AGPL-3.0-only"
    if "lgpl" in raw:
        if "3" in raw: return "LGPL-3.0-or-later" if "later" in raw or "+" in raw else "LGPL-3.0-only"
        if "2.1" in raw: return "LGPL-2.1-or-later" if "later" in raw or "+" in raw else "LGPL-2.1-only"
        return "LGPL-3.0-only"
    if "gpl" in raw:
        if "3" in raw: return "GPL-3.0-or-later" if "later" in raw or "+" in raw else "GPL-3.0-only"
        if "2" in raw: return "GPL-2.0-or-later" if "later" in raw or "+" in raw else "GPL-2.0-only"
        return "GPL-3.0-only"
        
    if "mpl" in raw and "2" in raw: return "MPL-2.0"
    if "epl" in raw and "2" in raw: return "EPL-2.0"
    if "unlicense" in raw: return "Unlicense"
    if "wtfpl" in raw: return "WTFPL"
    
    # If it is exactly a known identifier, just return it
    for known in PERMISSIVE | WEAK_COPYLEFT | STRONG_COPYLEFT:
        if known.lower() == raw:
            return known

    return "UNKNOWN"

def categorize_license(spdx_id: str) -> str:
    """Categorizes an SPDX license identifier into risk buckets."""
    if spdx_id == "UNKNOWN":
        return "Unknown"
        
    # For complex expressions, we find the "worst" component for AND, 
    # and the "best" component for OR as a simple heuristic, but for now 
    # we'll categorize the components and combine them, or just take the most restrictive.
    if " OR " in spdx_id:
        categories = [categorize_license(p.strip()) for p in spdx_id.split(" OR ")]
        if "Permissive" in categories:
            return "Permissive"
        if "Weak Copyleft" in categories:
            return "Weak Copyleft"
        if "Strong Copyleft" in categories:
            return "Strong Copyleft"
            
    if " AND " in spdx_id:
        categories = [categorize_license(p.strip()) for p in spdx_id.split(" AND ")]
        if "Strong Copyleft" in categories:
            return "Strong Copyleft"
        if "Weak Copyleft" in categories:
            return "Weak Copyleft"
        if "Permissive" in categories:
            return "Permissive"
            
    if spdx_id in PERMISSIVE:
        return "Permissive"
    if spdx_id in WEAK_COPYLEFT:
        return "Weak Copyleft"
    if spdx_id in STRONG_COPYLEFT:
        return "Strong Copyleft"
        
    return "Unknown/Proprietary"
