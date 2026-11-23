import os
import re
import json
import threading
import urllib.request
import urllib.error
import urllib.parse
from typing import Optional, Dict, Any
from datetime import datetime, timezone

CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "registry_cache.json")

_CACHE: Optional[Dict[str, Any]] = None

# Allowed outbound registry hosts (strictly HTTPS only, fixed domains)
ALLOWED_REGISTRY_HOSTS = frozenset({
    "registry.npmjs.org",
    "api.npmjs.org",
    "pypi.org",
    "pypistats.org"
})
REGISTRY_TIMEOUT: float = 3.0
DEFAULT_MAX_LIVE_LOOKUPS: int = int(os.environ.get("MAX_LIVE_LOOKUPS", "40"))
DEFAULT_MAX_CONCURRENCY: int = int(os.environ.get("MAX_REGISTRY_CONCURRENCY", "5"))

_CONCURRENCY_SEMAPHORE = threading.BoundedSemaphore(DEFAULT_MAX_CONCURRENCY)

# Package name validation regexes
# PyPI (PEP 508 / PEP 426): alphanumeric start/end, with ., -, _ in between
PYPI_NAME_REGEX = re.compile(r"^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9])$")
# npm: unscoped [a-z0-9-._~] not starting with . or _; scoped @scope/name
NPM_UNSCOPED_REGEX = re.compile(r"^[a-zA-Z0-9-~][a-zA-Z0-9-._~]*$")
NPM_SCOPED_REGEX = re.compile(r"^@[a-zA-Z0-9-~][a-zA-Z0-9-._~]*/[a-zA-Z0-9-~][a-zA-Z0-9-._~]*$")


def is_valid_package_name(pkg: str, ecosystem: str = "npm") -> bool:
    """
    Validates package names before any outbound request.
    - Max length 214
    - Rejects anything with '..', backslashes, whitespace, or control characters.
    - Matches ecosystem-specific regexes for npm and PyPI.
    """
    if not pkg or not isinstance(pkg, str):
        return False
    if len(pkg) > 214 or len(pkg) == 0:
        return False
    if ".." in pkg or "\\" in pkg:
        return False
    if any(c.isspace() for c in pkg):
        return False
    if any(ord(c) < 32 or ord(c) == 127 for c in pkg):
        return False

    eco = (ecosystem or "npm").lower()
    if eco == "pypi":
        if "/" in pkg:
            return False
        return bool(PYPI_NAME_REGEX.match(pkg))
    else:  # npm
        if pkg.startswith("@"):
            parts = pkg[1:].split("/")
            if len(parts) != 2:
                return False
            scope, name = parts
            if not scope or not name:
                return False
            if scope.startswith((".", "_")) or name.startswith((".", "_")):
                return False
            return bool(NPM_SCOPED_REGEX.match(pkg))
        else:
            if "/" in pkg or pkg.startswith((".", "_")):
                return False
            return bool(NPM_UNSCOPED_REGEX.match(pkg))


def validate_registry_url(url: str) -> None:
    """Ensures outbound request uses HTTPS and targets strictly allowed registry hosts."""
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme.lower() != "https":
        raise ValueError(f"Disallowed scheme: {parsed.scheme} (HTTPS only)")
    hostname = (parsed.hostname or "").lower()
    if hostname not in ALLOWED_REGISTRY_HOSTS:
        raise ValueError(f"Disallowed host: {hostname}")
    if parsed.port not in (None, 443):
        raise ValueError(f"Disallowed port: {parsed.port}")


class RestrictedRedirectHandler(urllib.request.HTTPRedirectHandler):
    """
    HTTP redirect handler that enforces:
    1. Scheme must remain HTTPS only.
    2. Target host must be in ALLOWED_REGISTRY_HOSTS.
    3. Redirects to any other host or non-https are rejected by raising HTTPError.
    """
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        try:
            validate_registry_url(newurl)
        except ValueError as e:
            raise urllib.error.HTTPError(
                newurl, code, f"Redirect disallowed by security policy: {e}", headers, fp
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_SAFE_OPENER: Optional[urllib.request.OpenerDirector] = None


def get_safe_opener() -> urllib.request.OpenerDirector:
    global _SAFE_OPENER
    if _SAFE_OPENER is None:
        _SAFE_OPENER = urllib.request.build_opener(RestrictedRedirectHandler())
    return _SAFE_OPENER


class LookupCounter:
    """Thread-safe counter for capping live registry lookups per scan."""
    def __init__(self, limit: int = DEFAULT_MAX_LIVE_LOOKUPS):
        self.limit = max(0, limit)
        self.count = 0
        self._lock = threading.Lock()

    def acquire(self) -> bool:
        """Attempts to claim one live lookup budget. Returns True if granted, False if capped."""
        with self._lock:
            if self.count < self.limit:
                self.count += 1
                return True
            return False

    @property
    def remaining(self) -> int:
        with self._lock:
            return max(0, self.limit - self.count)


def load_registry_cache(cache_path: Optional[str] = None) -> Dict[str, Any]:
    """Loads offline cached registry metadata to ensure deterministic, offline benchmark runs."""
    global _CACHE
    if _CACHE is not None and cache_path is None:
        return _CACHE

    path = cache_path or CACHE_PATH
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                _CACHE = data.get("packages", data)
                return _CACHE
        except Exception as e:
            print(f"Warning: Failed to load registry cache from {path}: {e}")
            _CACHE = {}
            return _CACHE
    _CACHE = {}
    return _CACHE


def fetch_live_npm(pkg: str) -> Optional[Dict[str, Any]]:
    """Fetches package metadata from npm registry and npm download stats API with security hardening."""
    if not is_valid_package_name(pkg, "npm"):
        return None

    # URL-encode scoped package names (e.g. @scope/name -> @scope%2Fname)
    encoded_pkg = urllib.parse.quote(pkg, safe="@")
    opener = get_safe_opener()
    weekly_dl = 0

    try:
        dl_url = f"https://api.npmjs.org/downloads/point/last-week/{encoded_pkg}"
        validate_registry_url(dl_url)
        req_dl = urllib.request.Request(dl_url, headers={"User-Agent": "Sentinel-Chain/1.0"})
        if _CONCURRENCY_SEMAPHORE.acquire(timeout=REGISTRY_TIMEOUT):
            try:
                with opener.open(req_dl, timeout=REGISTRY_TIMEOUT) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    weekly_dl = data.get("downloads", 0)
            except Exception:
                weekly_dl = 0
            finally:
                _CONCURRENCY_SEMAPHORE.release()
        else:
            return None

        reg_url = f"https://registry.npmjs.org/{encoded_pkg}"
        validate_registry_url(reg_url)
        req_reg = urllib.request.Request(reg_url, headers={"User-Agent": "Sentinel-Chain/1.0"})
        if _CONCURRENCY_SEMAPHORE.acquire(timeout=REGISTRY_TIMEOUT):
            try:
                with opener.open(req_reg, timeout=REGISTRY_TIMEOUT) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    created_at = data.get("time", {}).get("created")
                    age_days = None
                    if created_at:
                        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                        age_days = (datetime.now(timezone.utc) - dt).days

                    return {
                        "exists": True,
                        "ecosystem": "npm",
                        "package_name": pkg,
                        "created_at": created_at,
                        "age_days": age_days,
                        "weekly_downloads": weekly_dl
                    }
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return {
                        "exists": False,
                        "ecosystem": "npm",
                        "package_name": pkg,
                        "created_at": None,
                        "age_days": None,
                        "weekly_downloads": 0
                    }
            except Exception:
                pass
            finally:
                _CONCURRENCY_SEMAPHORE.release()
        else:
            return None
    except Exception:
        pass
    return None


def fetch_live_pypi(pkg: str) -> Optional[Dict[str, Any]]:
    """Fetches package metadata from PyPI JSON API and pypistats.org with security hardening."""
    if not is_valid_package_name(pkg, "pypi"):
        return None

    encoded_pkg = urllib.parse.quote(pkg)
    opener = get_safe_opener()

    try:
        url = f"https://pypi.org/pypi/{encoded_pkg}/json"
        validate_registry_url(url)
        req = urllib.request.Request(url, headers={"User-Agent": "Sentinel-Chain/1.0"})
        if _CONCURRENCY_SEMAPHORE.acquire(timeout=REGISTRY_TIMEOUT):
            try:
                with opener.open(req, timeout=REGISTRY_TIMEOUT) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    releases = data.get("releases", {})
                    earliest_upload = None
                    for ver, files in releases.items():
                        for f in files:
                            up = f.get("upload_time_iso_8601")
                            if up and (earliest_upload is None or up < earliest_upload):
                                earliest_upload = up

                    age_days = None
                    if earliest_upload:
                        dt = datetime.fromisoformat(earliest_upload.replace("Z", "+00:00"))
                        age_days = (datetime.now(timezone.utc) - dt).days

                    weekly_dl = 0
                    try:
                        purl = f"https://pypistats.org/api/packages/{encoded_pkg}/recent"
                        validate_registry_url(purl)
                        preq = urllib.request.Request(purl, headers={"User-Agent": "Sentinel-Chain/1.0"})
                        with opener.open(preq, timeout=REGISTRY_TIMEOUT) as presp:
                            pdata = json.loads(presp.read().decode("utf-8"))
                            weekly_dl = pdata.get("data", {}).get("last_week", 0) or 0
                    except Exception:
                        pass

                    return {
                        "exists": True,
                        "ecosystem": "pypi",
                        "package_name": pkg,
                        "created_at": earliest_upload,
                        "age_days": age_days,
                        "weekly_downloads": weekly_dl
                    }
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return {
                        "exists": False,
                        "ecosystem": "pypi",
                        "package_name": pkg,
                        "created_at": None,
                        "age_days": None,
                        "weekly_downloads": 0
                    }
            except Exception:
                pass
            finally:
                _CONCURRENCY_SEMAPHORE.release()
        else:
            return None
    except Exception:
        pass
    return None


def get_package_registry_metadata(
    pkg: str,
    ecosystem: Optional[str] = None,
    lookup_counter: Optional[LookupCounter] = None
) -> Dict[str, Any]:
    """
    Returns registry metadata for a package scoped strictly to its ecosystem ('npm' or 'pypi'):
    - exists: bool or None (None indicates metadata unavailable due to cache miss/network error)
    - unavailable: bool (True when metadata could not be retrieved from registry or cache)
    - ecosystem: 'npm' or 'pypi'
    - package_name: str
    - weekly_downloads: int
    - age_days: Optional[int]
    - created_at: Optional[str]

    Cache lookup uses (ecosystem, package_name) compound keys (e.g. 'npm:lodash', 'pypi:requests').
    When metadata is missing (cache miss, network error, rate limit, timeout, lookup cap), returns
    unavailable=True and exists=None so callers never clear or downgrade matches.
    """
    cache = load_registry_cache()
    if ":" in pkg:
        parts = pkg.split(":", 1)
        eco = parts[0].lower()
        pkg_name = parts[1]
    else:
        eco = (ecosystem or "npm").lower()
        pkg_name = pkg
    key = f"{eco}:{pkg_name}"

    # 1. Lookup by exact (ecosystem, package_name) compound key
    if key in cache:
        rec = dict(cache[key])
        rec["ecosystem"] = eco
        rec["package_name"] = pkg_name
        return rec

    # 2. Backward compatibility fallback for un-prefixed cache entries
    if pkg_name in cache and isinstance(cache[pkg_name], dict):
        rec_eco = cache[pkg_name].get("ecosystem")
        if rec_eco in (eco, "both"):
            rec = dict(cache[pkg_name])
            rec["ecosystem"] = eco
            rec["package_name"] = pkg_name
            return rec

    # 3. Validate name: if invalid, never make an outbound request
    if not is_valid_package_name(pkg_name, eco):
        return {
            "exists": False,
            "invalid": True,
            "unavailable": False,
            "ecosystem": eco,
            "package_name": pkg_name,
            "created_at": None,
            "age_days": None,
            "weekly_downloads": 0,
            "note": "invalid package name"
        }

    # 4. Offline mode check (benchmarks / hermetic tests)
    if os.environ.get("SENTINEL_OFFLINE") == "1":
        return {
            "exists": None,
            "unavailable": True,
            "ecosystem": eco,
            "package_name": pkg_name,
            "created_at": None,
            "age_days": None,
            "weekly_downloads": 0
        }

    # 5. Cap live lookups per scan (only for flagged non-exact matches that miss the cache)
    if lookup_counter is not None and not lookup_counter.acquire():
        return {
            "exists": None,
            "unavailable": True,
            "ecosystem": eco,
            "package_name": pkg_name,
            "created_at": None,
            "age_days": None,
            "weekly_downloads": 0,
            "budget_exhausted": True
        }

    # 6. Live query if network allows and not in offline cache
    live_meta = None
    if eco == "npm":
        live_meta = fetch_live_npm(pkg_name)
    elif eco == "pypi":
        live_meta = fetch_live_pypi(pkg_name)

    if live_meta is not None:
        return live_meta

    # 7. Graceful unavailable fallback on cache miss or network failure:
    # Never report exists=True/False when data is missing; report unavailable=True and exists=None.
    return {
        "exists": None,
        "unavailable": True,
        "ecosystem": eco,
        "package_name": pkg_name,
        "created_at": None,
        "age_days": None,
        "weekly_downloads": 0
    }
