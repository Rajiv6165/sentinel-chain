import os
import anthropic
import json

_narrative_cache = {}

async def generate_narrative(package_name: str, finding_type: str, evidence: dict) -> str:
    """
    Generates a 2-4 sentence plain-English explanation of the risk for a specific finding.
    Uses Anthropic's Claude API.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return "Anthropic API key not configured. Cannot generate narrative."
        
    # Create cache key
    evidence_str = json.dumps(evidence, sort_keys=True)
    cache_key = f"{package_name}:{finding_type}:{evidence_str}"
    
    if cache_key in _narrative_cache:
        return _narrative_cache[cache_key]
        
    # Construct Prompt
    system_prompt = (
        "You are an expert cybersecurity analyst. Explain in 2-4 plain-English sentences "
        "how an attacker could actually exploit the provided finding, using the specific evidence. "
        "Do not use generic boilerplate. Ground your explanation in the actual evidence provided."
    )
    
    if finding_type == "typosquat":
        prompt = f"The package '{package_name}' was flagged as a Typosquatting risk.\nEvidence: {evidence}"
    elif finding_type == "reachability":
        prompt = f"The package '{package_name}' was flagged for a reachable vulnerability.\nEvidence: {evidence}"
    elif finding_type == "sandbox":
        prompt = f"The package '{package_name}' exhibited suspicious behavior in a sandbox environment.\nEvidence: {evidence}"
    else:
        prompt = f"The package '{package_name}' was flagged with a risk.\nEvidence: {evidence}"
        
    try:
        # Use sync client in thread or use async client
        client = anthropic.AsyncAnthropic(api_key=api_key)
        
        response = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=300,
            temperature=0.3,
            system=system_prompt,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        narrative = response.content[0].text
        _narrative_cache[cache_key] = narrative
        return narrative
        
    except Exception as e:
        print(f"Failed to generate narrative for {package_name}: {e}")
        return "Failed to generate AI narrative due to an API error."
