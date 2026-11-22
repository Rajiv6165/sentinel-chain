import os
import zipfile
import tempfile
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app, ENABLE_SANDBOX
from utils.safe_zip import safe_extract_zip, MAX_FILE_COUNT, MAX_UNCOMPRESSED_SIZE, get_active_limits
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
        assert "too many files" in exc_info.value.detail.lower()


def test_safe_extract_skips_media_and_skipped_dirs_with_3000_images():
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "repo_with_images.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            # 3,000 image files
            for i in range(3000):
                zf.writestr(f"assets/img_{i}.png", b"fake_png_data")
            # Files in skipped directories
            zf.writestr("node_modules/express/index.js", "module.exports = {};")
            zf.writestr(".git/config", "[core]\nrepositoryformatversion = 0")
            zf.writestr("dist/bundle.js", "console.log('bundled');")
            zf.writestr("venv/lib/site-packages/urllib3.py", "# venv library")
            # Legitimate source file to be extracted
            zf.writestr("package.json", '{"name": "demo-app", "dependencies": {"lodash": "^4.17.21"}}')

        extract_dir = os.path.join(td, "extracted")
        out = safe_extract_zip(zip_path, extract_dir, max_file_count=1000)

        # package.json must be extracted
        assert os.path.exists(os.path.join(out, "package.json"))
        # Skipped images and directories must NOT be extracted
        assert not os.path.exists(os.path.join(out, "assets"))
        assert not os.path.exists(os.path.join(out, "node_modules"))
        assert not os.path.exists(os.path.join(out, ".git"))
        assert not os.path.exists(os.path.join(out, "dist"))
        assert not os.path.exists(os.path.join(out, "venv"))


def test_safe_extract_rejects_path_traversal_in_media_and_skipped_dirs():
    with tempfile.TemporaryDirectory() as td:
        # Path traversal with an image extension
        zip_path1 = os.path.join(td, "evil_img.zip")
        with zipfile.ZipFile(zip_path1, "w") as zf:
            zf.writestr("../../../evil.png", "fake_img")

        extract_dir1 = os.path.join(td, "extracted1")
        with pytest.raises(HTTPException) as exc_info1:
            safe_extract_zip(zip_path1, extract_dir1)
        assert exc_info1.value.status_code == 400
        assert "illegal path traversal" in exc_info1.value.detail.lower()

        # Path traversal inside a skipped folder name
        zip_path2 = os.path.join(td, "evil_node_modules.zip")
        with zipfile.ZipFile(zip_path2, "w") as zf:
            zf.writestr("node_modules/../../evil.js", "malicious_code()")

        extract_dir2 = os.path.join(td, "extracted2")
        with pytest.raises(HTTPException) as exc_info2:
            safe_extract_zip(zip_path2, extract_dir2)
        assert exc_info2.value.status_code == 400
        assert "illegal path traversal" in exc_info2.value.detail.lower()


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


def test_safe_extract_skipped_bomb_never_decompressed_or_written_to_disk():
    """
    Case 1: A zip entry named node_modules/bomb.bin and photo.png that would decompress
    to a huge size (e.g. 20 MB each) are in skipped directories/extensions.
    They must never be decompressed or written to disk, and must not crash or exhaust memory.
    """
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "skipped_bombs.zip")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            # 20 MB of data each (compresses into < 25 KB)
            bomb_data = b"\x00" * (20 * 1024 * 1024)
            zf.writestr("node_modules/bomb.bin", bomb_data)
            zf.writestr("photo.png", bomb_data)
            zf.writestr("package.json", '{"name": "safe-project"}')

        extract_dir = os.path.join(td, "extracted")
        # Set uncompressed limit to 1 MB. If either 20 MB bomb were decompressed or counted,
        # it would exceed the 1 MB limit and fail.
        out = safe_extract_zip(zip_path, extract_dir, max_uncompressed_size=1 * 1024 * 1024)

        # package.json must be extracted
        assert os.path.exists(os.path.join(out, "package.json"))
        # Skipped entries must never exist on disk
        assert not os.path.exists(os.path.join(out, "node_modules"))
        assert not os.path.exists(os.path.join(out, "photo.png"))
        # Cumulative disk size of extracted directory must be minimal (< 1 KB)
        total_size = sum(
            os.path.getsize(os.path.join(root, f))
            for root, _, files in os.walk(out)
            for f in files
        )
        assert total_size < 1024


def test_safe_extract_rejects_entry_lying_about_size_in_header(monkeypatch):
    """
    Case 2: A non-skipped entry (e.g. src/app.js) that lies about its size in the zip header:
    the byte limit must be enforced on bytes actually read while extracting, not just the
    declared size, and extraction must abort immediately.
    """
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "lying_size.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            # Header declares only 5 bytes
            zf.writestr("src/app.js", "dummy")

        # Mock the stream returned by zipfile.ZipFile.open so that when read during extraction,
        # it actually yields 50 KB of data (> 20 KB limit)
        import io
        real_zipfile_open = zipfile.ZipFile.open

        def fake_open(self, name, mode="r", *args, **kwargs):
            filename = name.filename if isinstance(name, zipfile.ZipInfo) else name
            if filename == "src/app.js":
                # Return a stream yielding 50 KB of data
                return io.BytesIO(b"console.log('overflow');\n" * 2500)
            return real_zipfile_open(self, name, mode, *args, **kwargs)

        monkeypatch.setattr(zipfile.ZipFile, "open", fake_open)

        extract_dir = os.path.join(td, "extracted")
        with pytest.raises(HTTPException) as exc_info:
            safe_extract_zip(zip_path, extract_dir, max_uncompressed_size=20 * 1024)

        assert exc_info.value.status_code == 400
        assert "exceeds uncompressed size limit" in exc_info.value.detail.lower()
        # Extraction must abort and partial file must be deleted
        assert not os.path.exists(os.path.join(extract_dir, "src", "app.js"))


def test_safe_extract_rejects_symlink_inside_skipped_directory():
    """
    Case 3: A symlink entry inside a skipped directory (node_modules/ or .git/)
    is still rejected unconditionally.
    """
    with tempfile.TemporaryDirectory() as td:
        # Symlink inside node_modules
        zip_path1 = os.path.join(td, "skipped_symlink1.zip")
        with zipfile.ZipFile(zip_path1, "w") as zf:
            zi = zipfile.ZipInfo("node_modules/evil_link")
            zi.create_system = 3  # UNIX
            zi.external_attr = 0o120777 << 16  # POSIX symlink
            zf.writestr(zi, "/etc/passwd")
            zf.writestr("package.json", '{"name": "test"}')

        extract_dir1 = os.path.join(td, "extracted1")
        with pytest.raises(HTTPException) as exc_info1:
            safe_extract_zip(zip_path1, extract_dir1)
        assert exc_info1.value.status_code == 400
        assert "prohibited symbolic link" in exc_info1.value.detail.lower()

        # Symlink inside .git
        zip_path2 = os.path.join(td, "skipped_symlink2.zip")
        with zipfile.ZipFile(zip_path2, "w") as zf:
            zi2 = zipfile.ZipInfo(".git/evil_link")
            zi2.create_system = 3
            zi2.external_attr = 0o120777 << 16
            zf.writestr(zi2, "/root/.ssh/id_rsa")
            zf.writestr("index.js", "console.log('hi');")

        extract_dir2 = os.path.join(td, "extracted2")
        with pytest.raises(HTTPException) as exc_info2:
            safe_extract_zip(zip_path2, extract_dir2)
        assert exc_info2.value.status_code == 400
        assert "prohibited symbolic link" in exc_info2.value.detail.lower()


def test_env_limits_fallback_on_invalid_empty_negative_values(monkeypatch, client):
    """
    Case 4: MAX_UPLOAD_MB=abc (or empty/negative) falls back to the default
    instead of crashing at startup or in get_active_limits().
    """
    # Test non-numeric strings
    monkeypatch.setenv("MAX_UPLOAD_MB", "abc")
    monkeypatch.setenv("MAX_UNCOMPRESSED_MB", "xyz")
    monkeypatch.setenv("MAX_ZIP_FILES", "invalid")

    limits = get_active_limits()
    assert limits["max_upload_mb"] == 15
    assert limits["max_upload_size"] == 15 * 1024 * 1024
    assert limits["max_uncompressed_mb"] == 50
    assert limits["max_uncompressed_size"] == 50 * 1024 * 1024
    assert limits["max_zip_files"] == 1000

    # API config endpoint responds with defaults instead of crashing
    res = client.get("/api/config")
    assert res.status_code == 200
    cfg = res.json()
    assert cfg["max_upload_mb"] == 15
    assert cfg["max_uncompressed_mb"] == 50
    assert cfg["max_zip_files"] == 1000

    # Test empty strings
    monkeypatch.setenv("MAX_UPLOAD_MB", "   ")
    monkeypatch.setenv("MAX_UNCOMPRESSED_MB", "")
    monkeypatch.setenv("MAX_ZIP_FILES", "")

    limits_empty = get_active_limits()
    assert limits_empty["max_upload_mb"] == 15
    assert limits_empty["max_uncompressed_mb"] == 50
    assert limits_empty["max_zip_files"] == 1000

    # Test negative and zero numbers
    monkeypatch.setenv("MAX_UPLOAD_MB", "-15")
    monkeypatch.setenv("MAX_UNCOMPRESSED_MB", "0")
    monkeypatch.setenv("MAX_ZIP_FILES", "-500")

    limits_neg = get_active_limits()
    assert limits_neg["max_upload_mb"] == 15
    assert limits_neg["max_uncompressed_mb"] == 50
    assert limits_neg["max_zip_files"] == 1000


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
    assert data["max_upload_mb"] == 15
    assert data["max_uncompressed_mb"] == 50
    assert data["max_zip_files"] == 1000


def test_zip_limits_configurable_via_env(monkeypatch, client):
    monkeypatch.setenv("MAX_UPLOAD_MB", "25")
    monkeypatch.setenv("MAX_UNCOMPRESSED_MB", "80")
    monkeypatch.setenv("MAX_ZIP_FILES", "500")

    limits = get_active_limits()
    assert limits["max_upload_mb"] == 25
    assert limits["max_upload_size"] == 25 * 1024 * 1024
    assert limits["max_uncompressed_mb"] == 80
    assert limits["max_uncompressed_size"] == 80 * 1024 * 1024
    assert limits["max_zip_files"] == 500

    res = client.get("/api/config")
    assert res.status_code == 200
    cfg = res.json()
    assert cfg["max_upload_mb"] == 25
    assert cfg["max_uncompressed_mb"] == 80
    assert cfg["max_zip_files"] == 500

    # Test dynamic safe_extract_zip honoring active limits when None passed
    with tempfile.TemporaryDirectory() as td:
        zip_path = os.path.join(td, "test_env_files.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for i in range(600):
                zf.writestr(f"src/file_{i}.txt", "content")

        extract_dir = os.path.join(td, "extracted")
        with pytest.raises(HTTPException) as exc_info:
            safe_extract_zip(zip_path, extract_dir)
        assert exc_info.value.status_code == 400
        assert "too many files" in exc_info.value.detail.lower()
        assert "500" in exc_info.value.detail


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


# ==============================================================================
# 6. End-to-End Zip Upload & Error Detail Tests
# ==============================================================================

def test_api_reachability_scan_with_3000_images_and_package_json(client):
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for i in range(3000):
            zf.writestr(f"assets/image_{i}.png", b"fake_png_binary")
        zf.writestr("package.json", '{"name": "test-repo", "dependencies": {"lodash": "^4.17.21"}}')
        zf.writestr("index.js", 'const lodash = require("lodash");\nconsole.log(lodash.escape("hello"));\n')
    buf.seek(0)

    res = client.post(
        "/api/reachability-scan",
        files={"file": ("repo_3000_images.zip", buf.getvalue(), "application/zip")}
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert "findings" in data
    assert data["scanned_count"] >= 1


def test_api_reachability_scan_rejects_path_traversal(client):
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("package.json", '{"dependencies": {}}')
        zf.writestr("../../../evil.png", b"malicious_png")
    buf.seek(0)

    res = client.post(
        "/api/reachability-scan",
        files={"file": ("evil.zip", buf.getvalue(), "application/zip")}
    )
    assert res.status_code == 400
    assert "illegal path traversal" in res.json().get("detail", "").lower()


def test_api_rate_limit_error_detail(client):
    # Trigger rate limit on /api/scan
    rate_limited = False
    for _ in range(25):
        res = client.post(
            "/api/scan",
            files={"file": ("package.json", b'{"dependencies":{}}', "application/json")}
        )
        if res.status_code == 429:
            rate_limited = True
            data = res.json()
            assert "detail" in data
            assert "Rate limit reached, try again in a minute." in data["detail"]
            break
    assert rate_limited, "Expected 429 rate limit to be triggered"
