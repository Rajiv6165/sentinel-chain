import os
import sys

# Ensure backend directory is in sys.path for test discovery and execution
backend_dir = os.path.abspath(os.path.dirname(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Ensure tests run deterministically and offline by default
os.environ.setdefault("SENTINEL_OFFLINE", "1")
