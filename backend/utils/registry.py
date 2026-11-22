import os
import json
import urllib.request
from typing import Optional, Dict, Any
from datetime import datetime, timezone

CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "registry_cache.json")

_CACHE: Optional[Dict[str, Any]] = None


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
    """Fetches package metadata from npm registry and npm download stats API."""
    try:
        dl_url = f"https://api.npmjs.org/downloads/point/last-week/{pkg}"
        req_dl = urllib.request.Request(dl_url, headers={"User-Agent": "Sentinel-Chain/1.0"})
        weekly_dl = 0
        try:
            with urllib.request.urlopen(req_dl, timeout=3) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                weekly_dl = data.get("downloads", 0)
        except Exception:
            weekly_dl = 0

        reg_url = f"https://registry.npmjs.org/{pkg}"
        req_reg = urllib.request.Request(reg_url, headers={"User-Agent": "Sentinel-Chain/1.0"})
        with urllib.request.urlopen(req_reg, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            created_at = data.get("time", {}).get("created")
            age_days = None
            if created_at:
                dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                age_days = (datetime.now(timezone.utc) - dt).days

            return {
                "exists": True,
                "ecosystem": "npm",
                "created_at": created_at,
                "age_days": age_days,
                "weekly_downloads": weekly_dl
            }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"exists": False, "ecosystem": "npm", "created_at": None, "age_days": None, "weekly_downloads": 0}
    except Exception:
        pass
    return None


def fetch_live_pypi(pkg: str) -> Optional[Dict[str, Any]]:
    """Fetches package metadata from PyPI JSON API and pypistats.org."""
    try:
        url = f"https://pypi.org/pypi/{pkg}/json"
        req = urllib.request.Request(url, headers={"User-Agent": "Sentinel-Chain/1.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
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
                purl = f"https://pypistats.org/api/packages/{pkg}/recent"
                preq = urllib.request.Request(purl, headers={"User-Agent": "Sentinel-Chain/1.0"})
                with urllib.request.urlopen(preq, timeout=3) as presp:
                    pdata = json.loads(presp.read().decode('utf-8'))
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
            return {"exists": False, "ecosystem": "pypi", "package_name": pkg, "created_at": None, "age_days": None, "weekly_downloads": 0}
    except Exception:
        pass
    return None


def get_package_registry_metadata(pkg: str, ecosystem: Optional[str] = None) -> Dict[str, Any]:
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
    When metadata is missing (cache miss, network error, rate limit, timeout), returns unavailable=True
    and exists=None so callers never clear or downgrade matches.
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

    # 3. Live query if network allows and not in offline cache
    live_meta = None
    if os.environ.get("SENTINEL_OFFLINE") != "1":
        if eco == "npm":
            live_meta = fetch_live_npm(pkg_name)
        elif eco == "pypi":
            live_meta = fetch_live_pypi(pkg_name)

    if live_meta is not None:
        return live_meta

    # 4. Graceful unavailable fallback on cache miss or network failure:
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
