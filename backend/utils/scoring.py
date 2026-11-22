import Levenshtein

DEFAULT_MAX_DISTANCE = 1

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


def analyze_typosquat(target: str, reference: str, max_distance: int = DEFAULT_MAX_DISTANCE) -> dict:
    """
    Analyzes the relationship between a target package name and a reference known-good name.
    Returns a dict with distance score, risk level, confidence, and reasoning if a typo is suspected, else None.

    Default max_distance is 1 (high-confidence flags).
    Distance-2 matches (when requested via max_distance >= 2) are reported as 'low confidence / review'
    with risk_level='low' rather than critical.
    """
    # 1. Exact Match is safe (not a typo of this package)
    if target == reference:
        return None

    # 2. Compute Levenshtein distance
    dist = Levenshtein.distance(target, reference)

    # Fast paths for non-typos
    if dist > max_distance:
        return None

    reasoning = ""
    risk_level = "low"
    confidence = "low"
    confidence_label = "low confidence / review"

    # 3. Analyze specific typos

    # Distance 1: High-confidence Insertion, Deletion, or Substitution
    if dist == 1:
        confidence = "high"
        confidence_label = "high confidence"
        if len(target) == len(reference):
            # Substitution
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

    # Distance 2: Low confidence / review (never critical)
    elif dist == 2:
        confidence = "low"
        confidence_label = "low confidence / review"
        risk_level = "low"
        if len(target) == len(reference):
            diffs = [i for i in range(len(target)) if target[i] != reference[i]]
            if len(diffs) == 2 and diffs[0] == diffs[1] - 1:
                if target[diffs[0]] == reference[diffs[1]] and target[diffs[1]] == reference[diffs[0]]:
                    reasoning = (
                        f"Adjacent character swap ('{target[diffs[0]]}{target[diffs[1]]}' instead of "
                        f"'{reference[diffs[0]]}{reference[diffs[1]]}') [low confidence / review]"
                    )
                else:
                    reasoning = "Two character substitutions [low confidence / review]"
            else:
                reasoning = "Two character substitutions [low confidence / review]"
        else:
            reasoning = "Double character insertion/omission/substitution [low confidence / review]"
    elif dist == 3:
        confidence = "low"
        confidence_label = "low confidence / review"
        risk_level = "low"
        reasoning = "Three character distance variation [low confidence / review]"
    else:
        confidence = "low"
        confidence_label = "low confidence / review"
        risk_level = "low"
        reasoning = f"Distance {dist} variation [low confidence / review]"

    return {
        "target": target,
        "suspected_target": reference,
        "distance_score": dist,
        "risk_level": risk_level,
        "confidence": confidence,
        "confidence_label": confidence_label,
        "reasoning": reasoning
    }


def score_dependencies(dependencies: list[str], top_packages: list[str], max_distance: int = DEFAULT_MAX_DISTANCE) -> list[dict]:
    """
    Scores a list of dependencies against a list of known top packages.
    Defaults to max_distance=1 for high-confidence flags.
    """
    findings = []
    top_set = set(top_packages)

    for dep in dependencies:
        best_match = None
        lowest_dist = float('inf')

        # Exact match means it's a valid package in the top list
        if dep in top_set:
            continue

        len_dep = len(dep)
        for ref in top_packages:
            if abs(len_dep - len(ref)) > max_distance:
                continue

            result = analyze_typosquat(dep, ref, max_distance=max_distance)
            if result:
                # Prioritize lowest distance and 'high' risk
                if result['distance_score'] < lowest_dist or (
                    result['distance_score'] == lowest_dist and result['risk_level'] == 'high'
                ):
                    best_match = result
                    lowest_dist = result['distance_score']

        if best_match:
            findings.append({
                "package_name": dep,
                "suspected_target": best_match["suspected_target"],
                "distance_score": best_match["distance_score"],
                "risk_level": best_match["risk_level"],
                "confidence": best_match["confidence"],
                "confidence_label": best_match["confidence_label"],
                "reasoning": best_match["reasoning"]
            })

    return findings
