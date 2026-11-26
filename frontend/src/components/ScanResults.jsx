import { useState, Fragment, lazy, Suspense } from 'react';
import CallChainDiagram from './CallChainDiagram';
import RiskGauge from './RiskGauge';

const PRCommentPreview = lazy(() => import('./PRCommentPreview'));

export default function ScanResults({ result }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeView, setActiveView] = useState('findings'); // 'findings' or 'pr-comment'

  if (!result) return null;

  const { findings = [], scanned_count = 0, message } = result;

  const toggleRow = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  // Severity Badges styling helper
  const renderRiskBadge = (level) => {
    const lvl = (level || 'LOW').toUpperCase();
    if (lvl === 'CRITICAL' || lvl === 'HIGH') {
      return (
        <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase bg-[#FF5A5F]/15 border border-[#FF5A5F]/40 text-[#FF5A5F]">
          {lvl}
        </span>
      );
    }
    if (lvl === 'MEDIUM') {
      return (
        <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase bg-[#FFB547]/15 border border-[#FFB547]/40 text-[#FFB547]">
          MEDIUM
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase bg-[#4FE3C1]/15 border border-[#4FE3C1]/40 text-[#4FE3C1]">
        LOW
      </span>
    );
  };

  // Reachability Badges styling helper
  const renderReachabilityBadge = (reachability) => {
    if (!reachability) {
      return <span className="text-[#7A89A3] font-mono text-xs">-</span>;
    }

    const r = reachability.toUpperCase();
    if (r === 'REACHABLE') {
      return (
        <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase bg-[#FF5A5F]/20 border border-[#FF5A5F] text-[#FF5A5F] flex items-center gap-1.5 w-max shadow-[0_0_8px_rgba(255,90,95,0.2)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A5F] animate-pulse" />
          REACHABLE
        </span>
      );
    }
    if (r === 'UNREACHABLE') {
      return (
        <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium uppercase bg-[#4FE3C1]/10 border border-[#4FE3C1]/30 text-[#4FE3C1]/75 w-max">
          UNREACHABLE
        </span>
      );
    }
    if (r === 'UNKNOWN') {
      return (
        <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium uppercase bg-[#0B1220] border border-dashed border-[#7A89A3] text-[#9AA7BD] w-max">
          ? UNKNOWN
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md text-[11px] font-mono text-[#9AA7BD] bg-[#0B1220] border border-[rgba(148,170,210,0.16)] w-max">
        {r}
      </span>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 animate-fadeIn">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FFB547]/10 border border-[#FFB547]/30 flex items-center justify-center text-[#FFB547]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h2
              className="text-2xl font-normal text-[#EAF0FA] m-0"
              style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
            >
              Scan Report
            </h2>
            <p className="text-xs text-[#9AA7BD] font-sans m-0 mt-0.5">
              Typosquatting &amp; Exploitability Analysis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle: Report vs PR Comment */}
          <div className="inline-flex items-center p-1 bg-[#0B1220] border border-[rgba(148,170,210,0.18)] rounded-xl">
            <button
              type="button"
              onClick={() => setActiveView('findings')}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'findings'
                  ? 'bg-[#FFB547] text-[#1A1206] shadow-sm'
                  : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
              }`}
            >
              Report View
            </button>
            <button
              type="button"
              onClick={() => setActiveView('pr-comment')}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeView === 'pr-comment'
                  ? 'bg-[#4FE3C1] text-[#070B14] shadow-sm'
                  : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
              }`}
            >
              <span>💬</span>
              <span>See it in a pull request</span>
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[rgba(148,170,210,0.16)] bg-[#0B1220] text-xs font-mono">
            <span className="text-[#9AA7BD]">Scanned:</span>
            <span className="font-bold text-[#EAF0FA]">{scanned_count}</span>
            <span className="text-[#7A89A3]">dependencies</span>
          </div>
        </div>
      </div>

      {message && (
        <div className="p-3.5 mb-6 rounded-xl border border-[rgba(148,170,210,0.2)] bg-[#0B1220]/80 text-[#9AA7BD] text-xs font-mono">
          {message}
        </div>
      )}

      {/* View 1: PR Comment Preview */}
      {activeView === 'pr-comment' ? (
        <Suspense
          fallback={
            <div className="p-12 text-center font-mono text-xs text-[#9AA7BD] bg-[#0B1220] rounded-xl border border-[rgba(148,170,210,0.16)]">
              Loading PR Comment Preview...
            </div>
          }
        >
          <PRCommentPreview />
        </Suspense>
      ) : findings && findings.length > 0 ? (
        /* View 2: Findings Table */
        <div className="rounded-2xl border border-[rgba(148,170,210,0.16)] bg-[rgba(14,22,38,0.78)] overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans text-sm">
              <thead>
                <tr className="bg-[#0B1220]/90 border-b border-[rgba(148,170,210,0.16)] text-[#7A89A3] text-xs font-mono uppercase tracking-wider">
                  <th className="p-4 font-medium">Package</th>
                  <th className="p-4 font-medium">Suspected Target</th>
                  <th className="p-4 font-medium">Risk</th>
                  <th className="p-4 font-medium">Reachability</th>
                  <th className="p-4 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(148,170,210,0.1)]">
                {findings.map((finding, idx) => {
                  const isExpanded = expandedRow === idx;
                  const reachabilityVal =
                    finding.reachability ||
                    finding.typosquat?.reachability ||
                    (finding.cves && finding.cves[0]?.reachability);
                  const callPath =
                    finding.call_path ||
                    finding.call_chain ||
                    (finding.cves && finding.cves[0]?.call_chain);

                  return (
                    <Fragment key={idx}>
                      <tr
                        onClick={() => toggleRow(idx)}
                        className={`transition-colors cursor-pointer select-none ${
                          isExpanded ? 'bg-[#0B1220]/90' : 'hover:bg-[#0B1220]/50'
                        }`}
                      >
                        <td className="p-4">
                          <span className="font-mono font-medium text-[#EAF0FA]">
                            {finding.package_name}
                          </span>
                          {finding.note && (
                            <span className="block text-[10px] font-mono text-[#FF5A5F] mt-0.5">
                              {finding.note}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          {finding.suspected_target ? (
                            <span className="px-2 py-0.5 rounded font-mono text-xs bg-[#FFB547]/10 text-[#FFB547] border border-[#FFB547]/30">
                              ≈ {finding.suspected_target}
                            </span>
                          ) : (
                            <span className="text-[#7A89A3] font-mono text-xs">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          {renderRiskBadge(finding.risk_level || finding.overall_risk)}
                        </td>
                        <td className="p-4">{renderReachabilityBadge(reachabilityVal)}</td>
                        <td className="p-4 text-right">
                          <button
                            type="button"
                            className="p-1 text-[#7A89A3] hover:text-[#EAF0FA] transition-transform"
                            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Details Pane */}
                      {isExpanded && (
                        <tr className="bg-[#070B14]/80">
                          <td colSpan="5" className="p-6 border-l-2 border-[#FFB547]">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* 1. Reasoning & Advisory */}
                              <div className="md:col-span-2 space-y-4">
                                <div>
                                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-[#7A89A3] mb-1.5 font-semibold">
                                    Analysis Reasoning
                                  </h4>
                                  <p className="text-sm text-[#EAF0FA] leading-relaxed">
                                    {finding.reasoning ||
                                      finding.typosquat?.reasoning ||
                                      'Flagged by heuristic matching against high-adoption community packages.'}
                                  </p>
                                </div>

                                {/* Call Path Diagram if reachable/call chain exists */}
                                {callPath && callPath.length > 0 && (
                                  <div>
                                    <CallChainDiagram
                                      steps={callPath}
                                      isVulnerable={reachabilityVal === 'REACHABLE'}
                                    />
                                  </div>
                                )}

                                {reachabilityVal && (
                                  <div>
                                    <h4 className="text-[11px] font-mono uppercase tracking-wider text-[#7A89A3] mb-1 font-semibold">
                                      Reachability Assessment
                                    </h4>
                                    <p className="text-xs text-[#9AA7BD] leading-normal font-mono bg-[#0B1220] p-3 rounded-lg border border-[rgba(148,170,210,0.1)]">
                                      {finding.reachability_reason ||
                                        finding.typosquat?.reachability_reason ||
                                        'AST tracer mapped entry points and imported identifiers.'}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* 2. Metrics & Risk Gauge */}
                              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#0B1220] border border-[rgba(148,170,210,0.16)]">
                                <span className="text-[11px] font-mono uppercase tracking-wider text-[#7A89A3] mb-2 font-semibold">
                                  Threat Calibration
                                </span>
                                <RiskGauge
                                  score={
                                    finding.overall_risk === 'CRITICAL'
                                      ? 95
                                      : finding.overall_risk === 'HIGH' || finding.risk_level === 'high'
                                      ? 80
                                      : finding.overall_risk === 'MEDIUM' || finding.risk_level === 'medium'
                                      ? 50
                                      : 20
                                  }
                                  level={finding.overall_risk || finding.risk_level}
                                  size={110}
                                />
                                {finding.distance_score !== undefined && (
                                  <div className="mt-3 text-center">
                                    <span className="text-[10px] font-mono text-[#7A89A3] uppercase">
                                      Levenshtein Edit:
                                    </span>
                                    <span className="font-mono text-sm font-bold text-[#EAF0FA] ml-1.5">
                                      {finding.distance_score}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl border border-dashed border-[rgba(148,170,210,0.28)] bg-[rgba(14,22,38,0.78)]">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#4FE3C1]/15 text-[#4FE3C1] mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3
            className="text-xl font-normal text-[#EAF0FA] mb-1"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
          >
            All dependencies clear
          </h3>
          <p className="text-[#9AA7BD] text-xs font-mono">
            Zero typosquat or exploitability hazards detected against reference dataset.
          </p>
        </div>
      )}
    </div>
  );
}
