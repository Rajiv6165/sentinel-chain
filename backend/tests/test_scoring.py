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
    assert suspects["reactt"]["risk_level"] in ("medium", "high")
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


def test_registry_metadata_parasite_detected():
    """Popular-looking malicious package 'loadash' must NOT be cleared."""
    top_packages = ["lodash"]
    findings = score_dependencies(["loadash"], top_packages, max_distance=1)
    assert len(findings) == 1
    f = findings[0]
    assert f["package_name"] == "loadash"
    assert f["suspected_target"] == "lodash"
    assert f["risk_level"] == "high"
    assert f["confidence"] == "high"
    assert "flagged parasite" in f["reasoning"].lower()


def test_registry_metadata_high_adoption_cleared():
    """Legitimate community packages with high adoption like 'safer-buffer' must be cleared."""
    top_packages = ["safe-buffer"]
    findings = score_dependencies(["safer-buffer"], top_packages, max_distance=1)
    assert len(findings) == 0


def test_registry_metadata_precedence_cleared():
    """Packages published before the target (e.g. 'net' vs 'next') cannot be typosquats and must be cleared."""
    top_packages = ["next"]
    findings = score_dependencies(["net"], top_packages, max_distance=1)
    assert len(findings) == 0


def test_registry_cache_offline_loading():
    """Verify registry cache loads offline without network access."""
    from utils.registry import load_registry_cache, get_package_registry_metadata
    cache = load_registry_cache()
    assert len(cache) >= 500
    meta = get_package_registry_metadata("loadash")
    assert meta["exists"] is True
    assert meta["weekly_downloads"] > 10000


def test_registry_metadata_cache_miss_fallback(monkeypatch):
    """When metadata is missing in cache and live fetch unavailable, fall back to distance-only without clearing or downgrading."""
    from utils.registry import get_package_registry_metadata
    import utils.registry as reg_module

    # Test suspect whose metadata is not in cache and network returns None
    suspect = "someunknownsqat"
    target = "someunknownsqar"
    top_packages = [target]

    # Ensure live queries return None (simulating unavailable network / sandbox)
    monkeypatch.setattr(reg_module, "fetch_live_npm", lambda pkg: None)
    monkeypatch.setattr(reg_module, "fetch_live_pypi", lambda pkg: None)

    meta = get_package_registry_metadata(suspect, ecosystem="npm")
    assert meta.get("unavailable") is True
    assert meta.get("exists") is None

    findings = score_dependencies(
        [{"package_name": suspect, "ecosystem": "npm"}],
        top_packages,
        max_distance=1,
        use_registry=True
    )
    assert len(findings) == 1
    f = findings[0]
    assert f["package_name"] == suspect
    assert f["suspected_target"] == target
    assert f["confidence"] == "high"
    assert "registry data unavailable" in f["reasoning"]


def test_registry_metadata_network_failure_fallback(monkeypatch):
    """When a network error/timeout occurs during live lookup, fall back to distance-only and mark unavailable."""
    import urllib.request
    import urllib.error
    import utils.registry as reg_module

    def mock_urlopen(*args, **kwargs):
        raise urllib.error.URLError("Network unreachable")

    monkeypatch.setattr(urllib.request, "urlopen", mock_urlopen)
    monkeypatch.setattr(urllib.request.OpenerDirector, "open", mock_urlopen)

    # Force a package not present in cache
    pkg_meta = reg_module.fetch_live_npm("definitely-not-in-cache-xyz-123")
    assert pkg_meta is None

    meta = reg_module.get_package_registry_metadata("definitely-not-in-cache-xyz-123", ecosystem="npm")
    assert meta["unavailable"] is True
    assert meta["exists"] is None

    top_packages = ["definitely-not-in-cache-xyz-122"]
    findings = score_dependencies(
        [{"package_name": "definitely-not-in-cache-xyz-123", "ecosystem": "npm"}],
        top_packages,
        max_distance=1,
        use_registry=True
    )
    assert len(findings) == 1
    assert "registry data unavailable" in findings[0]["reasoning"]


def test_ecosystem_isolation_urllib_and_fastapi():
    """Verify ecosystem scoping: PyPI malware urllib and fast-api are flagged, while npm corejs and PyPI beautifulsoup are legitimately cleared."""
    top_packages = ["urllib3", "fastapi", "core-js", "beautifulsoup4"]

    # 1. urllib on PyPI is malware targeting urllib3 -> must NOT be cleared by npm's urllib
    pypi_urllib = score_dependencies(
        [{"package_name": "urllib", "ecosystem": "pypi"}],
        top_packages,
        max_distance=1
    )
    assert len(pypi_urllib) == 1
    assert pypi_urllib[0]["package_name"] == "urllib"
    assert pypi_urllib[0]["suspected_target"] == "urllib3"
    assert pypi_urllib[0]["confidence"] == "high"
    assert "quarantined" in pypi_urllib[0]["reasoning"].lower()

    # 2. fast-api on PyPI is malware targeting fastapi -> must NOT be cleared by npm's fast-api
    pypi_fastapi = score_dependencies(
        [{"package_name": "fast-api", "ecosystem": "pypi"}],
        top_packages,
        max_distance=1
    )
    assert len(pypi_fastapi) == 1
    assert pypi_fastapi[0]["package_name"] == "fast-api"
    assert pypi_fastapi[0]["suspected_target"] == "fastapi"
    assert pypi_fastapi[0]["confidence"] == "high"
    assert "quarantined" in pypi_fastapi[0]["reasoning"].lower()

    # 3. corejs on npm legitimately pre-dates core-js on npm -> must be cleared
    npm_corejs = score_dependencies(
        [{"package_name": "corejs", "ecosystem": "npm"}],
        top_packages,
        max_distance=1
    )
    assert len(npm_corejs) == 0

    # 4. beautifulsoup on PyPI legitimately pre-dates beautifulsoup4 on PyPI -> must be cleared
    pypi_bs = score_dependencies(
        [{"package_name": "beautifulsoup", "ecosystem": "pypi"}],
        top_packages,
        max_distance=1
    )
    assert len(pypi_bs) == 0


