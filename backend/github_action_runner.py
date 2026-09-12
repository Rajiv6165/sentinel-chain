import argparse
import asyncio
import json
import os
import sys
import subprocess
from github import Github

from utils.markdown_formatter import format_markdown_summary

def main():
    parser = argparse.ArgumentParser(description="Sentinel-Chain GitHub Action Runner")
    parser.add_argument("--path", required=True, help="Path to the repository to scan")
    parser.add_argument("--fail-on-severity", default="critical", help="Exit with non-zero code if findings meet or exceed this severity")
    parser.add_argument("--enable-sandbox", default="false", help="Enable Phase 3 sandbox scanning")
    
    args = parser.parse_args()
    
    # Run the CLI
    output_json = "sentinel_results.json"
    cli_cmd = [
        sys.executable,
        os.path.join(os.path.dirname(__file__), "cli.py"),
        "--path", args.path,
        "--output", output_json,
        "--fail-on-severity", args.fail_on_severity
    ]
    if args.enable_sandbox.lower() == "true":
        cli_cmd.append("--enable-sandbox")
        
    print(f"Running Sentinel-Chain CLI: {' '.join(cli_cmd)}")
    
    process = subprocess.run(cli_cmd, capture_output=True, text=True)
    print(process.stdout)
    if process.stderr:
        print(process.stderr, file=sys.stderr)
        
    # Read the JSON output to generate the PR comment
    if not os.path.exists(output_json):
        print("Error: CLI did not produce JSON output.")
        sys.exit(1)
        
    with open(output_json, "r", encoding="utf-8") as f:
        results_data = json.load(f)
        
    md_summary = format_markdown_summary(results_data.get("findings", []), results_data.get("scanned_count", 0))
    
    # Post PR Comment
    post_pr_comment(md_summary)
    
    # Exit with the same code as the CLI
    sys.exit(process.returncode)

def post_pr_comment(body: str):
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("GITHUB_TOKEN not found, skipping PR comment.")
        return
        
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path or not os.path.exists(event_path):
        print("GITHUB_EVENT_PATH not found, cannot determine PR.")
        return
        
    with open(event_path, "r", encoding="utf-8") as f:
        event_data = json.load(f)
        
    if "pull_request" not in event_data:
        print("Not a pull request event, skipping PR comment.")
        return
        
    repo_name = os.environ.get("GITHUB_REPOSITORY")
    pr_number = event_data["pull_request"]["number"]
    
    try:
        g = Github(token)
        repo = g.get_repo(repo_name)
        pr = repo.get_pull(pr_number)
        
        # Check for existing comment
        existing_comment = None
        for comment in pr.get_issue_comments():
            if "## 🛡️ Sentinel-Chain Scan Results" in comment.body:
                existing_comment = comment
                break
                
        if existing_comment:
            existing_comment.edit(body)
            print(f"Updated existing PR comment: {existing_comment.html_url}")
        else:
            new_comment = pr.create_issue_comment(body)
            print(f"Created new PR comment: {new_comment.html_url}")
            
    except Exception as e:
        print(f"Failed to post PR comment: {e}")

if __name__ == "__main__":
    main()
