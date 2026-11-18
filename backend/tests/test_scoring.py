import pytest
from utils.scoring import analyze_typosquat, score_dependencies


def test_analyze_typosquat_exact_match():
    # Exact match should return None
    assert analyze_typosquat("requests", "requests") is None


def test_analyze_typosquat_keyboard_adjacent():
    # u and i are adjacent (distance 1 -> high confidence)
    result = analyze_typosquat("reqiests", "requests")
    assert result is not None
    assert result["suspected_target"] == "requests"
    assert result["distance_score"] == 1
    assert result["risk_level"] == "high"
    assert result["confidence"] == "high"
    assert "Keyboard-adjacent substitution" in result["reasoning"]


def test_analyze_typosquat_adjacent_swap():
    # u and e swapped (Levenshtein distance 2 -> omitted at default max_distance=1,
    # reported as low confidence / review when max_distance=2)
    assert analyze_typosquat("reqeusts", "requests") is None
    result = analyze_typosquat("reqeusts", "requests", max_distance=2)
    assert result is not None
    assert result["distance_score"] == 2
    assert result["risk_level"] == "low"
    assert result["confidence"] == "low"
    assert result["confidence_label"] == "low confidence / review"
    assert "Adjacent character swap" in result["reasoning"]


def test_analyze_typosquat_single_omission():
    # missing s (distance 1 -> high confidence)
    result = analyze_typosquat("request", "requests")
    assert result is not None
    assert result["distance_score"] == 1
    assert result["risk_level"] == "medium"
    assert result["confidence"] == "high"
    assert "Single character omission" in result["reasoning"]


def test_analyze_typosquat_unrelated():
    # Too far apart
    assert analyze_typosquat("django", "requests") is None


def test_score_dependencies():
    top_packages = ["requests", "lodash", "react"]
    deps_to_test = [
        "requests",          # valid exact match
        "reqiests",          # distance 1 high-confidence keyboard-adjacent
        "reqeusts",          # distance 2 swap -> excluded from default high-confidence flags
        "lodahs",            # distance 2 swap -> excluded from default high-confidence flags
        "reactt",            # distance 1 medium risk insertion
        "completely_random", # too far
    ]

    # Default max_distance=1 returns only high-confidence distance-1 flags
    findings = score_dependencies(deps_to_test, top_packages)
    assert len(findings) == 2
    suspects = {f["package_name"]: f for f in findings}

    assert "reqiests" in suspects
    assert suspects["reqiests"]["suspected_target"] == "requests"
    assert suspects["reqiests"]["risk_level"] == "high"
    assert suspects["reqiests"]["confidence"] == "high"

    assert "reactt" in suspects
    assert suspects["reactt"]["suspected_target"] == "react"
    assert suspects["reactt"]["risk_level"] == "medium"
    assert suspects["reactt"]["confidence"] == "high"

    # Explicit max_distance=2 surfaces distance-2 matches as low confidence / review
    review_findings = score_dependencies(deps_to_test, top_packages, max_distance=2)
    assert len(review_findings) == 4
    review_suspects = {f["package_name"]: f for f in review_findings}

    assert review_suspects["reqeusts"]["risk_level"] == "low"
    assert review_suspects["reqeusts"]["confidence"] == "low"
    assert review_suspects["reqeusts"]["confidence_label"] == "low confidence / review"
    assert review_suspects["lodahs"]["risk_level"] == "low"
    assert review_suspects["lodahs"]["confidence"] == "low"
