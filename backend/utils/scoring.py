import Levenshtein

QWERTY_MAP = {
    'q': (0,0), 'w': (0,1), 'e': (0,2), 'r': (0,3), 't': (0,4), 'y': (0,5), 'u': (0,6), 'i': (0,7), 'o': (0,8), 'p': (0,9),
    'a': (1,0), 's': (1,1), 'd': (1,2), 'f': (1,3), 'g': (1,4), 'h': (1,5), 'j': (1,6), 'k': (1,7), 'l': (1,8),
    'z': (2,0), 'x': (2,1), 'c': (2,2), 'v': (2,3), 'b': (2,4), 'n': (2,5), 'm': (2,6)
}

def is_keyboard_adjacent(char1: str, char2: str) -> bool:
    """Checks if two characters are adjacent on a QWERTY keyboard."""
    char1 = char1.lower()
    char2 = char2.lower()
    
    if char1 not in QWERTY_MAP or char2 not in QWERTY_MAP:
        return False
        
    r1, c1 = QWERTY_MAP[char1]
    r2, c2 = QWERTY_MAP[char2]
    
    return abs(r1 - r2) <= 1 and abs(c1 - c2) <= 1

def analyze_typosquat(target: str, reference: str) -> dict:
    """
    Analyzes the relationship between a target package name and a reference known-good name.
    Returns a dict with distance score, risk level, and reasoning if a typo is suspected, else None.
    """
    # 1. Exact Match is safe (not a typo of this package)
    if target == reference:
        return None
        
    # 2. Compute Levenshtein distance
    dist = Levenshtein.distance(target, reference)
    
    # Fast paths for non-typos
    if dist > 2:
        return None
        
    reasoning = ""
    risk_level = "low"
    
    # 3. Analyze specific typoes
    
    # Distance 1: Insertion, Deletion, or Substitution
    if dist == 1:
        if len(target) == len(reference):
            # Substitution
            # Find the differing character
            for i in range(len(target)):
                if target[i] != reference[i]:
                    if is_keyboard_adjacent(target[i], reference[i]):
                        reasoning = f"Keyboard-adjacent substitution ('{target[i]}' instead of '{reference[i]}')"
                        risk_level = "high"
                    else:
                        reasoning = f"Single character substitution ('{target[i]}' instead of '{reference[i]}')"
                        risk_level = "medium"
                    break
        elif len(target) > len(reference):
            reasoning = "Single character insertion"
            risk_level = "medium"
        else:
            reasoning = "Single character omission"
            risk_level = "medium"
            
    # Distance 2: Could be a Transposition (swap) or two errors
    elif dist == 2:
        if len(target) == len(reference):
            # Check for transposition (swap of adjacent characters)
            # Find differing indices
            diffs = [i for i in range(len(target)) if target[i] != reference[i]]
            if len(diffs) == 2 and diffs[0] == diffs[1] - 1:
                if target[diffs[0]] == reference[diffs[1]] and target[diffs[1]] == reference[diffs[0]]:
                    reasoning = f"Adjacent character swap ('{target[diffs[0]]}{target[diffs[1]]}' instead of '{reference[diffs[0]]}{reference[diffs[1]]}')"
                    risk_level = "high"
                else:
                    reasoning = "Two character substitutions"
                    risk_level = "medium"
            else:
                 reasoning = "Two character substitutions"
                 risk_level = "medium"
        else:
            reasoning = "Double character insertion/omission/substitution"
            risk_level = "low"

    return {
        "target": target,
        "suspected_target": reference,
        "distance_score": dist,
        "risk_level": risk_level,
        "reasoning": reasoning
    }

def score_dependencies(dependencies: list[str], top_packages: list[str]) -> list[dict]:
    """
    Scores a list of dependencies against a list of known top packages.
    """
    findings = []
    
    for dep in dependencies:
        best_match = None
        lowest_dist = float('inf')
        highest_risk = "low"
        
        # Exact match means it's a valid package in the top list (assuming top list is good)
        if dep in top_packages:
            continue
            
        for ref in top_packages:
            result = analyze_typosquat(dep, ref)
            if result:
                # Prioritize 'high' risk and lowest distance
                if result['distance_score'] < lowest_dist or (result['distance_score'] == lowest_dist and result['risk_level'] == 'high'):
                    best_match = result
                    lowest_dist = result['distance_score']
                    highest_risk = result['risk_level']
                    
        if best_match:
            findings.append({
                "package_name": dep,
                "suspected_target": best_match["suspected_target"],
                "distance_score": best_match["distance_score"],
                "risk_level": best_match["risk_level"],
                "reasoning": best_match["reasoning"]
            })
            
    return findings
