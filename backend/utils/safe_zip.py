import os
import zipfile
import shutil
from typing import Optional, Dict, Any
from fastapi import HTTPException, UploadFile

# Default limit values
DEFAULT_MAX_UPLOAD_MB = 15
DEFAULT_MAX_UNCOMPRESSED_MB = 50
DEFAULT_MAX_ZIP_FILES = 1000
DEFAULT_SCAN_TIMEOUT_SECONDS = 60


def _parse_positive_int(val: Any, default: int) -> int:
    """
    Safely parses a positive integer.
    If the value is non-numeric, empty, None, or <= 0, falls back to default.
    """
    if val is None:
        return default
    try:
        parsed = int(str(val).strip())
        return parsed if parsed > 0 else default
    except (ValueError, TypeError):
        return default


def _get_env_upload_mb() -> int:
    val = os.environ.get("MAX_UPLOAD_MB")
    if val is not None and val.strip() != "":
        return _parse_positive_int(val, DEFAULT_MAX_UPLOAD_MB)
    bytes_val = os.environ.get("MAX_UPLOAD_SIZE_BYTES")
    if bytes_val is not None and bytes_val.strip() != "":
        bytes_int = _parse_positive_int(bytes_val, DEFAULT_MAX_UPLOAD_MB * 1024 * 1024)
        return max(1, bytes_int // (1024 * 1024))
    return DEFAULT_MAX_UPLOAD_MB


def _get_env_uncompressed_mb() -> int:
    val = os.environ.get("MAX_UNCOMPRESSED_MB")
    if val is not None and val.strip() != "":
        return _parse_positive_int(val, DEFAULT_MAX_UNCOMPRESSED_MB)
    bytes_val = os.environ.get("MAX_UNCOMPRESSED_SIZE_BYTES")
    if bytes_val is not None and bytes_val.strip() != "":
        bytes_int = _parse_positive_int(bytes_val, DEFAULT_MAX_UNCOMPRESSED_MB * 1024 * 1024)
        return max(1, bytes_int // (1024 * 1024))
    return DEFAULT_MAX_UNCOMPRESSED_MB


def _get_env_zip_files() -> int:
    val = os.environ.get("MAX_ZIP_FILES")
    if val is not None and val.strip() != "":
        return _parse_positive_int(val, DEFAULT_MAX_ZIP_FILES)
    count_val = os.environ.get("MAX_FILE_COUNT")
    if count_val is not None and count_val.strip() != "":
        return _parse_positive_int(count_val, DEFAULT_MAX_ZIP_FILES)
    return DEFAULT_MAX_ZIP_FILES


# Safety limits for zip uploads (configurable via environment variables)
# MAX_UPLOAD_MB (default 15), MAX_UNCOMPRESSED_MB (default 50), MAX_ZIP_FILES (default 1000)
MAX_UPLOAD_MB = _get_env_upload_mb()
MAX_UPLOAD_SIZE = MAX_UPLOAD_MB * 1024 * 1024

MAX_UNCOMPRESSED_MB = _get_env_uncompressed_mb()
MAX_UNCOMPRESSED_SIZE = MAX_UNCOMPRESSED_MB * 1024 * 1024

MAX_ZIP_FILES = _get_env_zip_files()
MAX_FILE_COUNT = MAX_ZIP_FILES

SCAN_TIMEOUT_SECONDS = _parse_positive_int(os.environ.get("SCAN_TIMEOUT_SECONDS"), DEFAULT_SCAN_TIMEOUT_SECONDS)


def get_active_limits() -> Dict[str, Any]:
    """
    Returns current active limit values (reading from os.environ dynamically).
    Falls back safely to defaults if environment variables are invalid/empty/negative.
    """
    upload_mb = _get_env_upload_mb()
    uncompressed_mb = _get_env_uncompressed_mb()
    zip_files = _get_env_zip_files()
    return {
        "max_upload_mb": upload_mb,
        "max_upload_size": upload_mb * 1024 * 1024,
        "max_uncompressed_mb": uncompressed_mb,
        "max_uncompressed_size": uncompressed_mb * 1024 * 1024,
        "max_zip_files": zip_files,
    }


# Directories to skip when extracting repositories
SKIPPED_DIR_NAMES = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "venv",
    ".venv",
    "__pycache__",
}

# Binary and media file extensions to skip when extracting repositories
SKIPPED_EXTENSIONS = {
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp", ".tiff", ".tif", ".avif", ".heic",
    # Video
    ".mp4", ".webm", ".mkv", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg",
    # Audio
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma",
    # Fonts
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    # Archives
    ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar",
    # Compiled binaries & document media
    ".pdf", ".exe", ".dll", ".so", ".dylib", ".bin", ".iso", ".dmg", ".class", ".pyc", ".pyo", ".wasm",
}


def should_skip_member(filename: str) -> bool:
    """
    Returns True if the zip member is inside a skipped directory (node_modules,
    .git, dist, build, venv) or has a binary/media/archive extension.
    """
    clean = filename.replace("\\", "/").strip("/")
    parts = [p.lower() for p in clean.split("/") if p]
    if not parts:
        return True

    # Check if any folder segment matches skipped directory names
    for part in parts:
        if part in SKIPPED_DIR_NAMES:
            return True

    # Check extension of the filename
    _, ext = os.path.splitext(parts[-1])
    if ext in SKIPPED_EXTENSIONS:
        return True

    return False


async def save_upload_with_size_limit(
    upload_file: UploadFile,
    dest_path: str,
    max_size: Optional[int] = None
) -> int:
    """
    Saves an UploadFile to disk in chunks, enforcing a strict maximum file size limit.
    Raises HTTPException(413) if the limit is exceeded.
    """
    if max_size is None:
        max_size = get_active_limits()["max_upload_size"]

    total_bytes = 0
    chunk_size = 64 * 1024  # 64 KB chunks

    with open(dest_path, "wb") as f:
        while True:
            chunk = await upload_file.read(chunk_size)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > max_size:
                f.close()
                if os.path.exists(dest_path):
                    try:
                        os.remove(dest_path)
                    except Exception:
                        pass
                raise HTTPException(
                    status_code=413,
                    detail=f"Upload exceeds maximum permitted size of {max_size // (1024 * 1024)} MB."
                )
            f.write(chunk)

    return total_bytes


def safe_extract_zip(
    zip_path: str,
    target_dir: str,
    max_uncompressed_size: Optional[int] = None,
    max_file_count: Optional[int] = None
) -> str:
    """
    Safely extracts a zip archive:
    1. Strict path traversal / Zip-Slip defense across ALL members (even skipped/media files).
    2. Prohibition of symbolic links across ALL members.
    3. Skips node_modules/, .git/, dist/, build/, venv/, and binary/media files (images, video, fonts, archives).
    4. Applies file count and uncompressed size limits ONLY to the remaining files.
    5. Extracts only the remaining files to target_dir.

    Returns the absolute path of target_dir.
    Raises HTTPException(400) if any check fails.
    """
    limits = get_active_limits()
    if max_uncompressed_size is None:
        max_uncompressed_size = limits["max_uncompressed_size"]
    if max_file_count is None:
        max_file_count = limits["max_zip_files"]

    if not zipfile.is_zipfile(zip_path):
        raise HTTPException(status_code=400, detail="Invalid zip archive.")

    target_dir = os.path.abspath(target_dir)
    os.makedirs(target_dir, exist_ok=True)

    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        infolist = zip_ref.infolist()

        # STEP 1: Verify safety on ALL members unconditionally (Zip-Slip and Symlinks)
        for member in infolist:
            # Path traversal / Zip-Slip check
            dest_file = os.path.abspath(os.path.join(target_dir, member.filename))
            try:
                common = os.path.commonpath([target_dir, dest_file])
            except ValueError:
                common = ""

            if common != target_dir:
                raise HTTPException(
                    status_code=400,
                    detail=f"Zip archive contains illegal path traversal (Zip-Slip): {member.filename}"
                )

            # Check for symbolic links (POSIX mode & 0o170000 == 0o120000)
            mode = (member.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                raise HTTPException(
                    status_code=400,
                    detail=f"Zip archive contains prohibited symbolic link: {member.filename}"
                )

        # STEP 2: Filter out skipped directories and binary/media files
        files_to_extract = []
        total_uncompressed = 0
        remaining_file_count = 0

        for member in infolist:
            # Skip ignored folders (node_modules, .git, dist, build, venv) and binary/media files
            if should_skip_member(member.filename):
                continue

            # Directory markers themselves don't count toward the file limit or size limit
            if member.is_dir() or member.filename.endswith(("/", "\\")):
                continue

            remaining_file_count += 1
            if remaining_file_count > max_file_count:
                raise HTTPException(
                    status_code=400,
                    detail=f"Archive has too many files ({remaining_file_count} > {max_file_count})."
                )

            total_uncompressed += member.file_size
            if total_uncompressed > max_uncompressed_size:
                raise HTTPException(
                    status_code=400,
                    detail=f"Archive exceeds uncompressed size limit of {max(1, max_uncompressed_size // (1024 * 1024))} MB."
                )

            files_to_extract.append(member)

        # STEP 3: Extract only the remaining (non-skipped) files safely with stream byte-count enforcement
        actual_uncompressed = 0
        chunk_size = 64 * 1024

        for member in files_to_extract:
            dest_file = os.path.abspath(os.path.join(target_dir, member.filename))
            os.makedirs(os.path.dirname(dest_file), exist_ok=True)
            try:
                with zip_ref.open(member, 'r') as src, open(dest_file, 'wb') as dst:
                    while True:
                        chunk = src.read(chunk_size)
                        if not chunk:
                            break
                        actual_uncompressed += len(chunk)
                        if actual_uncompressed > max_uncompressed_size:
                            dst.close()
                            raise HTTPException(
                                status_code=400,
                                detail=f"Archive exceeds uncompressed size limit of {max(1, max_uncompressed_size // (1024 * 1024))} MB."
                            )
                        dst.write(chunk)
            except Exception:
                if os.path.exists(dest_file):
                    try:
                        os.remove(dest_file)
                    except Exception:
                        pass
                raise

    return target_dir
