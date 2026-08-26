import httpx

# In-memory cache to prevent redundant API calls
_epss_cache = {}

async def get_epss_score(cve_id: str) -> float:
    """
    Fetches the EPSS (Exploit Prediction Scoring System) score for a given CVE from the FIRST.org API.
    Returns a float representing the probability of exploitation (0.0 to 1.0).
    Returns 0.0 if the CVE is not found or the request fails.
    """
    if not cve_id:
        return 0.0

    if cve_id in _epss_cache:
        return _epss_cache[cve_id]

    try:
        url = f"https://api.first.org/data/v1/epss?cve={cve_id}"
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            
            if response.status_code == 200:
                data = response.json()
                if "data" in data and len(data["data"]) > 0:
                    score = float(data["data"][0].get("epss", 0.0))
                    _epss_cache[cve_id] = score
                    return score
    except Exception as e:
        print(f"Error fetching EPSS for {cve_id}: {e}")

    # Fallback to 0.0 on failure or not found
    _epss_cache[cve_id] = 0.0
    return 0.0
