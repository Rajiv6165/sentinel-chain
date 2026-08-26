import asyncio
import httpx
import os
import time

async def main():
    # Ensure the backend is running before executing this
    url = "http://localhost:8000/api/full-scan"
    
    print("Uploading test_repo.zip...")
    with open("test_repo.zip", "rb") as f:
        files = {"file": ("test_repo.zip", f, "application/zip")}
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, files=files)
                response.raise_for_status()
                data = response.json()
                job_id = data.get("job_id")
                print(f"Scan started, job ID: {job_id}")
            except Exception as e:
                print(f"Error starting scan: {e}")
                return

    print("Polling for results...")
    poll_url = f"http://localhost:8000/api/full-scan/{job_id}"
    while True:
        async with httpx.AsyncClient() as client:
            try:
                res = await client.get(poll_url)
                res_data = res.json()
                status = res_data.get("status")
                print(f"Status: {status}")
                if status == "completed":
                    results = res_data.get("result")
                    print("\n=== SCAN RESULTS ===")
                    for r in results:
                        print(f"Package: {r['package_name']} - OVERALL RISK: {r['overall_risk']}")
                        
                        if r['typosquat'] and r['typosquat'].get('narrative'):
                            print(f"  Typosquat Narrative: {r['typosquat']['narrative']}")
                        if r['sandbox'] and r['sandbox'].get('narrative'):
                            print(f"  Sandbox Narrative: {r['sandbox']['narrative']}")
                        if r['cves']:
                            for c in r['cves']:
                                if c.get('narrative'):
                                    print(f"  CVE Narrative: {c['narrative']}")
                    break
                elif status == "failed":
                    print(f"Failed: {res_data.get('error')}")
                    break
            except Exception as e:
                print(f"Polling error: {e}")
                break
        time.sleep(2)

if __name__ == "__main__":
    asyncio.run(main())
