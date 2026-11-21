import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export default function TrendDashboard() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [scans, setScans] = useState([]);
  const [loadingScans, setLoadingScans] = useState(false);
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
        body: json.dumps ? JSON.stringify({ name: newProjectName.trim() }) : JSON.stringify({ name: newProjectName.trim() }),
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

  const getRiskColor = (risk) => {
    switch (risk?.toUpperCase()) {
      case 'CRITICAL': return 'bg-red-500 text-white';
      case 'HIGH': return 'bg-orange-500 text-white';
      case 'MEDIUM': return 'bg-yellow-500 text-gray-900';
      case 'LOW': return 'bg-green-500 text-white';
      case 'SAFE': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
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
    <div className="space-y-8">
      {/* Header and Project Selector */}
      <div className="bg-dark-800 p-6 rounded-2xl border border-dark-700 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>📈</span> Project Risk Trends & History
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Track risk score improvements over time and inspect regressions across versions.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {projects.length > 0 ? (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-dark-900 border border-dark-600 rounded-xl px-4 py-2.5 text-gray-200 text-sm focus:outline-none focus:border-brand-500 font-medium"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.scan_count || 0} scans)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-500 italic">No projects recorded yet</span>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl text-sm font-medium border border-dark-600 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>+</span> New Project
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {selectedProjectId && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-dark-800 p-5 rounded-xl border border-dark-700">
            <span className="text-xs uppercase text-gray-400 font-medium tracking-wide">Current Risk Score</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold text-white">
                {latestScan ? latestScan.risk_score : 0}
              </span>
              <span className="text-xs text-gray-500">/ 100</span>
            </div>
            <div className="w-full bg-dark-900 h-2 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full ${
                  (latestScan?.risk_score || 0) > 50
                    ? 'bg-red-500'
                    : (latestScan?.risk_score || 0) > 20
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, latestScan?.risk_score || 0)}%` }}
              />
            </div>
          </div>

          <div className="bg-dark-800 p-5 rounded-xl border border-dark-700">
            <span className="text-xs uppercase text-gray-400 font-medium tracking-wide">Overall Risk Tier</span>
            <div className="mt-2">
              {latestScan ? (
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getRiskColor(latestScan.overall_risk)}`}>
                  {latestScan.overall_risk} RISK
                </span>
              ) : (
                <span className="text-gray-500 text-sm">No Scans</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {latestScan?.scanned_count || 0} dependencies analyzed
            </p>
          </div>

          <div className="bg-dark-800 p-5 rounded-xl border border-dark-700">
            <span className="text-xs uppercase text-gray-400 font-medium tracking-wide">Trend Trajectory</span>
            <div className="mt-2 flex items-center gap-2">
              {trendDirection === 'improving' && (
                <span className="text-green-400 font-bold text-lg flex items-center gap-1">
                  <span>📉</span> Improving ({trendDelta} pts)
                </span>
              )}
              {trendDirection === 'degrading' && (
                <span className="text-red-400 font-bold text-lg flex items-center gap-1">
                  <span>📈</span> Degrading (+{trendDelta} pts)
                </span>
              )}
              {trendDirection === 'stable' && (
                <span className="text-blue-400 font-bold text-lg flex items-center gap-1">
                  <span>➡️</span> Stable
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">Vs. previous scan baseline</p>
          </div>

          <div className="bg-dark-800 p-5 rounded-xl border border-dark-700">
            <span className="text-xs uppercase text-gray-400 font-medium tracking-wide">Total Historical Scans</span>
            <div className="mt-2 text-3xl font-extrabold text-white">
              {scans.length}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {latestScan?.completed_at ? new Date(latestScan.completed_at).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* Risk-Score-Over-Time Line Chart */}
      {selectedProjectId && (
        <div className="bg-dark-800 p-6 rounded-2xl border border-dark-700 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-white">Risk Score Over Time</h3>
              <p className="text-xs text-gray-400">Lower is better. Track security posture trajectory across scans.</p>
            </div>
            <span className="text-xs font-mono text-gray-400">Scale: 0 (Safe) → 100 (Critical)</span>
          </div>

          {loadingScans ? (
            <div className="h-60 flex items-center justify-center text-brand-400 animate-pulse">
              Loading scan history...
            </div>
          ) : chronologicalScans.length === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center text-gray-500 bg-dark-900/50 rounded-xl border border-dark-700">
              <span className="text-3xl mb-2">📊</span>
              <p className="text-sm">No completed scans recorded for this project yet.</p>
              <p className="text-xs text-gray-600 mt-1">Run a full scan with this project name to start tracking trends.</p>
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 overflow-visible">
                <defs>
                  <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#60A5FA" />
                    <stop offset="100%" stopColor="#F87171" />
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
                        stroke="#1F2937"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={paddingX - 10}
                        y={y + 4}
                        fill="#6B7280"
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
                    stroke="#3B82F6"
                    strokeWidth="3"
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
                      r={hoveredPoint?.scan.id === p.scan.id ? 7 : 5}
                      className="cursor-pointer transition-all"
                      fill={p.score >= 50 ? '#EF4444' : p.score >= 20 ? '#F59E0B' : '#10B981'}
                      stroke="#111827"
                      strokeWidth="2"
                      onMouseEnter={() => setHoveredPoint(p)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      onClick={() => handleOpenDiff(p.scan.id)}
                    />
                    <text
                      x={p.x}
                      y={height - 10}
                      fill="#9CA3AF"
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
                  className="absolute pointer-events-none bg-dark-900 border border-dark-600 rounded-lg p-2.5 shadow-2xl text-xs z-20 space-y-1 transform -translate-x-1/2 -translate-y-full font-sans"
                  style={{ left: `${(hoveredPoint.x / width) * 100}%`, top: `${(hoveredPoint.y / height) * 100 - 8}%` }}
                >
                  <div className="font-bold text-white flex items-center justify-between gap-3">
                    <span>Scan: {hoveredPoint.scan.id.slice(0, 8)}</span>
                    <span className={`px-1.5 py-0.2 rounded font-bold uppercase ${getRiskColor(hoveredPoint.scan.overall_risk)}`}>
                      {hoveredPoint.scan.overall_risk}
                    </span>
                  </div>
                  <div className="text-gray-300">Risk Score: <strong className="text-brand-400">{hoveredPoint.score}</strong> / 100</div>
                  <div className="text-gray-400">Deps: {hoveredPoint.scan.scanned_count} packages</div>
                  <div className="text-gray-500 text-[10px]">
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
        <div className="bg-dark-800 p-6 rounded-2xl border border-dark-700 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4">Historical Scans Log</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-dark-900/60 text-xs uppercase text-gray-400 border-b border-dark-700">
                <tr>
                  <th className="px-4 py-3">Scan ID</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Dependencies</th>
                  <th className="px-4 py-3">Risk Tier</th>
                  <th className="px-4 py-3">Risk Score</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {scans.map((s) => (
                  <tr key={s.id} className="hover:bg-dark-900/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-brand-400">
                      {s.id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {s.completed_at ? new Date(s.completed_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {s.scanned_count} packages
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${getRiskColor(s.overall_risk)}`}>
                        {s.overall_risk}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold font-mono">
                      {s.risk_score}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpenDiff(s.id)}
                        className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-xs font-medium border border-dark-600 transition-colors"
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-dark-700 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🔍</span> Scan Diff & Regression Report
                </h3>
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  Scan ID: {diffModalScan}
                </p>
              </div>
              <button
                onClick={() => setDiffModalScan(null)}
                className="text-gray-400 hover:text-white text-xl p-1 font-bold"
              >
                ✕
              </button>
            </div>

            {loadingDiff ? (
              <div className="py-12 text-center text-brand-400 animate-pulse">
                Computing diff against previous scan...
              </div>
            ) : diffData ? (
              <div className="space-y-6">
                {/* Summary badges */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-dark-900 p-3 rounded-xl border border-dark-700 text-center">
                    <div className="text-2xl font-bold text-red-400">{diffData.summary.new_count}</div>
                    <div className="text-xs text-gray-400 uppercase mt-1">New Findings</div>
                  </div>
                  <div className="bg-dark-900 p-3 rounded-xl border border-dark-700 text-center">
                    <div className="text-2xl font-bold text-green-400">{diffData.summary.resolved_count}</div>
                    <div className="text-xs text-gray-400 uppercase mt-1">Resolved</div>
                  </div>
                  <div className="bg-dark-900 p-3 rounded-xl border border-dark-700 text-center">
                    <div className="text-2xl font-bold text-gray-400">{diffData.summary.unchanged_count}</div>
                    <div className="text-xs text-gray-400 uppercase mt-1">Unchanged</div>
                  </div>
                </div>

                {/* New Findings List */}
                {diffData.new && diffData.new.length > 0 && (
                  <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-4 space-y-2">
                    <h4 className="text-sm font-bold text-red-400 flex items-center gap-2">
                      <span>🚨</span> New Regressions / Vulnerabilities
                    </h4>
                    <div className="space-y-2">
                      {diffData.new.map((f, idx) => (
                        <div key={idx} className="p-3 bg-dark-900 rounded-lg flex items-center justify-between border border-red-500/20">
                          <div>
                            <span className="font-mono font-bold text-white text-sm">{f.package_name}</span>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {f.typosquat ? `Typosquat target: ${f.typosquat.suspected_target}` : f.cves?.length ? `${f.cves.length} CVE(s)` : f.sandbox ? 'Suspicious Sandbox behavior' : f.license ? `License: ${f.license.spdx_id}` : 'Elevated risk'}
                            </p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${getRiskColor(f.overall_risk)}`}>
                            {f.overall_risk}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolved Findings List */}
                {diffData.resolved && diffData.resolved.length > 0 && (
                  <div className="bg-green-950/20 border border-green-500/30 rounded-xl p-4 space-y-2">
                    <h4 className="text-sm font-bold text-green-400 flex items-center gap-2">
                      <span>🎉</span> Resolved / Fixed Findings
                    </h4>
                    <div className="space-y-2">
                      {diffData.resolved.map((f, idx) => (
                        <div key={idx} className="p-3 bg-dark-900 rounded-lg flex items-center justify-between border border-green-500/20">
                          <span className="font-mono font-bold text-white text-sm">{f.package_name}</span>
                          <span className="text-xs text-green-400 font-semibold uppercase">Resolved</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clean report message */}
                {diffData.new.length === 0 && (
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-center text-green-400 text-sm">
                    ✅ No new security or compliance risks were introduced in this scan!
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No diff available.</p>
            )}

            <div className="pt-2 text-right">
              <button
                onClick={() => setDiffModalScan(null)}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateProject} className="bg-dark-800 border border-dark-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Create New Project</h3>
            <p className="text-xs text-gray-400">
              Projects group scans together so you can monitor risk evolution and automatically diff new PRs against baseline.
            </p>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-300 mb-1.5">Project Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. backend-service"
                required
                className="w-full px-3.5 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-sm font-bold transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
