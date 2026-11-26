import { useState } from 'react';
import sampleCommentMarkdown from '../data/sampleComment.md?raw';

export default function PRCommentPreview({ markdown = sampleCommentMarkdown }) {
  const [copied, setCopied] = useState(false);
  const [viewRaw, setViewRaw] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = markdown;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-6 text-left">
      {/* GitHub-style PR Comment Box */}
      <div className="rounded-xl border border-[rgba(148,170,210,0.22)] bg-[#0B1220] shadow-2xl overflow-hidden font-sans">
        {/* Comment Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#070B14] border-b border-[rgba(148,170,210,0.14)] text-xs text-[#9AA7BD]">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-[#FFB547] flex items-center justify-center text-[#1A1206] font-bold text-[11px] select-none">
              SC
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[#EAF0FA]">sentinel-chain[bot]</span>
              <span>commented on this pull request</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[rgba(148,170,210,0.18)] bg-[#0B1220] text-[#7A89A3]">
                Bot
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewRaw(!viewRaw)}
              className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-[rgba(148,170,210,0.2)] bg-[#0B1220] text-[#9AA7BD] hover:text-[#EAF0FA] transition-colors cursor-pointer"
            >
              {viewRaw ? 'Rendered View' : 'Raw Markdown'}
            </button>

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
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy Markdown</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Comment Body */}
        <div className="p-6 text-[#EAF0FA] text-sm leading-relaxed">
          {viewRaw ? (
            <pre className="p-4 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.1)] font-mono text-xs text-[#9AA7BD] whitespace-pre-wrap overflow-x-auto select-all">
              {markdown}
            </pre>
          ) : (
            <div className="space-y-4 font-sans">
              {/* Header Title */}
              <div className="flex items-center gap-2 pb-2 border-b border-[rgba(148,170,210,0.12)]">
                <span className="text-xl">🛡️</span>
                <h4 className="text-lg font-bold text-[#EAF0FA] m-0">
                  Sentinel-Chain Scan Results
                </h4>
              </div>

              <div className="font-mono text-xs text-[#9AA7BD]">
                <strong>Dependencies Scanned:</strong> 5
              </div>

              {/* Risk Summary Badges */}
              <div className="p-4 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.12)] space-y-1.5">
                <div className="font-mono text-xs font-semibold text-[#EAF0FA] mb-2">
                  📊 Risk Summary
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                  <div className="p-2 rounded bg-[#0B1220] border border-[#FF5A5F]/30 text-[#FF5A5F] flex items-center gap-1.5">
                    <span>🚨</span> <strong>CRITICAL:</strong> 1
                  </div>
                  <div className="p-2 rounded bg-[#0B1220] border border-[#FFB547]/30 text-[#FFB547] flex items-center gap-1.5">
                    <span>🔴</span> <strong>HIGH:</strong> 1
                  </div>
                  <div className="p-2 rounded bg-[#0B1220] border border-[#FFB547]/20 text-[#FFB547]/80 flex items-center gap-1.5">
                    <span>🟡</span> <strong>MEDIUM:</strong> 1
                  </div>
                  <div className="p-2 rounded bg-[#0B1220] border border-[#4FE3C1]/30 text-[#4FE3C1] flex items-center gap-1.5">
                    <span>🟢</span> <strong>LOW/SAFE:</strong> 1
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="border border-[rgba(148,170,210,0.14)] rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-[#070B14] border-b border-[rgba(148,170,210,0.12)] font-mono text-xs font-semibold text-[#EAF0FA]">
                  Detailed Findings
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="bg-[#070B14]/40 border-b border-[rgba(148,170,210,0.1)] text-[#7A89A3] text-[10px] uppercase">
                        <th className="px-4 py-2.5">Package</th>
                        <th className="px-4 py-2.5">Overall Risk</th>
                        <th className="px-4 py-2.5">Issues Found</th>
                        <th className="px-4 py-2.5">Reachability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(148,170,210,0.08)]">
                      <tr className="hover:bg-[#070B14]/40">
                        <td className="px-4 py-2.5 font-bold text-[#EAF0FA]"><code>jsonwebtoken</code></td>
                        <td className="px-4 py-2.5 text-[#FF5A5F]">🚨 CRITICAL</td>
                        <td className="px-4 py-2.5 text-[#9AA7BD]">1 CVE(s)</td>
                        <td className="px-4 py-2.5 text-[#FF5A5F] font-bold">Yes (1)</td>
                      </tr>
                      <tr className="hover:bg-[#070B14]/40">
                        <td className="px-4 py-2.5 font-bold text-[#EAF0FA]"><code>lodsh</code></td>
                        <td className="px-4 py-2.5 text-[#FFB547]">🔴 HIGH</td>
                        <td className="px-4 py-2.5 text-[#FFB547]">Typo-squatting</td>
                        <td className="px-4 py-2.5 text-[#9AA7BD]">No</td>
                      </tr>
                      <tr className="hover:bg-[#070B14]/40">
                        <td className="px-4 py-2.5 font-bold text-[#EAF0FA]"><code>pyyaml</code></td>
                        <td className="px-4 py-2.5 text-[#FFB547]/80">🟡 MEDIUM</td>
                        <td className="px-4 py-2.5 text-[#9AA7BD]">1 CVE(s)</td>
                        <td className="px-4 py-2.5 text-[#7AA2FF]">Unknown (1)</td>
                      </tr>
                      <tr className="hover:bg-[#070B14]/40">
                        <td className="px-4 py-2.5 font-bold text-[#EAF0FA]"><code>lodash</code></td>
                        <td className="px-4 py-2.5 text-[#4FE3C1]">🟢 LOW</td>
                        <td className="px-4 py-2.5 text-[#9AA7BD]">1 CVE(s)</td>
                        <td className="px-4 py-2.5 text-[#4FE3C1]">No</td>
                      </tr>
                      <tr className="hover:bg-[#070B14]/40">
                        <td className="px-4 py-2.5 font-bold text-[#EAF0FA]"><code>axios</code></td>
                        <td className="px-4 py-2.5 text-[#4FE3C1]">🟢 SAFE</td>
                        <td className="px-4 py-2.5 text-[#9AA7BD]">None</td>
                        <td className="px-4 py-2.5 text-[#4FE3C1]">No</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* License Summary */}
              <div className="font-mono text-xs text-[#9AA7BD] pt-2">
                <strong>⚖️ License Compliance:</strong> 5 Permissive · 0 Copyleft · 0 Proprietary
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
