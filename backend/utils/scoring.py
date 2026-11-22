import Levenshtein
from typing import Optional, Dict, Any, List
from utils.registry import get_package_registry_metadata

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


def evaluate_registry_signals(
    suspect: str,
    target: str,
    distance: int,
    current_risk: str,
    current_confidence: str,
    current_confidence_label: str
) -> Optional[Dict[str, Any]]:
    """
    Evaluates registry metadata (npm & PyPI weekly downloads, publication dates)
    for suspect and target packages to reduce false positives without tuning
    thresholds to positive benchmark samples.

    General Reasoning Rules:
    1. Precedence (Temporal Causality): If suspect was published before target,
       it cannot mathematically be a typosquat of that target -> CLEAR.
    2. High Adoption Community Package: If suspect has >= 10,000 weekly downloads
       and is >= 730 days old (2 years):
       - Anti-Parasite Check: If target has >= 100,000 weekly downloads and suspect
         has < 50,000 downloads and suspect download ratio is < 0.5% (0.005) of target
         and suspect was published AFTER target, suspect is a parasitic squatter
         riding on target's typo traffic (e.g. 'loadash' vs 'lodash') -> RETAIN.
       - Otherwise: -> CLEAR (legitimate independent package).
    3. Moderate Adoption / Longevity: If suspect has >= 1,000 weekly downloads or
       is >= 365 days old (and not a parasite) -> DOWNGRADE to low confidence / review.
    4. New & Low Adoption: If suspect is new (< 180 days or unrecorded) and has < 1,000
       weekly downloads, or does not exist / was unpublished / quarantined by registry ->
       RETAIN high risk if distance 1, or ESCALATE to high risk if distance 2.
    """
    suspect_meta = get_package_registry_metadata(suspect)
    target_meta = get_package_registry_metadata(target)

    suspect_exists = suspect_meta.get("exists", False)
    suspect_dl = suspect_meta.get("weekly_downloads", 0) or 0
    suspect_age = suspect_meta.get("age_days")
    suspect_created = suspect_meta.get("created_at")

    target_exists = target_meta.get("exists", False)
    target_dl = target_meta.get("weekly_downloads", 0) or 0
    target_age = target_meta.get("age_days")
    target_created = target_meta.get("created_at")

    # If suspect does not exist on registry (404 / unpublished / security takedown) -> Keep tier
    if not suspect_exists:
        return {
            "action": "keep",
            "risk_level": current_risk,
            "confidence": current_confidence,
            "confidence_label": current_confidence_label,
            "note": "Registry: unpublished or quarantined package"
        }

    # Rule 1: Temporal Precedence (Causality)
    # A package published before the target cannot be a typosquat of that target
    if suspect_created and target_created and suspect_created < target_created:
        return None
    if suspect_age is not None and target_age is not None and suspect_age > (target_age + 30):
        return None

    # Anti-parasite check: Does suspect siphon traffic from an ultra-popular target?
    is_parasite = False
    ratio = 0.0
    if target_dl >= 100000 and suspect_dl < 50000:
        ratio = suspect_dl / target_dl
        if ratio < 0.005:
            # Suspect was published after target and download ratio is negligible
            if (suspect_created and target_created and suspect_created > target_created) or (
                suspect_age is not None and target_age is not None and suspect_age < target_age
            ):
                is_parasite = True

    # Rule 2: High Adoption Community Package (Non-Parasitic)
    if not is_parasite and suspect_dl >= 10000 and (suspect_age is not None and suspect_age >= 730):
        return None

    # If parasite: Keep high risk, never clear or downgrade
    if is_parasite:
        return {
            "action": "keep",
            "risk_level": "high",
            "confidence": "high",
            "confidence_label": "high confidence",
            "note": f"Registry: flagged parasite ({suspect_dl:,} weekly dl vs target {target_dl:,} dl, {ratio:.3%})"
        }

    # Rule 3: Moderate Adoption / Established Library (Downgrade to Review)
    if suspect_dl >= 1000 or (suspect_age is not None and suspect_age >= 365):
        return {
            "action": "downgrade",
            "risk_level": "low",
            "confidence": "low",
            "confidence_label": "low confidence / review",
            "note": f"Registry: downgraded to review ({suspect_dl:,} weekly dl, age {suspect_age or 0}d)"
        }

    # Rule 4: New (< 180 days) & Low Adoption (< 1,000 dl) -> Retain tier with high risk note
    is_new_and_low = (suspect_age is None or suspect_age < 180) and suspect_dl < 1000
    if is_new_and_low:
        return {
            "action": "keep",
            "risk_level": current_risk,
            "confidence": current_confidence,
            "confidence_label": current_confidence_label,
            "note": f"Registry: high risk new/low-download package ({suspect_dl} dl, age {suspect_age or 0}d)"
        }

    return {
        "action": "keep",
        "risk_level": current_risk,
        "confidence": current_confidence,
        "confidence_label": current_confidence_label,
        "note": ""
    }


def score_dependencies(
    dependencies: list[str],
    top_packages: list[str],
    max_distance: int = DEFAULT_MAX_DISTANCE,
    use_registry: bool = True
) -> list[dict]:
    """
    Scores a list of dependencies against a list of known top packages.
    Defaults to max_distance=1 for high-confidence flags.
    When use_registry=True (default), applies registry metadata heuristics to
    filter out legitimate community packages and flag parasitic typosquats.
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
            risk_level = best_match["risk_level"]
            confidence = best_match["confidence"]
            confidence_label = best_match["confidence_label"]
            reasoning = best_match["reasoning"]

            if use_registry:
                verdict = evaluate_registry_signals(
                    suspect=dep,
                    target=best_match["suspected_target"],
                    distance=best_match["distance_score"],
                    current_risk=risk_level,
                    current_confidence=confidence,
                    current_confidence_label=confidence_label
                )
                if verdict is None:
                    # Cleared by registry signals (temporal precedence or established adoption)
                    continue

                risk_level = verdict["risk_level"]
                confidence = verdict["confidence"]
                confidence_label = verdict["confidence_label"]
                if verdict.get("note"):
                    reasoning = f"{reasoning} [{verdict['note']}]"

            findings.append({
                "package_name": dep,
                "suspected_target": best_match["suspected_target"],
                "distance_score": best_match["distance_score"],
                "risk_level": risk_level,
                "confidence": confidence,
                "confidence_label": confidence_label,
                "reasoning": reasoning
            })

    return findings
