import os
import pytest
import urllib.request
import urllib.error
from unittest.mock import MagicMock, patch

from utils.registry import (
    is_valid_package_name,
    validate_registry_url,
    RestrictedRedirectHandler,
    LookupCounter,
    fetch_live_npm,
    fetch_live_pypi,
    get_package_registry_metadata,
    DEFAULT_MAX_LIVE_LOOKUPS,
    ALLOWED_REGISTRY_HOSTS
)
from utils.scoring import score_dependencies


# ---------------------------------------------------------
# 1. Package Name Validation Tests
# ---------------------------------------------------------

def test_package_name_validation_hostile_names():
    """Hostile names with '..', backslashes, whitespace, and control chars must be rejected."""
    hostile_names = [
        "../x",
        "a/b/../../c",
        "../../etc/passwd",
        "..",
        "../",
        "pkg\\name",
        "foo\\bar",
        "foo bar",
        "foo\tbar",
        "foo\nbar",
        "foo\rbar",
        "foo\x00bar",
        "foo\x1fbar",
        "foo\x7fbar",
        "",
        "a" * 215,  # Exceeds max length of 214
    ]
    for name in hostile_names:
        assert is_valid_package_name(name, "npm") is False, f"Expected npm reject for: {name!r}"
        assert is_valid_package_name(name, "pypi") is False, f"Expected pypi reject for: {name!r}"


def test_package_name_validation_max_length_boundary():
    """Names of length 214 are allowed; 215 are rejected."""
    name_214 = "a" * 214
    name_215 = "a" * 215
    assert is_valid_package_name(name_214, "npm") is True
    assert is_valid_package_name(name_214, "pypi") is True
    assert is_valid_package_name(name_215, "npm") is False
    assert is_valid_package_name(name_215, "pypi") is False


def test_package_name_validation_ecosystems():
    """Valid npm and PyPI package names must pass; invalid formats rejected."""
    # Valid PyPI names
    assert is_valid_package_name("requests", "pypi") is True
    assert is_valid_package_name("urllib3", "pypi") is True
    assert is_valid_package_name("scikit-learn", "pypi") is True
    assert is_valid_package_name("zope.interface", "pypi") is True

    # Invalid PyPI names (no slashes, no leading/trailing hyphen/dot)
    assert is_valid_package_name("@scope/pkg", "pypi") is False
    assert is_valid_package_name("pkg/sub", "pypi") is False
    assert is_valid_package_name("-pkg", "pypi") is False
    assert is_valid_package_name("pkg-", "pypi") is False

    # Valid npm names
    assert is_valid_package_name("lodash", "npm") is True
    assert is_valid_package_name("core-js", "npm") is True
    assert is_valid_package_name("@angular/core", "npm") is True
    assert is_valid_package_name("@types/node", "npm") is True

    # Invalid npm names
    assert is_valid_package_name(".hidden", "npm") is False
    assert is_valid_package_name("_internal", "npm") is False
    assert is_valid_package_name("@.bad/pkg", "npm") is False
    assert is_valid_package_name("@scope/.bad", "npm") is False
    assert is_valid_package_name("@scope/sub/pkg", "npm") is False


# ---------------------------------------------------------
# 2. Scoped Name URL-Encoding Tests
# ---------------------------------------------------------

def test_scoped_name_url_encoding(monkeypatch):
    """Scoped npm package names must have the '/' URL-encoded as '%2F'."""
    requested_urls = []

    class MockOpener:
        def open(self, req, timeout=3.0):
            requested_urls.append(req.full_url)
            # Return dummy json response
            mock_resp = MagicMock()
            mock_resp.read.return_value = b'{"downloads": 100, "time": {"created": "2020-01-01T00:00:00Z"}}'
            mock_resp.__enter__.return_value = mock_resp
            mock_resp.__exit__.return_value = None
            return mock_resp

    import utils.registry as reg_module
    monkeypatch.setattr(reg_module, "get_safe_opener", lambda: MockOpener())

    fetch_live_npm("@my-scope/my-package")

    assert len(requested_urls) == 2
    # Verify both download API and registry URL encode the slash as %2F
    assert "https://api.npmjs.org/downloads/point/last-week/@my-scope%2Fmy-package" in requested_urls
    assert "https://registry.npmjs.org/@my-scope%2Fmy-package" in requested_urls


# ---------------------------------------------------------
# 3. Hostile Names Never Produce a Live Request
# ---------------------------------------------------------

def test_hostile_names_never_produce_request(monkeypatch):
    """Hostile names ('../x', 'a/b/../../c', very long names) must never produce any outbound request."""
    request_attempts = []

    class MockOpener:
        def open(self, req, timeout=3.0):
            request_attempts.append(req.full_url)
            raise AssertionError(f"Outbound request attempted for hostile name: {req.full_url}")

    import utils.registry as reg_module
    monkeypatch.setattr(reg_module, "get_safe_opener", lambda: MockOpener())

    hostile_names = [
        "../x",
        "a/b/../../c",
        "a" * 300,
        "foo\\bar",
        "foo bar",
        "foo\x00bar"
    ]

    for h_name in hostile_names:
        # 1. Direct fetch calls
        assert fetch_live_npm(h_name) is None
        assert fetch_live_pypi(h_name) is None

        # 2. Metadata lookup
        meta = get_package_registry_metadata(h_name, ecosystem="npm")
        assert meta.get("invalid") is True
        assert meta.get("note") == "invalid package name"

    # 3. score_dependencies with hostile names
    top_packages = ["requests", "lodash"]
    findings = score_dependencies(hostile_names, top_packages, max_distance=1)

    # All hostile names must be flagged with note 'invalid package name'
    assert len(findings) == len(hostile_names)
    for f in findings:
        assert f["note"] == "invalid package name"
        assert "invalid package name" in f["reasoning"]

    # Zero outbound HTTP requests must have been made
    assert len(request_attempts) == 0


# ---------------------------------------------------------
# 4. Lookup Cap per Scan Tests
# ---------------------------------------------------------

def test_lookup_cap_per_scan(monkeypatch):
    """Oversized dependency list stays under the cap; lookups beyond cap fall back to distance-only."""
    made_requests = []

    class MockOpener:
        def open(self, req, timeout=3.0):
            made_requests.append(req.full_url)
            mock_resp = MagicMock()
            mock_resp.read.return_value = b'{"downloads": 0, "time": {}}'
            mock_resp.__enter__.return_value = mock_resp
            mock_resp.__exit__.return_value = None
            return mock_resp

    import utils.registry as reg_module
    monkeypatch.setattr(reg_module, "get_safe_opener", lambda: MockOpener())

    # Create 50 synthetic suspect dependencies with Levenshtein distance 1 from 'lodash'
    # (single char substitutions like 'lodasa', 'lodasb', ..., 'lodaah', 'lodabh', ...)
    # None of these are in the offline registry cache
    chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    test_deps = (
        [f"lodas{c}" for c in chars if c != "h"] +
        [f"loda{c}h" for c in chars if c != "s"]
    )[:50]
    top_packages = ["lodash"]

    # Run with a cap of 10 live lookups
    findings = score_dependencies(
        test_deps,
        top_packages,
        max_distance=1,
        ecosystem="npm",
        use_registry=True,
        max_live_lookups=10
    )

    # Total findings must equal 50 (none dropped or lost)
    assert len(findings) == 50

    # Number of live query packages attempted must be exactly 10 (each package may make 2 requests: downloads + registry)
    # Unique package names requested in URLs must be <= 10
    requested_packages = set()
    for url in made_requests:
        for dep in test_deps:
            if dep in url:
                requested_packages.add(dep)
    assert len(requested_packages) <= 10, f"Expected <= 10 live package lookups, got {len(requested_packages)}"

    # Findings beyond the cap of 10 must fall back to distance-only with 'registry data unavailable'
    capped_findings = [f for f in findings if "registry data unavailable" in f["reasoning"]]
    assert len(capped_findings) >= 40, f"Expected >= 40 capped findings, got {len(capped_findings)}"

    # All findings must retain their high confidence and distance-only tier
    for f in findings:
        assert f["confidence"] == "high"
        assert f["suspected_target"] == "lodash"


def test_lookup_counter_thread_safety():
    """LookupCounter must be thread-safe and strictly enforce its limit."""
    import concurrent.futures

    counter = LookupCounter(limit=25)
    results = []

    def try_acquire():
        return counter.acquire()

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(try_acquire) for _ in range(100)]
        results = [f.result() for f in futures]

    assert results.count(True) == 25
    assert results.count(False) == 75
    assert counter.count == 25
    assert counter.remaining == 0


# ---------------------------------------------------------
# 5. Fixed Hosts & Redirect Restrictions Tests
# ---------------------------------------------------------

def test_fixed_allowed_hosts_validation():
    """Only registry.npmjs.org, api.npmjs.org, pypi.org and pypistats.org with HTTPS are allowed."""
    for host in ALLOWED_REGISTRY_HOSTS:
        validate_registry_url(f"https://{host}/some/path")

    # Non-https rejected
    with pytest.raises(ValueError, match="HTTPS only"):
        validate_registry_url("http://registry.npmjs.org/lodash")

    # Disallowed hosts rejected
    with pytest.raises(ValueError, match="Disallowed host"):
        validate_registry_url("https://evil.com/npm/lodash")

    with pytest.raises(ValueError, match="Disallowed host"):
        validate_registry_url("https://169.254.169.254/metadata")

    with pytest.raises(ValueError, match="Disallowed host"):
        validate_registry_url("https://localhost:8000/api")

    # Non-standard ports rejected
    with pytest.raises(ValueError, match="Disallowed port"):
        validate_registry_url("https://registry.npmjs.org:8080/lodash")


def test_restricted_redirect_handler_blocks_unauthorized():
    """RestrictedRedirectHandler must reject redirects to external hosts or non-HTTPS."""
    handler = RestrictedRedirectHandler()
    req = urllib.request.Request("https://pypi.org/pypi/requests/json")

    # Redirect to evil.com rejected
    with pytest.raises(urllib.error.HTTPError, match="Redirect disallowed"):
        handler.redirect_request(req, None, 302, "Found", {}, "https://evil.com/leak")

    # Redirect to http rejected
    with pytest.raises(urllib.error.HTTPError, match="Redirect disallowed"):
        handler.redirect_request(req, None, 302, "Found", {}, "http://pypi.org/insecure")

    # Redirect to internal IP rejected
    with pytest.raises(urllib.error.HTTPError, match="Redirect disallowed"):
        handler.redirect_request(req, None, 302, "Found", {}, "https://127.0.0.1/admin")

    # Redirect within allowed hosts over HTTPS allowed
    new_req = handler.redirect_request(req, None, 301, "Moved Permanently", {}, "https://pypi.org/pypi/requests/json/")
    assert new_req is not None
    assert new_req.full_url == "https://pypi.org/pypi/requests/json/"
