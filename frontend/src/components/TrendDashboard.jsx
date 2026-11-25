import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export default function TrendDashboard() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [scans, setScans] = useState([]);
  const [loadingScans, setLoadingScans] = useState(false);
  const [_loadingProjects, setLoadingProjects] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [diffModalScan, setDiffModalScan] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // 1. Fetch Projects
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0 && !selectedProjectId) {
          setSelectedProjectId(data[0].id || data[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // 2. Fetch Scans when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setScans([]);
      return;
    }

    const fetchScans = async () => {
      setLoadingScans(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/projects/${selectedProjectId}/scans`);
        if (res.ok) {
          const data = await res.json();
          // Filter completed scans and reverse for chronological order (oldest -> newest for graph)
          setScans(data.filter((s) => s.status === 'completed'));
        }
      } catch (err) {
        console.error('Failed to fetch scans:', err);
      } finally {
        setLoadingScans(false);
      }
    };

    fetchScans();
  }, [selectedProjectId]);

  // Create Project handler
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setNewProjectName('');
        setShowCreateModal(false);
        await fetchProjects();
        setSelectedProjectId(created.id || created.name);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  // Inspect Diff handler
  const handleOpenDiff = async (scanId) => {
    setDiffModalScan(scanId);
    setLoadingDiff(true);
    setDiffData(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/scans/${scanId}/diff`);
      if (res.ok) {
        const data = await res.json();
        setDiffData(data);
      }
    } catch (err) {
      console.error('Failed to fetch diff:', err);
    } finally {
      setLoadingDiff(false);
    }
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

  // Chart Coordinates Calculation
  // Scans are chronological (oldest -> newest)
  const chronologicalScans = [...scans].reverse();
  const width = 760;
  const height = 240;
  const paddingX = 50;
  const paddingY = 30;
  const graphWidth = width - paddingX * 2;
  const graphHeight = height - paddingY * 2;

  const points = chronologicalScans.map((scan, idx) => {
    const score = Math.max(0, Math.min(100, scan.risk_score || 0));
    const x = chronologicalScans.length === 1
      ? width / 2
      : paddingX + (idx / (chronologicalScans.length - 1)) * graphWidth;
    const y = height - paddingY - (score / 100) * graphHeight;
    return { x, y, score, scan, idx };
  });

  const pathD = points.length > 0
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '')
    : '';

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
    : '';

  // Trend computation (comparing last 2 scans)
  let trendDirection = 'stable';
  let trendDelta = 0;
  if (chronologicalScans.length >= 2) {
    const latestScore = chronologicalScans[chronologicalScans.length - 1].risk_score || 0;
    const prevScore = chronologicalScans[chronologicalScans.length - 2].risk_score || 0;
    trendDelta = Math.round((latestScore - prevScore) * 10) / 10;
    if (trendDelta < 0) trendDirection = 'improving';
    else if (trendDelta > 0) trendDirection = 'degrading';
  }

  const latestScan = scans.length > 0 ? scans[0] : null;

  return (
    <div className="space-y-6">
      {/* Header and Project Selector */}
      <div className="bg-[rgba(14,22,38,0.78)] p-6 rounded-[22px] border border-[rgba(148,170,210,0.16)] shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-sans font-semibold text-[#EAF0FA] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#7AA2FF]" />
            Project Risk Trends &amp; History
          </h2>
          <p className="text-xs font-mono text-[#9AA7BD] mt-1">
            Track risk score trajectory over time and inspect regressions across builds.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {projects.length > 0 ? (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-[#0B1220] border border-[rgba(148,170,210,0.2)] rounded-xl px-3.5 py-2 text-[#EAF0FA] text-xs font-mono focus:outline-none focus:border-[#FFB547]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.scan_count || 0} scans)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-mono text-[#7A89A3] italic">No projects recorded yet</span>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 bg-[#0B1220] hover:border-[#FFB547] text-[#EAF0FA] rounded-xl text-xs font-mono border border-[rgba(148,170,210,0.2)] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>+</span> New Project
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {selectedProjectId && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[rgba(14,22,38,0.78)] p-5 rounded-2xl border border-[rgba(148,170,210,0.16)]">
            <span className="text-[11px] uppercase text-[#9AA7BD] font-mono tracking-wider">Current Risk Score</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-mono font-bold text-[#EAF0FA]">
                {latestScan ? latestScan.risk_score : 0}
              </span>
              <span className="text-xs text-[#7A89A3] font-mono">/ 100</span>
            </div>
            <div className="w-full bg-[#070B14] h-1.5 rounded-full mt-3 overflow-hidden border border-[rgba(148,170,210,0.1)]">
              <div
                className={`h-full ${
                  (latestScan?.risk_score || 0) > 50
                    ? 'bg-[#FF5A5F]'
                    : (latestScan?.risk_score || 0) > 20
                    ? 'bg-[#FFB547]'
                    : 'bg-[#4FE3C1]'
                }`}
                style={{ width: `${Math.min(100, latestScan?.risk_score || 0)}%` }}
              />
            </div>
          </div>

          <div className="bg-[rgba(14,22,38,0.78)] p-5 rounded-2xl border border-[rgba(148,170,210,0.16)]">
            <span className="text-[11px] uppercase text-[#9AA7BD] font-mono tracking-wider">Overall Risk Tier</span>
            <div className="mt-2">
              {latestScan ? (
                <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-mono font-semibold uppercase tracking-wider ${getRiskBadge(latestScan.overall_risk)}`}>
                  {latestScan.overall_risk} RISK
                </span>
              ) : (
                <span className="text-[#7A89A3] text-xs font-mono">No Scans</span>
              )}
            </div>
            <p className="text-[11px] font-mono text-[#7A89A3] mt-3">
              {latestScan?.scanned_count || 0} dependencies analyzed
            </p>
          </div>

          <div className="bg-[rgba(14,22,38,0.78)] p-5 rounded-2xl border border-[rgba(148,170,210,0.16)]">
            <span className="text-[11px] uppercase text-[#9AA7BD] font-mono tracking-wider">Trend Trajectory</span>
            <div className="mt-2 flex items-center gap-2 font-mono">
              {trendDirection === 'improving' && (
                <span className="text-[#4FE3C1] font-semibold text-sm flex items-center gap-1">
                  <span>↓</span> Improving ({trendDelta} pts)
                </span>
              )}
              {trendDirection === 'degrading' && (
                <span className="text-[#FF5A5F] font-semibold text-sm flex items-center gap-1">
                  <span>↑</span> Degrading (+{trendDelta} pts)
                </span>
              )}
              {trendDirection === 'stable' && (
                <span className="text-[#7AA2FF] font-semibold text-sm flex items-center gap-1">
                  <span>→</span> Stable
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-[#7A89A3] mt-2">Vs. previous scan baseline</p>
          </div>

          <div className="bg-[rgba(14,22,38,0.78)] p-5 rounded-2xl border border-[rgba(148,170,210,0.16)]">
            <span className="text-[11px] uppercase text-[#9AA7BD] font-mono tracking-wider">Total Scans Logged</span>
            <div className="mt-2 text-3xl font-mono font-bold text-[#EAF0FA]">
              {scans.length}
            </div>
            <p className="text-[11px] font-mono text-[#7A89A3] mt-2">
              {latestScan?.completed_at ? new Date(latestScan.completed_at).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* Risk-Score-Over-Time Line Chart */}
      {selectedProjectId && (
        <div className="bg-[rgba(14,22,38,0.78)] p-6 rounded-[22px] border border-[rgba(148,170,210,0.16)] shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-base font-sans font-semibold text-[#EAF0FA]">Risk Score Over Time</h3>
              <p className="text-xs font-mono text-[#9AA7BD]">Lower is better. Track security posture trajectory across scans.</p>
            </div>
            <span className="text-xs font-mono text-[#7A89A3]">Scale: 0 (Safe) → 100 (Critical)</span>
          </div>

          {loadingScans ? (
            <div className="h-60 flex items-center justify-center text-[#FFB547] font-mono text-xs animate-pulse">
              Loading scan history...
            </div>
          ) : chronologicalScans.length === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center text-[#7A89A3] bg-[#0B1220]/50 rounded-xl border border-[rgba(148,170,210,0.12)]">
              <span className="text-xs font-mono mb-1">No completed scans recorded for this project yet.</span>
              <span className="text-[11px] font-mono text-[#7A89A3]">Run a full unified scan with this project name to start tracking trends.</span>
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 overflow-visible">
                <defs>
                  <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF5A5F" stopOpacity="0.3" />
                    <stop offset="50%" stopColor="#FFB547" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#4FE3C1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Grid Lines */}
                {[0, 25, 50, 75, 100].map((val) => {
                  const y = height - paddingY - (val / 100) * graphHeight;
                  return (
                    <g key={val}>
                      <line
                        x1={paddingX}
                        y1={y}
                        x2={width - paddingX}
                        y2={y}
                        stroke="rgba(148,170,210,0.1)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={paddingX - 10}
                        y={y + 4}
                        fill="#7A89A3"
                        fontSize="10"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Gradient Fill under Path */}
                {areaD && <path d={areaD} fill="url(#riskGradient)" />}

                {/* Polyline Path */}
                {pathD && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#FFB547"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Data Points */}
                {points.map((p) => (
                  <g key={p.scan.id}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={hoveredPoint?.scan.id === p.scan.id ? 6 : 4}
                      className="cursor-pointer transition-all"
                      fill={p.score >= 50 ? '#FF5A5F' : p.score >= 20 ? '#FFB547' : '#4FE3C1'}
                      stroke="#070B14"
                      strokeWidth="2"
                      onMouseEnter={() => setHoveredPoint(p)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      onClick={() => handleOpenDiff(p.scan.id)}
                    />
                    <text
                      x={p.x}
                      y={height - 10}
                      fill="#7A89A3"
                      fontSize="9"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {p.scan.completed_at
                        ? new Date(p.scan.completed_at).toLocaleDateString([], { month: 'numeric', day: 'numeric' })
                        : `S#${p.idx + 1}`}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Tooltip Overlay */}
              {hoveredPoint && (
                <div
                  className="absolute pointer-events-none bg-[#0B1220] border border-[rgba(148,170,210,0.25)] rounded-xl p-3 shadow-2xl text-xs z-20 space-y-1 transform -translate-x-1/2 -translate-y-full font-mono"
                  style={{ left: `${(hoveredPoint.x / width) * 100}%`, top: `${(hoveredPoint.y / height) * 100 - 8}%` }}
                >
                  <div className="font-semibold text-[#EAF0FA] flex items-center justify-between gap-3">
                    <span>Scan: {hoveredPoint.scan.id.slice(0, 8)}</span>
                    <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[10px] ${getRiskBadge(hoveredPoint.scan.overall_risk)}`}>
                      {hoveredPoint.scan.overall_risk}
                    </span>
                  </div>
                  <div className="text-[#9AA7BD]">Risk Score: <strong className="text-[#FFB547]">{hoveredPoint.score}</strong> / 100</div>
                  <div className="text-[#7A89A3]">Deps: {hoveredPoint.scan.scanned_count} packages</div>
                  <div className="text-[#7A89A3] text-[10px]">
                    {hoveredPoint.scan.completed_at ? new Date(hoveredPoint.scan.completed_at).toLocaleString() : ''}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Historical Scans Table */}
      {selectedProjectId && scans.length > 0 && (
        <div className="bg-[rgba(14,22,38,0.78)] p-6 rounded-[22px] border border-[rgba(148,170,210,0.16)] shadow-xl">
          <h3 className="text-base font-sans font-semibold text-[#EAF0FA] mb-4">Historical Scans Log</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono text-[#9AA7BD]">
              <thead className="bg-[#0B1220] uppercase text-[#7A89A3] border-b border-[rgba(148,170,210,0.12)]">
                <tr>
                  <th className="px-4 py-3">Scan ID</th>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Dependencies</th>
                  <th className="px-4 py-3">Risk Tier</th>
                  <th className="px-4 py-3">Risk Score</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(148,170,210,0.08)]">
                {scans.map((s) => (
                  <tr key={s.id} className="hover:bg-[#0B1220]/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#FFB547]">
                      {s.id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-[#7A89A3]">
                      {s.completed_at ? new Date(s.completed_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-[#EAF0FA]">
                      {s.scanned_count} packages
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${getRiskBadge(s.overall_risk)}`}>
                        {s.overall_risk}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#EAF0FA]">
                      {s.risk_score}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpenDiff(s.id)}
                        className="px-2.5 py-1 bg-[#0B1220] hover:border-[#FFB547] text-[#EAF0FA] rounded-lg text-xs border border-[rgba(148,170,210,0.2)] transition-colors cursor-pointer"
                      >
                        Diff vs Prev
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {diffModalScan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B1220] border border-[rgba(148,170,210,0.25)] rounded-[22px] max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-[rgba(148,170,210,0.12)] pb-4">
              <div>
                <h3 className="text-lg font-sans font-semibold text-[#EAF0FA] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#7AA2FF]" />
                  Scan Diff &amp; Regression Report
                </h3>
                <p className="text-xs text-[#7A89A3] mt-1 font-mono">
                  Scan ID: {diffModalScan}
                </p>
              </div>
              <button
                onClick={() => setDiffModalScan(null)}
                className="text-[#7A89A3] hover:text-white text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {loadingDiff ? (
              <div className="py-12 text-center text-[#FFB547] font-mono text-xs animate-pulse">
                Computing diff against previous baseline...
              </div>
            ) : diffData ? (
              <div className="space-y-6">
                {/* Summary badges */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#070B14] p-3 rounded-xl border border-[rgba(148,170,210,0.12)] text-center">
                    <div className="text-2xl font-mono font-bold text-[#FF5A5F]">{diffData.summary.new_count}</div>
                    <div className="text-xs font-mono text-[#7A89A3] uppercase mt-1">New Findings</div>
                  </div>
                  <div className="bg-[#070B14] p-3 rounded-xl border border-[rgba(148,170,210,0.12)] text-center">
                    <div className="text-2xl font-mono font-bold text-[#4FE3C1]">{diffData.summary.resolved_count}</div>
                    <div className="text-xs font-mono text-[#7A89A3] uppercase mt-1">Resolved</div>
                  </div>
                  <div className="bg-[#070B14] p-3 rounded-xl border border-[rgba(148,170,210,0.12)] text-center">
                    <div className="text-2xl font-mono font-bold text-[#9AA7BD]">{diffData.summary.unchanged_count}</div>
                    <div className="text-xs font-mono text-[#7A89A3] uppercase mt-1">Unchanged</div>
                  </div>
                </div>

                {/* New Findings List */}
                {diffData.new && diffData.new.length > 0 && (
                  <div className="bg-[#FF5A5F]/5 border border-[#FF5A5F]/20 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-[#FF5A5F] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A5F]" />
                      New Regressions / Vulnerabilities
                    </h4>
                    <div className="space-y-2">
                      {diffData.new.map((f, idx) => (
                        <div key={idx} className="p-3 bg-[#070B14] rounded-lg flex items-center justify-between border border-[#FF5A5F]/20">
                          <div>
                            <span className="font-mono font-semibold text-[#EAF0FA] text-xs">{f.package_name}</span>
                            <p className="text-[11px] font-mono text-[#7A89A3] mt-0.5">
                              {f.typosquat ? `Typosquat target: ${f.typosquat.suspected_target}` : f.cves?.length ? `${f.cves.length} CVE(s)` : f.sandbox ? 'Suspicious Sandbox behavior' : f.license ? `License: ${f.license.spdx_id}` : 'Elevated risk'}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${getRiskBadge(f.overall_risk)}`}>
                            {f.overall_risk}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolved Findings List */}
                {diffData.resolved && diffData.resolved.length > 0 && (
                  <div className="bg-[#4FE3C1]/5 border border-[#4FE3C1]/20 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-[#4FE3C1] flex items-center gap-2">
                      <span>✓</span> Resolved / Fixed Findings
                    </h4>
                    <div className="space-y-2">
                      {diffData.resolved.map((f, idx) => (
                        <div key={idx} className="p-3 bg-[#070B14] rounded-lg flex items-center justify-between border border-[#4FE3C1]/20">
                          <span className="font-mono font-semibold text-[#EAF0FA] text-xs">{f.package_name}</span>
                          <span className="text-[10px] font-mono text-[#4FE3C1] uppercase">Resolved</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {diffData.new.length === 0 && (
                  <div className="p-4 bg-[#4FE3C1]/5 border border-[#4FE3C1]/20 rounded-xl text-center text-[#4FE3C1] text-xs font-mono">
                    ✓ No new security or compliance risks introduced in this scan.
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[#7A89A3] text-xs font-mono">No diff available.</p>
            )}

            <div className="pt-2 text-right">
              <button
                onClick={() => setDiffModalScan(null)}
                className="px-4 py-2 bg-[#070B14] hover:border-[#FFB547] text-[#EAF0FA] rounded-xl text-xs font-mono border border-[rgba(148,170,210,0.2)] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateProject} className="bg-[#0B1220] border border-[rgba(148,170,210,0.25)] rounded-[22px] max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-sans font-semibold text-[#EAF0FA]">Create New Project</h3>
            <p className="text-xs text-[#9AA7BD] font-mono">
              Group repository scans together to monitor risk posture trajectory across builds.
            </p>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#9AA7BD] mb-1.5">Project Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. backend-service"
                required
                className="w-full px-3.5 py-2.5 bg-[#070B14] border border-[rgba(148,170,210,0.2)] rounded-xl text-[#EAF0FA] placeholder-[#7A89A3] font-mono text-xs focus:outline-none focus:border-[#FFB547]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3.5 py-2 bg-[#070B14] hover:border-[rgba(148,170,210,0.4)] text-[#9AA7BD] rounded-xl text-xs font-mono border border-[rgba(148,170,210,0.2)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-[#1A1206] font-mono font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                style={{
                  background: 'linear-gradient(180deg, #FFC766 0%, #FF9F2E 100%)',
                }}
              >
                Create Project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
