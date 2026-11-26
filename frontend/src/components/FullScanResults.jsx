import { useRef, useState, useEffect, useMemo, Suspense, lazy } from 'react';
import html2pdf from 'html2pdf.js';
import { API_BASE_URL, extractErrorMessage } from '../config';
import CallChainDiagram from './CallChainDiagram';
import RiskGauge from './RiskGauge';

const PRCommentPreview = lazy(() => import('./PRCommentPreview'));

const RISK_WEIGHTS = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  SAFE: 1
};

export default function FullScanResults({ result = [], jobId, projectName }) {
  const reportRef = useRef();
  const [attestationData, setAttestationData] = useState(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState('');
  const [diffData, setDiffData] = useState(null);

  // View state: 'findings' or 'pr-comment'
  const [activeView, setActiveView] = useState('findings');

  // Results Explorer filters & sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [engineFilter, setEngineFilter] = useState('ALL'); // ALL, TYPOSQUAT, REACHABILITY, LICENSE, SANDBOX
  const [severityFilter, setSeverityFilter] = useState('ALL'); // ALL, CRITICAL, HIGH, MEDIUM, LOW, SAFE
  const [reachabilityFilter, setReachabilityFilter] = useState('ALL'); // ALL, REACHABLE, UNREACHABLE, UNKNOWN
  const [onlyNew, setOnlyNew] = useState(false);
  const [sortBy, setSortBy] = useState('risk'); // 'risk' or 'name'

  // Expand / collapse tracking for package cards
  const [collapsedPackages, setCollapsedPackages] = useState(new Set());

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
      margin: 0.5,
      filename: `sentinel-chain-${projectName || 'report'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: '#070B14' },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
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

  const newPackageNames = useMemo(() => {
    return new Set((diffData?.new || []).map((p) => p.package_name));
  }, [diffData]);

  const permissiveCount = result.filter((p) => p.license?.category === 'Permissive').length;
  const copyleftCount = result.filter((p) =>
    ['Weak Copyleft', 'Strong Copyleft'].includes(p.license?.category)
  ).length;
  const unknownLicenseCount = result.filter((p) =>
    ['Unknown', 'Unknown/Proprietary'].includes(p.license?.category)
  ).length;
  const hasLicenseData = result.some((p) => p.license);

  // Filter and sort packages
  const filteredPackages = useMemo(() => {
    return result
      .filter((pkg) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const nameMatch = (pkg.package_name || '').toLowerCase().includes(q);
          const targetMatch = (pkg.typosquat?.suspected_target || '').toLowerCase().includes(q);
          const cveMatch = (pkg.cves || []).some((c) =>
            (c.cve_id || c.id || '').toLowerCase().includes(q)
          );
          if (!nameMatch && !targetMatch && !cveMatch) return false;
        }

        // Engine filter
        if (engineFilter === 'TYPOSQUAT' && !pkg.typosquat) return false;
        if (engineFilter === 'REACHABILITY' && (!pkg.cves || pkg.cves.length === 0)) return false;
        if (engineFilter === 'LICENSE' && !pkg.license) return false;
        if (
          engineFilter === 'SANDBOX' &&
          (!pkg.sandbox?.evidence || pkg.sandbox.evidence.length === 0)
        )
          return false;

        // Severity filter
        if (severityFilter !== 'ALL' && (pkg.overall_risk || '').toUpperCase() !== severityFilter)
          return false;

        // Reachability status filter
        if (reachabilityFilter !== 'ALL') {
          const hasReachability = (pkg.cves || []).some(
            (c) => (c.reachability || '').toUpperCase() === reachabilityFilter
          );
          if (!hasReachability) return false;
        }

        // Only new since last scan
        if (onlyNew && !newPackageNames.has(pkg.package_name)) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return (a.package_name || '').localeCompare(b.package_name || '');
        }
        const scoreA =
          a.risk_score !== undefined
            ? a.risk_score
            : RISK_WEIGHTS[a.overall_risk?.toUpperCase()] || 0;
        const scoreB =
          b.risk_score !== undefined
            ? b.risk_score
            : RISK_WEIGHTS[b.overall_risk?.toUpperCase()] || 0;
        return scoreB - scoreA;
      });
  }, [
    result,
    searchQuery,
    engineFilter,
    severityFilter,
    reachabilityFilter,
    onlyNew,
    sortBy,
    newPackageNames
  ]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    engineFilter !== 'ALL' ||
    severityFilter !== 'ALL' ||
    reachabilityFilter !== 'ALL' ||
    onlyNew;

  const handleResetFilters = () => {
    setSearchQuery('');
    setEngineFilter('ALL');
    setSeverityFilter('ALL');
    setReachabilityFilter('ALL');
    setOnlyNew(false);
    setSortBy('risk');
  };

  // Expand / collapse helpers
  const togglePackageCollapse = (pkgName) => {
    setCollapsedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(pkgName)) {
        next.delete(pkgName);
      } else {
        next.add(pkgName);
      }
      return next;
    });
  };

  const isAllCollapsed =
    filteredPackages.length > 0 &&
    filteredPackages.every((p) => collapsedPackages.has(p.package_name));

  const handleToggleExpandAll = () => {
    if (isAllCollapsed) {
      setCollapsedPackages(new Set());
    } else {
      setCollapsedPackages(new Set(result.map((p) => p.package_name)));
    }
  };

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
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[#0B1220] hover:border-[#7AA2FF] text-[#EAF0FA] text-xs font-mono rounded-lg transition-colors border border-[rgba(148,170,210,0.2)] flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7AA2FF]"
              >
                <span>CycloneDX</span>
              </a>
              <a
                href={`${API_BASE_URL}/api/sbom/${jobId}?format=spdx`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[#0B1220] hover:border-[#7AA2FF] text-[#EAF0FA] text-xs font-mono rounded-lg transition-colors border border-[rgba(148,170,210,0.2)] flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7AA2FF]"
              >
                <span>SPDX</span>
              </a>
              <a
                href={`${API_BASE_URL}/api/sbom/${jobId}?format=vex`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[#0B1220] hover:border-[#7AA2FF] text-[#EAF0FA] text-xs font-mono rounded-lg transition-colors border border-[rgba(148,170,210,0.2)] flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7AA2FF]"
              >
                <span>VEX</span>
              </a>

              {!attestationData ? (
                <div className="flex flex-col items-end">
                  <button
                    onClick={handleSignProvenance}
                    disabled={isSigning}
                    className="px-3 py-1.5 bg-[#0B1220] hover:border-[#4FE3C1] disabled:opacity-40 text-[#4FE3C1] text-xs font-mono rounded-lg transition-colors border border-[#4FE3C1]/40 flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4FE3C1]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                    {isSigning ? 'Signing...' : 'Sign Provenance'}
                  </button>
                  {signError && (
                    <p className="text-[#FF5A5F] text-[10px] font-mono mt-1">{signError}</p>
                  )}
                </div>
              ) : (
                <div className="relative group flex items-center">
                  <div className="px-3 py-1.5 bg-[#4FE3C1]/15 border border-[#4FE3C1]/40 text-[#4FE3C1] text-xs font-mono rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
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
                        target="_blank"
                        rel="noopener noreferrer"
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
            className="px-3.5 py-1.5 bg-[#0B1220] hover:border-[#FFB547] text-[#EAF0FA] text-xs font-mono rounded-lg transition-colors border border-[rgba(148,170,210,0.2)] flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB547]"
          >
            <svg className="w-3.5 h-3.5 text-[#9AA7BD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Main View Mode Selector (Findings Explorer vs See it in a pull request) */}
      <div className="flex items-center justify-between border-b border-[rgba(148,170,210,0.16)] pb-3">
        <div className="inline-flex items-center p-1 bg-[#0B1220] border border-[rgba(148,170,210,0.18)] rounded-xl">
          <button
            type="button"
            onClick={() => setActiveView('findings')}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeView === 'findings'
                ? 'bg-[#FFB547] text-[#1A1206] shadow-sm'
                : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
            }`}
          >
            <span>Results Explorer</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                activeView === 'findings' ? 'bg-[#1A1206]/20 text-[#1A1206]' : 'bg-[#070B14] text-[#7A89A3]'
              }`}
            >
              {filteredPackages.length}/{result.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('pr-comment')}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeView === 'pr-comment'
                ? 'bg-[#4FE3C1] text-[#070B14] shadow-sm'
                : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
            }`}
          >
            <span>💬</span>
            <span>See it in a pull request</span>
          </button>
        </div>

        {activeView === 'findings' && (
          <button
            type="button"
            onClick={handleToggleExpandAll}
            className="px-3 py-1.5 rounded-lg border border-[rgba(148,170,210,0.2)] bg-[#0B1220] hover:border-[#FFB547] text-[#9AA7BD] hover:text-[#EAF0FA] text-xs font-mono transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB547]"
          >
            {isAllCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        )}
      </div>

      {/* View 1: PR Comment Preview */}
      {activeView === 'pr-comment' && (
        <Suspense
          fallback={
            <div className="p-12 text-center font-mono text-xs text-[#9AA7BD] bg-[#0B1220] rounded-xl border border-[rgba(148,170,210,0.16)]">
              Loading PR Comment Preview...
            </div>
          }
        >
          <PRCommentPreview />
        </Suspense>
      )}

      {/* View 2: Findings Explorer */}
      {activeView === 'findings' && (
        <div
          ref={reportRef}
          className="bg-[rgba(14,22,38,0.78)] p-6 md:p-8 rounded-[22px] border border-[rgba(148,170,210,0.16)] shadow-xl space-y-6 text-[#EAF0FA]"
        >
          {/* Header Block */}
          <div className="text-center border-b border-[rgba(148,170,210,0.16)] pb-6">
            <h1
              className="text-3xl md:text-4xl font-normal text-[#EAF0FA] mb-2 tracking-tight"
              style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
            >
              Sentinel-Chain Risk Report
            </h1>
            <p className="text-xs md:text-sm font-sans text-[#9AA7BD]">
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
                  <div
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 ${
                      diffData.summary.new_count > 0
                        ? 'bg-[#FF5A5F]/15 text-[#FF5A5F] border border-[#FF5A5F]/30'
                        : 'bg-[#4FE3C1]/15 text-[#4FE3C1] border border-[#4FE3C1]/30'
                    }`}
                  >
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
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-[#FF5A5F] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A5F]" />
                      New Findings Introduced in this Scan ({diffData.new.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => setOnlyNew(!onlyNew)}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
                        onlyNew
                          ? 'bg-[#FF5A5F] text-[#070B14] font-bold'
                          : 'bg-[#0B1220] text-[#FF5A5F] border border-[#FF5A5F]/30 hover:bg-[#FF5A5F]/20'
                      }`}
                    >
                      {onlyNew ? 'Showing Only New ✓' : 'Filter to New Only'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {diffData.new.map((nf, nidx) => (
                      <div
                        key={nidx}
                        className="flex items-center justify-between p-2.5 bg-[#0B1220] rounded-lg border border-[#FF5A5F]/20"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono text-xs font-semibold text-[#EAF0FA] truncate">
                            {nf.package_name}
                          </span>
                          <span className="text-[11px] text-[#7A89A3] font-mono">
                            {nf.typosquat
                              ? 'Typosquat'
                              : nf.cves?.length
                              ? `${nf.cves.length} CVE(s)`
                              : nf.sandbox
                              ? 'Sandbox'
                              : nf.license
                              ? 'License'
                              : ''}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${getRiskBadge(
                            nf.overall_risk
                          )}`}
                        >
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
                      <span
                        key={ridx}
                        className="px-2 py-1 bg-[#0B1220] text-[#9AA7BD] font-mono text-[11px] rounded border border-[#4FE3C1]/20"
                      >
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
            <div className="bg-[#0B1220] rounded-xl p-5 border border-[rgba(148,170,210,0.16)] grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl md:text-3xl font-mono font-semibold text-[#4FE3C1]">
                  {permissiveCount}
                </div>
                <div className="text-[11px] font-mono text-[#9AA7BD] uppercase tracking-wider mt-1">
                  Permissive
                </div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-mono font-semibold text-[#FFB547]">
                  {copyleftCount}
                </div>
                <div className="text-[11px] font-mono text-[#9AA7BD] uppercase tracking-wider mt-1">
                  Copyleft
                </div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-mono font-semibold text-[#7A89A3]">
                  {unknownLicenseCount}
                </div>
                <div className="text-[11px] font-mono text-[#9AA7BD] uppercase tracking-wider mt-1">
                  Unknown
                </div>
              </div>
            </div>
          )}

          {/* RESULTS EXPLORER CONTROLS TOOLBAR */}
          <div className="bg-[#0B1220] rounded-xl p-4 md:p-5 border border-[rgba(148,170,210,0.18)] space-y-4">
            {/* Search Input & Sort Control */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7A89A3]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter packages by name, suspected target, or CVE ID..."
                  aria-label="Search dependencies by package name or CVE"
                  className="w-full pl-9 pr-8 py-2 bg-[#070B14] border border-[rgba(148,170,210,0.2)] rounded-lg text-xs font-mono text-[#EAF0FA] placeholder-[#7A89A3] focus:border-[#FFB547] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FFB547] transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#7A89A3] hover:text-[#EAF0FA] text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-2 self-end md:self-auto">
                <span className="text-[11px] font-mono text-[#9AA7BD] uppercase">Sort:</span>
                <div className="inline-flex rounded-lg border border-[rgba(148,170,210,0.2)] bg-[#070B14] p-0.5">
                  <button
                    type="button"
                    onClick={() => setSortBy('risk')}
                    className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                      sortBy === 'risk'
                        ? 'bg-[#FFB547] text-[#1A1206] font-semibold'
                        : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
                    }`}
                  >
                    Risk
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy('name')}
                    className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                      sortBy === 'name'
                        ? 'bg-[#FFB547] text-[#1A1206] font-semibold'
                        : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
                    }`}
                  >
                    Name
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Chips Groups */}
            <div className="space-y-2.5 pt-2 border-t border-[rgba(148,170,210,0.1)]">
              {/* Group 1: Engine Filter Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[10px] font-mono uppercase text-[#7A89A3] w-24">Engine:</span>
                {[
                  { id: 'ALL', label: 'All Engines' },
                  { id: 'TYPOSQUAT', label: 'Typosquat' },
                  { id: 'REACHABILITY', label: 'Reachability' },
                  { id: 'LICENSE', label: 'License' },
                  { id: 'SANDBOX', label: 'Sandbox' }
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={engineFilter === chip.id}
                    onClick={() => setEngineFilter(chip.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                      engineFilter === chip.id
                        ? 'bg-[#FFB547] text-[#1A1206] font-semibold shadow-sm'
                        : 'bg-[#070B14] text-[#9AA7BD] hover:text-[#EAF0FA] border border-[rgba(148,170,210,0.15)]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Group 2: Severity Filter Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[10px] font-mono uppercase text-[#7A89A3] w-24">Severity:</span>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'CRITICAL', label: 'Critical' },
                  { id: 'HIGH', label: 'High' },
                  { id: 'MEDIUM', label: 'Medium' },
                  { id: 'LOW', label: 'Low' },
                  { id: 'SAFE', label: 'Safe' }
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={severityFilter === chip.id}
                    onClick={() => setSeverityFilter(chip.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                      severityFilter === chip.id
                        ? 'bg-[#FF5A5F] text-[#070B14] font-semibold shadow-sm'
                        : 'bg-[#070B14] text-[#9AA7BD] hover:text-[#EAF0FA] border border-[rgba(148,170,210,0.15)]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Group 3: Reachability Status Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[10px] font-mono uppercase text-[#7A89A3] w-24">Reachability:</span>
                {[
                  { id: 'ALL', label: 'All Status' },
                  { id: 'REACHABLE', label: 'REACHABLE' },
                  { id: 'UNREACHABLE', label: 'UNREACHABLE' },
                  { id: 'UNKNOWN', label: 'UNKNOWN' }
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={reachabilityFilter === chip.id}
                    onClick={() => setReachabilityFilter(chip.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                      reachabilityFilter === chip.id
                        ? 'bg-[#4FE3C1] text-[#070B14] font-semibold shadow-sm'
                        : 'bg-[#070B14] text-[#9AA7BD] hover:text-[#EAF0FA] border border-[rgba(148,170,210,0.15)]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Group 4: Modifiers (Only new since last scan + Clear all) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[rgba(148,170,210,0.08)]">
                <div className="flex items-center gap-2">
                  {diffData?.new && diffData.new.length > 0 && (
                    <button
                      type="button"
                      aria-pressed={onlyNew}
                      onClick={() => setOnlyNew(!onlyNew)}
                      className={`px-3 py-1 rounded-md text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition-all ${
                        onlyNew
                          ? 'bg-[#FF5A5F] text-[#070B14] font-bold shadow-sm'
                          : 'bg-[#070B14] text-[#FF5A5F] border border-[#FF5A5F]/30 hover:bg-[#FF5A5F]/15'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      <span>Only new since last scan ({diffData.new.length})</span>
                    </button>
                  )}
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] font-mono text-[#FFB547] hover:underline cursor-pointer flex items-center gap-1 ml-auto"
                  >
                    <span>Reset filters ✕</span>
                  </button>
                )}
              </div>
            </div>

            {/* Active Result Status Line */}
            <div
              aria-live="polite"
              className="text-[11px] font-mono text-[#9AA7BD] flex items-center justify-between pt-1"
            >
              <span>
                Showing <strong className="text-[#EAF0FA]">{filteredPackages.length}</strong> of{' '}
                <strong className="text-[#EAF0FA]">{result.length}</strong> scanned packages
              </span>
              {hasActiveFilters && (
                <span className="text-[#FFB547]">Filters active</span>
              )}
            </div>
          </div>

          {/* Packages List */}
          {filteredPackages.length === 0 ? (
            <div className="text-center p-12 bg-[#0B1220] rounded-xl border border-[rgba(148,170,210,0.16)] space-y-3">
              <p className="text-base font-sans text-[#EAF0FA]">
                {result.length === 0
                  ? 'No supply chain risks detected across any scanned dependencies.'
                  : 'No packages match the selected search or filter criteria.'}
              </p>
              {result.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 bg-[#FFB547] text-[#1A1206] font-mono font-semibold text-xs rounded-lg cursor-pointer hover:bg-[#FFC766] transition-colors"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPackages.map((pkg, idx) => {
                const isNew = newPackageNames.has(pkg.package_name);
                const isCollapsed = collapsedPackages.has(pkg.package_name);

                return (
                  <div
                    key={pkg.package_name || idx}
                    className={`bg-[#0B1220] rounded-xl border transition-all ${
                      isNew
                        ? 'border-[#FF5A5F]/60 shadow-[0_0_20px_rgba(255,90,95,0.15)]'
                        : 'border-[rgba(148,170,210,0.16)]'
                    }`}
                  >
                    {/* Package Header Card */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={!isCollapsed}
                      onClick={() => togglePackageCollapse(pkg.package_name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          togglePackageCollapse(pkg.package_name);
                        }
                      }}
                      className="p-5 flex flex-wrap justify-between items-center gap-4 cursor-pointer hover:bg-[rgba(148,170,210,0.03)] transition-colors rounded-xl select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB547]"
                    >
                      <div className="flex items-center gap-3">
                        {/* Collapse chevron */}
                        <span
                          className={`text-[#7A89A3] transition-transform duration-200 text-sm ${
                            isCollapsed ? '-rotate-90' : 'rotate-0'
                          }`}
                        >
                          ▼
                        </span>

                        <h3 className="text-lg md:text-xl font-mono font-bold text-[#EAF0FA]">
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
                        <span
                          className={`px-3 py-1 rounded-full font-mono text-xs font-semibold uppercase tracking-wider ${getRiskBadge(
                            pkg.overall_risk
                          )}`}
                        >
                          {pkg.overall_risk} RISK
                        </span>
                        <RiskGauge score={pkg.risk_score} level={pkg.overall_risk} size={56} />
                      </div>
                    </div>

                    {/* Expandable Package Details Body */}
                    {!isCollapsed && (
                      <div className="px-5 pb-6 pt-1 border-t border-[rgba(148,170,210,0.1)] space-y-4">
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
                              Suspected target:{' '}
                              <span className="text-[#EAF0FA] font-semibold">
                                {pkg.typosquat.suspected_target}
                              </span>{' '}
                              ({pkg.typosquat.risk_level} risk)
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
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    pkg.license.status === 'fail'
                                      ? 'bg-[#FF5A5F]'
                                      : pkg.license.status === 'warn'
                                      ? 'bg-[#FFB547]'
                                      : 'bg-[#4FE3C1]'
                                  }`}
                                />
                                License Policy ({pkg.license.category})
                              </h4>
                              <span
                                className={`font-mono text-xs font-semibold uppercase ${
                                  pkg.license.status === 'fail'
                                    ? 'text-[#FF5A5F]'
                                    : pkg.license.status === 'warn'
                                    ? 'text-[#FFB547]'
                                    : 'text-[#4FE3C1]'
                                }`}
                              >
                                {pkg.license.status}
                              </span>
                            </div>
                            <p className="text-xs text-[#9AA7BD] font-mono">
                              SPDX Identifier: <span className="text-[#EAF0FA]">{pkg.license.spdx_id}</span>
                            </p>
                            {pkg.license.reason && (
                              <p className="text-xs text-[#7A89A3] font-mono mt-1">
                                {pkg.license.reason}
                              </p>
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
                              <div
                                key={cidx}
                                className="p-3 bg-[#0B1220] rounded-lg border border-[rgba(148,170,210,0.1)] space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-mono text-xs font-semibold text-[#EAF0FA]">
                                    {cve.cve_id || cve.id}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                        cve.reachability === 'REACHABLE'
                                          ? 'bg-[#FF5A5F]/15 text-[#FF5A5F] border border-[#FF5A5F]/30'
                                          : 'bg-[#4FE3C1]/15 text-[#4FE3C1] border border-[#4FE3C1]/30'
                                      }`}
                                    >
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
                                {cve.reachability === 'REACHABLE' &&
                                  cve.call_chain &&
                                  cve.call_chain.length > 0 && (
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
                        {pkg.sandbox &&
                          pkg.sandbox.evidence &&
                          pkg.sandbox.evidence.length > 0 && (
                            <div className="bg-[#070B14] p-4 rounded-xl border border-[#7AA2FF]/20 space-y-2">
                              <h4 className="font-mono text-xs uppercase tracking-wider text-[#7AA2FF] flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#7AA2FF]" />
                                Sandbox Telemetry Evidence
                              </h4>
                              <ul className="text-xs font-mono space-y-1 text-[#9AA7BD]">
                                {pkg.sandbox.evidence.map((ev, eidx) => (
                                  <li key={eidx} className="flex items-start gap-2">
                                    <span className="text-[#FF5A5F] select-none">•</span>
                                    <span>
                                      {ev.message}{' '}
                                      <span className="text-[#7A89A3] uppercase">
                                        [{ev.level}]
                                      </span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
