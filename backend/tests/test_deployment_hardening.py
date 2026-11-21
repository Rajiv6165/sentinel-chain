import os
import zipfile
import tempfile
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app, ENABLE_SANDBOX
from utils.safe_zip import safe_extract_zip, MAX_FILE_COUNT, MAX_UNCOMPRESSED_SIZE
from utils.llm_narrative import (
    generate_narrative,
    get_daily_cap,
    get_current_daily_count,
    increment_daily_count,
    reset_daily_count_for_testing
)
from utils.signing import sign_data


@pytest.fixture
def client():
    return TestClient(app)


# ==============================================================================
# 1. Zip Upload Safety & Hardening Tests
# ==============================================================================

def test_safe_extract_valid_zip():
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "valid.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("app.py", "print('hello')\n")
            zf.writestr("requirements.txt", "requests==2.26.0\n")

        extract_dir = os.path.join(td, "extracted")
        out = safe_extract_zip(zip_path, extract_dir)
        assert os.path.exists(os.path.join(out, "app.py"))
        assert os.path.exists(os.path.join(out, "requirements.txt"))


def test_safe_extract_rejects_zip_slip():
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "evil_slip.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            # Dangerous path traversal
            zf.writestr("../../../evil.sh", "malicious_script()")

        extract_dir = os.path.join(td, "extracted")
        with pytest.raises(HTTPException) as exc_info:
            safe_extract_zip(zip_path, extract_dir)
        assert exc_info.value.status_code == 400
        assert "illegal path traversal" in exc_info.value.detail.lower()


def test_safe_extract_rejects_symlinks():
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "symlink.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            zi = zipfile.ZipInfo("symlink_file")
            # Set POSIX symlink mode (0o120000)
            zi.create_system = 3  # UNIX
            zi.external_attr = 0o120777 << 16
            zf.writestr(zi, "/etc/passwd")

        extract_dir = os.path.join(td, "extracted")
        with pytest.raises(HTTPException) as exc_info:
            safe_extract_zip(zip_path, extract_dir)
        assert exc_info.value.status_code == 400
        assert "prohibited symbolic link" in exc_info.value.detail.lower()


def test_safe_extract_rejects_excessive_file_count():
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "too_many_files.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for i in range(15):
                zf.writestr(f"file_{i}.txt", "data")

        extract_dir = os.path.join(td, "extracted")
        with pytest.raises(HTTPException) as exc_info:
            safe_extract_zip(zip_path, extract_dir, max_file_count=10)
        assert exc_info.value.status_code == 400
        assert "contains too many files" in exc_info.value.detail.lower()


def test_safe_extract_rejects_excessive_uncompressed_size():
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "zip_bomb.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            # 50 KB file
            zf.writestr("big.txt", "A" * (50 * 1024))

        extract_dir = os.path.join(td, "extracted")
        with pytest.raises(HTTPException) as exc_info:
            safe_extract_zip(zip_path, extract_dir, max_uncompressed_size=20 * 1024)
        assert exc_info.value.status_code == 400
        assert "exceeds uncompressed size limit" in exc_info.value.detail.lower()


# ==============================================================================
# 2. Disabled Sandbox in Public Demo Tests
# ==============================================================================

def test_api_config_endpoint(client):
    res = client.get("/api/config")
    assert res.status_code == 200
    data = res.json()
    assert "sandbox_enabled" in data
    assert data["public_demo"] is True
    assert "demo_notice" in data


def test_sandbox_scan_disabled_by_default(client):
    # Unless ENABLE_SANDBOX=true is explicitly set in env, the sandbox endpoint must be 403
    if not ENABLE_SANDBOX:
        res = client.post("/api/sandbox-scan", json={"ecosystem": "npm", "package_name": "lodash"})
        assert res.status_code == 403
        assert "sandbox engine is disabled" in res.json()["detail"].lower()


# ==============================================================================
# 3. Health & Public Endpoints
# ==============================================================================

def test_health_endpoints(client):
    res1 = client.get("/health")
    assert res1.status_code == 200
    assert res1.json()["status"] == "ok"

    res2 = client.get("/api/health")
    assert res2.status_code == 200
    assert res2.json()["status"] == "ok"


# ==============================================================================
# 4. LLM Daily Cap Enforcement
# ==============================================================================

@pytest.mark.asyncio
async def test_llm_daily_cap_enforcement(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "dummy-key-for-test")
    monkeypatch.setenv("LLM_DAILY_CAP", "5")
    reset_daily_count_for_testing()

    # Simulate reaching the cap
    for _ in range(5):
        increment_daily_count()

    assert get_current_daily_count() >= 5

    # Should not call Anthropic; should return graceful cap message
    narrative = await generate_narrative("test-pkg", "typosquat", {"score": 1})
    assert "daily ai narrative generation cap" in narrative.lower()


# ==============================================================================
# 5. Sigstore Non-Interactive Server Safety
# ==============================================================================

def test_sigstore_server_interactive_flow_disabled(monkeypatch):
    # When no ambient CI token exists on server, sign_data must raise RuntimeError, never open a browser
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.delenv("SIGSTORE_OIDC_TOKEN", raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        sign_data(b"test data to sign")
    assert "interactive sigstore browser oidc authentication is disabled on the server" in str(exc_info.value).lower()
