import { useState } from 'react';

const GITHUB_ACTION_YAML = `name: Sentinel-Chain Security Scan

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
        uses: rajivthakker/sentinel-chain@v1
        with:
          fail-on-severity: 'critical' # Options: none, low, medium, high, critical
          scan-path: '.'
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`;

const CLI_COMMANDS = `# 1. Run full reachability, typosquat, and license scan with Sigstore signing
python -m backend.cli --path . --output report.json --generate-sbom --sign

# 2. Gate CI build on critical findings with project history tracking
python -m backend.cli --path . --fail-on-severity critical --project-name "my-app"

# 3. Independently verify signed artifact against public Rekor transparency log
python -m backend.cli verify report.json report.json.sigstore.json`;

export default function UseInCI() {
  const [activeTab, setActiveTab] = useState('action'); // 'action' or 'cli'
  const [copied, setCopied] = useState(false);

  const activeContent = activeTab === 'action' ? GITHUB_ACTION_YAML : CLI_COMMANDS;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = activeContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section id="use-in-ci" aria-labelledby="ci-heading" className="max-w-5xl mx-auto px-6 py-20 scroll-mt-28">
      <div className="rounded-2xl border border-[rgba(148,170,210,0.2)] bg-[rgba(14,22,38,0.78)] backdrop-blur-xl p-6 md:p-8 shadow-xl text-left">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-[rgba(148,170,210,0.12)]">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-[#7AA2FF]" />
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#7AA2FF] font-semibold">
                PIPELINE AUTOMATION
              </span>
            </div>
            <h3 id="ci-heading" className="text-2xl md:text-3xl font-semibold text-[#EAF0FA] tracking-tight font-sans m-0">
              Integrate with Your CI/CD
            </h3>
            <p className="text-xs md:text-sm text-[#9AA7BD] font-sans mt-1">
              Block malicious typosquats and verified reachable CVEs before merge with automated PR gating.
            </p>
          </div>

          {/* Tab Switcher */}
          <div role="tablist" aria-label="CI Integration Methods" className="flex p-1 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.16)] self-start md:self-auto">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'action'}
              onClick={() => {
                setActiveTab('action');
                setCopied(false);
              }}
              className={`px-4 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FFB547] ${
                activeTab === 'action'
                  ? 'bg-[#FFB547] text-[#1A1206] shadow-sm'
                  : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
              }`}
            >
              GitHub Action
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'cli'}
              onClick={() => {
                setActiveTab('cli');
                setCopied(false);
              }}
              className={`px-4 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FFB547] ${
                activeTab === 'cli'
                  ? 'bg-[#FFB547] text-[#1A1206] shadow-sm'
                  : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
              }`}
            >
              CLI Command
            </button>
          </div>
        </div>

        {/* Code Snippet Box */}
        <div className="relative rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.15)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#0B1220]/70 border-b border-[rgba(148,170,210,0.1)] text-xs font-mono text-[#7A89A3]">
            <span>{activeTab === 'action' ? '.github/workflows/sentinel-chain.yml' : 'terminal / bash'}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1 rounded-md text-xs font-mono font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              style={{
                background: copied ? '#4FE3C1' : 'linear-gradient(180deg, #FFC766 0%, #FF9F2E 100%)',
                color: '#1A1206'
              }}
            >
              {copied ? (
                <>
                  <span>✓</span>
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-4 md:p-5 font-mono text-xs md:text-sm text-[#EAF0FA] overflow-x-auto leading-relaxed select-all">
            <code>{activeContent}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
