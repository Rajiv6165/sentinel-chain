# Sentinel-Chain GitHub Action

You can easily integrate Sentinel-Chain Typosquat and Reachability scanner into your CI/CD pipeline using our GitHub Action. 

This action runs the Sentinel-Chain engine directly against your repository, posts a detailed Markdown summary of the findings as a PR comment, and optionally fails the build if critical vulnerabilities or typosquatted packages are found.

## Features
- **Typosquatting Detection:** Checks your dependencies against known top packages.
- **Vulnerability Reachability:** Parses call graphs to determine if vulnerable code paths are actually reachable.
- **Automated PR Comments:** Posts a unified, easy-to-read summary directly on the pull request.
- **Customizable Thresholds:** Decide when the CI pipeline should fail (e.g., only on `critical` findings, or on `medium` and above).
- **LLM Narratives (Optional):** Attach an Anthropic API key to get detailed AI-generated narratives explaining the risks.

## Usage Example

Create a workflow file in your repository at `.github/workflows/sentinel-chain.yml`:

```yaml
name: Sentinel-Chain Security Scan

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # Required to post PR comments
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run Sentinel-Chain Scanner
        uses: ./ # Replace with your action's location in production, e.g., org/sentinel-chain@v1
        with:
          fail-on-severity: 'critical' # Options: none, low, medium, high, critical
          scan-path: '.'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Optional: ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Inputs

| Input | Description | Default | Required |
|---|---|---|---|
| `fail-on-severity` | Fail the action if findings meet or exceed this severity (`none`, `low`, `medium`, `high`, `critical`) | `critical` | No |
| `enable-sandbox` | Enable Phase 3 sandbox scanning (requires privileged Docker in runner, not recommended for standard CI) | `false` | No |
| `scan-path` | Path in the repository to scan | `.` (root) | No |
| `anthropic-api-key` | Optional Anthropic API Key to generate LLM narratives | | No |
| `github-token` | GitHub Token to post comments on the PR | `${{ github.token }}` | No |

## Notes
- **Sandbox Engine:** The sandbox behavior engine (Phase 3) is disabled by default. CI environments typically do not support Docker-in-Docker well, making sandboxed execution tricky and slow. Use `enable-sandbox: 'true'` only if you are running on self-hosted runners that support privileged docker commands.
- **Graceful Fallback:** If you do not provide an Anthropic API key, the scanner will still function perfectly. It simply won't append LLM narratives to the final summary.
