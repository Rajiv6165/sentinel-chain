import os
import zipfile
import shutil
from fastapi import HTTPException, UploadFile

# Safety limits for zip uploads (configurable via environment variables)
MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE_BYTES", 15 * 1024 * 1024))          # 15 MB
MAX_UNCOMPRESSED_SIZE = int(os.environ.get("MAX_UNCOMPRESSED_SIZE_BYTES", 50 * 1024 * 1024)) # 50 MB
MAX_FILE_COUNT = int(os.environ.get("MAX_FILE_COUNT", 1000))                                # 1,000 files
SCAN_TIMEOUT_SECONDS = int(os.environ.get("SCAN_TIMEOUT_SECONDS", 60))                       # 60s timeout


async def save_upload_with_size_limit(upload_file: UploadFile, dest_path: str, max_size: int = MAX_UPLOAD_SIZE) -> int:
    """
    Saves an UploadFile to disk in chunks, enforcing a strict maximum file size limit.
    Raises HTTPException(413) if the limit is exceeded.
    """
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
    max_uncompressed_size: int = MAX_UNCOMPRESSED_SIZE,
    max_file_count: int = MAX_FILE_COUNT
) -> str:
    """
    Safely extracts a zip archive, enforcing:
    1. Maximum file count (zip-bomb defense)
    2. Maximum uncompressed cumulative size (zip-bomb defense)
    3. Strict path traversal / Zip-Slip defense
    4. Prohibition of symbolic links (arbitrary file read defense)

    Returns the absolute path of target_dir.
    Raises HTTPException(400) if any check fails.
    """
    if not zipfile.is_zipfile(zip_path):
        raise HTTPException(status_code=400, detail="Invalid zip archive.")

    target_dir = os.path.abspath(target_dir)
    os.makedirs(target_dir, exist_ok=True)

    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        infolist = zip_ref.infolist()

        # 1. Check file count
        if len(infolist) > max_file_count:
            raise HTTPException(
                status_code=400,
                detail=f"Zip archive contains too many files ({len(infolist)} > {max_file_count})."
            )

        total_uncompressed = 0

        for member in infolist:
            # 2. Check cumulative uncompressed size
            total_uncompressed += member.file_size
            if total_uncompressed > max_uncompressed_size:
                raise HTTPException(
                    status_code=400,
                    detail=f"Zip archive exceeds uncompressed size limit of {max_uncompressed_size // (1024 * 1024)} MB."
                )

            # 3. Path traversal / Zip-Slip check
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

            # 4. Check for symbolic links (POSIX mode & 0o170000 == 0o120000)
            mode = (member.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                raise HTTPException(
                    status_code=400,
                    detail=f"Zip archive contains prohibited symbolic link: {member.filename}"
                )

        # All checks passed, extract safely
        for member in infolist:
            zip_ref.extract(member, target_dir)

    return target_dir
