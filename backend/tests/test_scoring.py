import pytest
from utils.scoring import analyze_typosquat, score_dependencies

def test_analyze_typosquat_exact_match():
    # Exact match should return None
    assert analyze_typosquat("requests", "requests") is None

def test_analyze_typosquat_keyboard_adjacent():
    # u and i are adjacent
    result = analyze_typosquat("reqiests", "requests")
    assert result is not None
    assert result["suspected_target"] == "requests"
    assert result["distance_score"] == 1
    assert result["risk_level"] == "high"
    assert "Keyboard-adjacent substitution" in result["reasoning"]

def test_analyze_typosquat_adjacent_swap():
    # u and e swapped
    result = analyze_typosquat("reqeusts", "requests")
    assert result is not None
    assert result["distance_score"] == 2
    assert result["risk_level"] == "high"
    assert "Adjacent character swap" in result["reasoning"]
    
def test_analyze_typosquat_single_omission():
    # missing s
    result = analyze_typosquat("request", "requests")
    assert result is not None
    assert result["distance_score"] == 1
    assert result["risk_level"] == "medium"
    assert "Single character omission" in result["reasoning"]

def test_analyze_typosquat_unrelated():
    # Too far apart
    assert analyze_typosquat("django", "requests") is None
    
def test_score_dependencies():
    top_packages = ["requests", "lodash", "react"]
    deps_to_test = [
        "requests", # valid
        "reqeusts", # high risk swap
        "lodahs",   # high risk swap
        "reactt",   # medium risk insertion
        "completely_random" # should not be flagged (too far from top packages)
    ]
    
    findings = score_dependencies(deps_to_test, top_packages)
    
    assert len(findings) == 3
    
    # We should have findings for reqeusts, lodahs, and reactt
    suspects = {f["package_name"]: f for f in findings}
    
    assert "reqeusts" in suspects
    assert suspects["reqeusts"]["suspected_target"] == "requests"
    assert suspects["reqeusts"]["risk_level"] == "high"
    
    assert "lodahs" in suspects
    assert suspects["lodahs"]["suspected_target"] == "lodash"
    assert suspects["lodahs"]["risk_level"] == "high"
    
    assert "reactt" in suspects
    assert suspects["reactt"]["suspected_target"] == "react"
    assert suspects["reactt"]["risk_level"] == "medium"
