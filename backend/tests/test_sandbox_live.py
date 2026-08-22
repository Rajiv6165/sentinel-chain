import asyncio
import os
import sys

# Add the current directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.sandbox import run_sandbox_install
from utils.behavior_scoring import analyze_behavior
import json

async def main():
    print("Testing Sandbox Install...")
    # For a local directory, npm install <path> works
    pkg_path = "/app/data/malicious-pkg"
    # But wait, our sandbox script runs a container that maps no volumes.
    # So if we say "npm install /app/data/malicious-pkg", it won't find it inside the new container.
    # To test properly with local files, we can mount it, but for our general use case, 
    # it downloads from npm.
    # Let's just test with a real package from npm that we know has postinstall scripts,
    # or just use `express` to see if the baseline works.
    print("Testing express...")
    result = await run_sandbox_install("npm", "express")
    analysis = analyze_behavior(result)
    
    print("\n--- Sandbox Result ---")
    print(f"Exit Code: {result['exit_code']}")
    print(f"Network calls: {len(result['network'])}")
    print(f"Filesystem diffs: {len(result['fs_diffs'])}")
    print(f"Strace logs length: {len(result['strace'])}")
    
    print("\n--- Analysis ---")
    print(json.dumps(analysis, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
