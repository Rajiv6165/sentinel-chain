import { useRef, useState, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { API_BASE_URL, extractErrorMessage } from '../config';
import CallChainDiagram from './CallChainDiagram';
import RiskGauge from './RiskGauge';

export default function FullScanResults({ result, jobId, projectName }) {
  const reportRef = useRef();
  const [attestationData, setAttestationData] = useState(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState('');
  const [diffData, setDiffData] = useState(null);

  useEffect(() => {
    if (!jobId) return;
    fetch(`${API_BASE_URL}/api/scans/${jobId}/diff`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setDiffData(data);
      })
      .catch((err) => console.log('Diff fetch error:', err));
  }, [jobId]);

  const handleSignProvenance = async () => {
    if (!jobId) return;
    setIsSigning(true);
    setSignError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/sbom/${jobId}/attestation?sign=true`);
      if (!res.ok) {
        const errorDetail = await extractErrorMessage(res, 'Failed to generate signed attestation');
        throw new Error(errorDetail);
      }
      const data = await res.json();
      setAttestationData(data);
    } catch (err) {
      setSignError(err.message);
    } finally {
      setIsSigning(false);
    }
  };

  const handleExportPDF = () => {
    const element = reportRef.current;
    const opt = {
      margin:       0.5,
      filename:     `sentinel-chain-${projectName || 'report'}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, backgroundColor: '#070B14' },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  const getRiskBadge = (risk) => {
    switch (risk?.toUpperCase()) {
      case 'CRITICAL':
      case 'HIGH':
        return 'bg-[#FF5A5F]/15 text-[#FF5A5F] border border-[#FF5A5F]/30';
      case 'MEDIUM':
        return 'bg-[#FFB547]/15 text-[#FFB547] border border-[#FFB547]/30';
      case 'LOW':
      case 'SAFE':
        return 'bg-[#4FE3C1]/15 text-[#4FE3C1] border border-[#4FE3C1]/30';
      default:
        return 'bg-[rgba(148,170,210,0.1)] text-[#9AA7BD] border border-[rgba(148,170,210,0.2)]';
    }
  };

  const newPackageNames = new Set((diffData?.new || []).map((p) => p.package_name));

  const permissiveCount = result.filter(p => p.license?.category === 'Permissive').length;
  const copyleftCount = result.filter(p => ['Weak Copyleft', 'Strong Copyleft'].includes(p.license?.category)).length;
  const unknownLicenseCount = result.filter(p => ['Unknown', 'Unknown/Proprietary'].includes(p.license?.category)).length;
  const hasLicenseData = result.some(p => p.license);

  return (
    <div className="mt-8 space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-[rgba(14,22,38,0.78)] border border-[rgba(148,170,210,0.16)] rounded-2xl p-4 shadow-lg">
        <div>
          <h2 className="text-xl font-sans font-semibold text-[#EAF0FA]">Full Scan Results</h2>
          {projectName && (
            <p className="text-xs text-[#FFB547] font-mono mt-0.5">Project: {projectName}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {jobId && (
            <>
              <a 
                href={`${API_BASE_URL}/api/sbom/${jobId}?format=cyclonedx`}
                target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[#0B1220] hover:border-[#7AA2FF] text-[#EAF0FA] text-xs font-mono rounded-lg transition-colors border border-[rgba(148,170,210,0.2)] flex items-center gap-1.5"
              >
                <span>CycloneDX</span>
              </a>
              <a 
                href={`${API_BASE_URL}/api/sbom/${jobId}?format=spdx`}
                target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[#0B1220] hover:border-[#7AA2FF] text-[#EAF0FA] text-xs font-mono rounded-lg transition-colors border border-[rgba(148,170,210,0.2)] flex items-center gap-1.5"
              >
                <span>SPDX</span>
              </a>
              <a 
                href={`${API_BASE_URL}/api/sbom/${jobId}?format=vex`}
                target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[#0B1220] hover:border-[#7AA2FF] text-[#EAF0FA] text-xs font-mono rounded-lg transition-colors border border-[rgba(148,170,210,0.2)] flex items-center gap-1.5"
              >
                <span>VEX</span>
              </a>

              {!attestationData ? (
                <div className="flex flex-col items-end">
                  <button 
                    onClick={handleSignProvenance}
                    disabled={isSigning}
                    className="px-3 py-1.5 bg-[#0B1220] hover:border-[#4FE3C1] disabled:opacity-40 text-[#4FE3C1] text-xs font-mono rounded-lg transition-colors border border-[#4FE3C1]/40 flex items-center gap-1.5 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    {isSigning ? 'Signing...' : 'Sign Provenance'}
                  </button>
                  {signError && <p className="text-[#FF5A5F] text-[10px] font-mono mt-1">{signError}</p>}
                </div>
              ) : (
                <div className="relative group flex items-center">
                  <div className="px-3 py-1.5 bg-[#4FE3C1]/15 border border-[#4FE3C1]/40 text-[#4FE3C1] text-xs font-mono rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Verified in Rekor
                  </div>
                  {attestationData.signature?.hashedrekord && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-[#0B1220] border border-[rgba(148,170,210,0.25)] rounded-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none group-hover:pointer-events-auto">
                      <p className="text-[11px] text-[#9AA7BD] mb-2 font-mono break-all">
                        Log Index: {attestationData.signature.hashedrekord.logIndex}
                      </p>
                      <a 
                        href={`https://search.sigstore.dev/?logIndex=${attestationData.signature.hashedrekord.logIndex}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[#7AA2FF] hover:underline text-xs font-mono flex items-center gap-1"
                      >
                        Open Rekor Log →
                      </a>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <button 
            onClick={handleExportPDF}
            className="px-3.5 py-1.5 bg-[#0B1220] hover:border-[#FFB547] text-[#EAF0FA] text-xs font-mono rounded-lg transition-colors border border-[rgba(148,170,210,0.2)] flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-[#9AA7BD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Printable Report Container */}
      <div ref={reportRef} className="bg-[rgba(14,22,38,0.78)] p-8 rounded-[22px] border border-[rgba(148,170,210,0.16)] shadow-xl space-y-8 text-[#EAF0FA]">
        {/* Header Block */}
        <div className="text-center border-b border-[rgba(148,170,210,0.16)] pb-8">
          <h1
            className="text-4xl font-normal text-[#EAF0FA] mb-2 tracking-tight"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
          >
            Sentinel-Chain Risk Report
          </h1>
          <p className="text-sm font-sans text-[#9AA7BD]">
            Multi-engine AST reachability, typosquat heuristic analysis, and license governance
          </p>
        </div>

        {/* Scan History & Regression Diff Banner */}
        {diffData && (
          <div className="bg-[#0B1220] rounded-xl p-5 border border-[rgba(148,170,210,0.16)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(148,170,210,0.1)] pb-3">
              <div>
                <h3 className="text-base font-sans font-semibold text-[#EAF0FA] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#7AA2FF]" />
                  Scan History &amp; Regression Diff
                </h3>
                <p className="text-xs text-[#9AA7BD] font-mono mt-0.5">
                  {diffData.against_scan_id
                    ? `Compared against previous scan (${diffData.against_scan_id.slice(0, 8)})`
                    : 'Baseline scan recorded for this project.'}
                </p>
              </div>
              <div className="flex gap-2.5">
                <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 ${diffData.summary.new_count > 0 ? 'bg-[#FF5A5F]/15 text-[#FF5A5F] border border-[#FF5A5F]/30' : 'bg-[#4FE3C1]/15 text-[#4FE3C1] border border-[#4FE3C1]/30'}`}>
                  <span>{diffData.summary.new_count > 0 ? '●' : '✓'}</span>
                  <span>{diffData.summary.new_count} New Findings</span>
                </div>
                {diffData.summary.resolved_count > 0 && (
                  <div className="px-2.5 py-1 bg-[#4FE3C1]/15 text-[#4FE3C1] border border-[#4FE3C1]/30 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5">
                    <span>✓</span>
                    <span>{diffData.summary.resolved_count} Resolved</span>
                  </div>
                )}
                <div className="px-2.5 py-1 bg-[#070B14] text-[#9AA7BD] border border-[rgba(148,170,210,0.16)] rounded-lg text-xs font-mono">
                  {diffData.summary.unchanged_count} Unchanged
                </div>
              </div>
            </div>

            {/* New Findings List */}
            {diffData.new && diffData.new.length > 0 && (
              <div className="mt-2 bg-[#FF5A5F]/5 border border-[#FF5A5F]/20 rounded-xl p-4">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#FF5A5F] mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A5F]" />
                  New Findings Introduced in this Scan ({diffData.new.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {diffData.new.map((nf, nidx) => (
                    <div key={nidx} className="flex items-center justify-between p-2.5 bg-[#0B1220] rounded-lg border border-[#FF5A5F]/20">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-xs font-semibold text-[#EAF0FA] truncate">{nf.package_name}</span>
                        <span className="text-[11px] text-[#7A89A3] font-mono">
                          {nf.typosquat ? 'Typosquat' : nf.cves?.length ? `${nf.cves.length} CVE(s)` : nf.sandbox ? 'Sandbox' : nf.license ? 'License' : ''}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${getRiskBadge(nf.overall_risk)}`}>
                        {nf.overall_risk}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolved Findings List */}
            {diffData.resolved && diffData.resolved.length > 0 && (
              <div className="mt-2 bg-[#4FE3C1]/5 border border-[#4FE3C1]/20 rounded-xl p-3">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#4FE3C1] mb-1.5 flex items-center gap-1.5">
                  <span>✓</span> Findings Resolved Since Last Scan:
                </h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  {diffData.resolved.map((rf, ridx) => (
                    <span key={ridx} className="px-2 py-1 bg-[#0B1220] text-[#9AA7BD] font-mono text-[11px] rounded border border-[#4FE3C1]/20">
                      {rf.package_name} ({rf.overall_risk})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* License Metrics Overview */}
        {hasLicenseData && (
          <div className="bg-[#0B1220] rounded-xl p-6 border border-[rgba(148,170,210,0.16)] grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-mono font-semibold text-[#4FE3C1]">{permissiveCount}</div>
              <div className="text-xs font-mono text-[#9AA7BD] uppercase tracking-wider mt-1">Permissive</div>
            </div>
            <div>
              <div className="text-3xl font-mono font-semibold text-[#FFB547]">{copyleftCount}</div>
              <div className="text-xs font-mono text-[#9AA7BD] uppercase tracking-wider mt-1">Copyleft</div>
            </div>
            <div>
              <div className="text-3xl font-mono font-semibold text-[#7A89A3]">{unknownLicenseCount}</div>
              <div className="text-xs font-mono text-[#9AA7BD] uppercase tracking-wider mt-1">Unknown</div>
            </div>
          </div>
        )}

        {/* Packages List */}
        {result.length === 0 ? (
          <div className="text-center p-12 bg-[#0B1220] rounded-xl border border-[rgba(148,170,210,0.16)]">
            <p className="text-base font-sans text-[#9AA7BD]">No supply chain risks detected across any scanned dependencies.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {result.map((pkg, idx) => {
              const isNew = newPackageNames.has(pkg.package_name);
              return (
                <div
                  key={idx}
                  className={`bg-[#0B1220] rounded-xl p-6 border transition-all ${
                    isNew ? 'border-[#FF5A5F]/60 shadow-[0_0_20px_rgba(255,90,95,0.15)]' : 'border-[rgba(148,170,210,0.16)]'
                  }`}
                >
                  {/* Package Header with RiskGauge */}
                  <div className="flex flex-wrap justify-between items-center border-b border-[rgba(148,170,210,0.12)] pb-4 mb-5 gap-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-mono font-bold text-[#EAF0FA]">
                        {pkg.package_name}
                      </h3>
                      {pkg.version && (
                        <span className="text-xs font-mono text-[#7A89A3]">v{pkg.version}</span>
                      )}
                      {isNew && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#FF5A5F] text-[#070B14] animate-pulse">
                          New
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full font-mono text-xs font-semibold uppercase tracking-wider ${getRiskBadge(pkg.overall_risk)}`}>
                        {pkg.overall_risk} RISK
                      </span>
                      <RiskGauge score={pkg.risk_score} level={pkg.overall_risk} size={64} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Typosquat Section */}
                    {pkg.typosquat && (
                      <div className="bg-[#070B14] p-4 rounded-xl border border-[#FFB547]/20">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-mono text-xs uppercase tracking-wider text-[#FFB547] flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFB547]" />
                            Typosquat Analysis
                          </h4>
                          <span className="font-mono text-xs text-[#9AA7BD]">
                            Distance: {pkg.typosquat.distance_score}
                          </span>
                        </div>
                        <p className="text-xs text-[#9AA7BD] font-mono">
                          Suspected target: <span className="text-[#EAF0FA] font-semibold">{pkg.typosquat.suspected_target}</span> ({pkg.typosquat.risk_level} risk)
                        </p>
                        {pkg.typosquat.narrative && (
                          <div className="mt-2.5 p-3 bg-[#FFB547]/5 border border-[#FFB547]/15 rounded-lg text-xs text-[#EAF0FA] font-sans leading-relaxed">
                            {pkg.typosquat.narrative}
                          </div>
                        )}
                      </div>
                    )}

                    {/* License Section */}
                    {pkg.license && (
                      <div className="bg-[#070B14] p-4 rounded-xl border border-[rgba(148,170,210,0.12)]">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-mono text-xs uppercase tracking-wider text-[#9AA7BD] flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${pkg.license.status === 'fail' ? 'bg-[#FF5A5F]' : pkg.license.status === 'warn' ? 'bg-[#FFB547]' : 'bg-[#4FE3C1]'}`} />
                            License Policy ({pkg.license.category})
                          </h4>
                          <span className={`font-mono text-xs font-semibold uppercase ${pkg.license.status === 'fail' ? 'text-[#FF5A5F]' : pkg.license.status === 'warn' ? 'text-[#FFB547]' : 'text-[#4FE3C1]'}`}>
                            {pkg.license.status}
                          </span>
                        </div>
                        <p className="text-xs text-[#9AA7BD] font-mono">
                          SPDX Identifier: <span className="text-[#EAF0FA]">{pkg.license.spdx_id}</span>
                        </p>
                        {pkg.license.reason && (
                          <p className="text-xs text-[#7A89A3] font-mono mt-1">{pkg.license.reason}</p>
                        )}
                      </div>
                    )}

                    {/* Reachability Section */}
                    {pkg.cves && pkg.cves.length > 0 && (
                      <div className="bg-[#070B14] p-4 rounded-xl border border-[rgba(148,170,210,0.12)] space-y-3">
                        <h4 className="font-mono text-xs uppercase tracking-wider text-[#EAF0FA] flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A5F]" />
                          CVE &amp; AST Reachability ({pkg.cves.length})
                        </h4>

                        {pkg.cves.map((cve, cidx) => (
                          <div key={cidx} className="p-3 bg-[#0B1220] rounded-lg border border-[rgba(148,170,210,0.1)] space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-xs font-semibold text-[#EAF0FA]">{cve.cve_id || cve.id}</span>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${cve.reachability === 'REACHABLE' ? 'bg-[#FF5A5F]/15 text-[#FF5A5F] border border-[#FF5A5F]/30' : 'bg-[#4FE3C1]/15 text-[#4FE3C1] border border-[#4FE3C1]/30'}`}>
                                  {cve.reachability}
                                </span>
                                {cve.epss_score !== undefined && (
                                  <span className="font-mono text-[10px] text-[#9AA7BD]">
                                    EPSS: {(cve.epss_score * 100).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Call Chain Diagram if reachable and chain exists */}
                            {cve.reachability === 'REACHABLE' && cve.call_chain && cve.call_chain.length > 0 && (
                              <div className="my-2">
                                <CallChainDiagram
                                  callChain={cve.call_chain}
                                  packageName={pkg.package_name}
                                  entrypoint={cve.call_chain[0]}
                                  vulnerableFunction={cve.call_chain[cve.call_chain.length - 1]}
                                />
                              </div>
                            )}

                            {cve.narrative && (
                              <p className="text-xs text-[#9AA7BD] font-sans leading-relaxed pt-1">
                                {cve.narrative}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sandbox Section */}
                    {pkg.sandbox && pkg.sandbox.evidence && pkg.sandbox.evidence.length > 0 && (
                      <div className="bg-[#070B14] p-4 rounded-xl border border-[#7AA2FF]/20 space-y-2">
                        <h4 className="font-mono text-xs uppercase tracking-wider text-[#7AA2FF] flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#7AA2FF]" />
                          Sandbox Telemetry Evidence
                        </h4>
                        <ul className="text-xs font-mono space-y-1 text-[#9AA7BD]">
                          {pkg.sandbox.evidence.map((ev, eidx) => (
                            <li key={eidx} className="flex items-start gap-2">
                              <span className="text-[#FF5A5F] select-none">•</span>
                              <span>{ev.message} <span className="text-[#7A89A3] uppercase">[{ev.level}]</span></span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
