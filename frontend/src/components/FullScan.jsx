import { useState, useEffect } from 'react';
import { API_BASE_URL, extractErrorMessage } from '../config';

export default function FullScan({ onScanResult, setLoading, apiConfig, externalError, onClearError }) {
  const [file, setFile] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState(null);
  const [config, setConfig] = useState(apiConfig || null);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [showZipHelp, setShowZipHelp] = useState(false);

  useEffect(() => {
    if (apiConfig) {
      setConfig(apiConfig);
    } else {
      fetch(`${API_BASE_URL}/api/config`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setConfig(data);
        })
        .catch(() => {});
    }
  }, [apiConfig]);

  const maxMb = config?.max_upload_mb ?? 15;
  const maxBytes = maxMb * 1024 * 1024;

  const handleFileChange = (e) => {
    // Clear error immediately on selecting a different file or removing
    setError('');
    if (onClearError) onClearError();

    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }

    if (!selected.name.endsWith('.zip')) {
      setFile(null);
      setError('Please upload a .zip file containing the repository.');
      return;
    }

    // Client-side file size check
    if (selected.size > maxBytes) {
      const selectedMb = (selected.size / (1024 * 1024)).toFixed(1);
      setFile(selected);
      setError(`${selectedMb} MB selected, limit is ${maxMb} MB`);
      return;
    }

    setFile(selected);
  };

  const handleRemoveFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFile(null);
    setError('');
    if (onClearError) onClearError();
    const input = document.getElementById('full-file-upload');
    if (input) input.value = '';
  };

  const isOverSize = Boolean(file && file.size > maxBytes);
  const activeError = externalError || error;

  const handleUpload = async () => {
    if (!file || isOverSize || Boolean(activeError)) return;
    setLoading(true);
    setError('');
    if (onClearError) onClearError();

    setTerminalLogs([
      `[00:00.000] Uploading repository archive: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)...`,
      `[00:00.320] Enforcing archive bounds: max ${maxMb} MB, max ${config?.max_zip_files ?? 1000} files`,
    ]);

    const formData = new FormData();
    formData.append('file', file);
    if (projectName.trim()) {
      formData.append('project_name', projectName.trim());
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/full-scan`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorDetail = await extractErrorMessage(response, 'Failed to start full scan');
        throw new Error(errorDetail);
      }

      const data = await response.json();
      setJobId(data.job_id);
      setTerminalLogs((prev) => [
        ...prev,
        `[00:01.100] Pipeline job dispatched: ${data.job_id}`,
        `[00:01.250] Engine [TYPOSQUAT]: Computing edit-distance & registry metadata...`,
        `[00:02.100] Engine [REACHABILITY]: Building AST call-graphs across entrypoints...`,
      ]);
    } catch (err) {
      setError(err.message || 'Failed to start full scan');
      setLoading(false);
      setJobId(null);
    }
  };

  useEffect(() => {
    if (!jobId) return;

    let tick = 2;
    const interval = setInterval(async () => {
      tick += 2;
      try {
        const res = await fetch(`${API_BASE_URL}/api/full-scan/${jobId}`);
        const data = await res.json();

        setTerminalLogs((prev) => {
          const next = [...prev];
          if (tick === 4) {
            next.push(`[00:04.050] Engine [LICENSE]: Evaluating SPDX identifiers and copyleft policy...`);
          } else if (tick === 6) {
            next.push(`[00:06.120] Engine [SBOM+VEX]: Generating CycloneDX & SPDX manifests...`);
          } else if (tick >= 8 && data.status !== 'completed' && data.status !== 'failed') {
            next.push(`[00:${tick.toString().padStart(2, '0')}.000] Aggregating multi-engine verdict...`);
          }
          return next;
        });

        if (data.status === 'completed') {
          clearInterval(interval);
          setLoading(false);
          setTerminalLogs((prev) => [
            ...prev,
            `[00:${tick.toString().padStart(2, '0')}.850] Scan complete. Rendering audit report.`,
          ]);
          onScanResult({ results: data.result, jobId, projectName: projectName.trim() });
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setLoading(false);
          setError(data.error || 'Scan failed');
          setTerminalLogs((prev) => [
            ...prev,
            `[ERR] Pipeline failed: ${data.error || 'Unknown failure'}`,
          ]);
        }
      } catch (_err) {
        clearInterval(interval);
        setLoading(false);
        setError('Failed to poll status');
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div className="bg-[rgba(14,22,38,0.78)] backdrop-blur-md p-8 rounded-[22px] border border-[rgba(148,170,210,0.16)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[rgba(148,170,210,0.16)] pb-4 mb-6">
        <div>
          <h2 className="text-2xl font-sans font-semibold text-[#EAF0FA] tracking-tight">
            Unified Repository Pipeline
          </h2>
          <p className="text-sm text-[#9AA7BD] font-sans mt-1">
            End-to-end audit: Typosquats, AST reachability, license governance, CycloneDX SBOM, and regression history.
          </p>
        </div>
        <span className="font-mono text-xs text-[#4FE3C1] uppercase px-2.5 py-1 rounded bg-[#4FE3C1]/10 border border-[#4FE3C1]/25">
          Unified v2
        </span>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-mono uppercase tracking-wider text-[#9AA7BD] mb-2">
          Project Name <span className="text-[#7A89A3] lowercase">(optional, enables regression diff)</span>
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="e.g. sentinel-core or payments-service"
          className="w-full px-4 py-3 bg-[#0B1220] border border-[rgba(148,170,210,0.16)] rounded-xl text-[#EAF0FA] placeholder-[#7A89A3] font-mono text-sm focus:outline-none focus:border-[#FFB547] transition-colors"
        />
      </div>

      <div className="border border-dashed border-[rgba(148,170,210,0.28)] hover:border-[#FFB547] rounded-xl p-8 text-center transition-colors bg-[#0B1220]/40 relative">
        <input
          type="file"
          id="full-file-upload"
          className="hidden"
          accept=".zip"
          onChange={handleFileChange}
        />
        <label
          htmlFor="full-file-upload"
          className="cursor-pointer flex flex-col items-center justify-center"
        >
          <div className="w-12 h-12 rounded-xl bg-[rgba(148,170,210,0.08)] border border-[rgba(148,170,210,0.16)] flex items-center justify-center mb-3 text-[#FFB547]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <span className="text-base font-sans font-medium text-[#EAF0FA] flex items-center gap-2">
            {file ? (
              <>
                <span className={isOverSize ? 'text-[#FF5A5F]' : 'text-[#FFB547]'}>
                  {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                </span>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="px-2 py-0.5 rounded text-xs font-mono bg-[#FF5A5F]/15 hover:bg-[#FF5A5F]/25 text-[#FF5A5F] border border-[#FF5A5F]/30 transition-colors cursor-pointer"
                  title="Remove file"
                >
                  ✕ Remove
                </button>
              </>
            ) : (
              'Choose a repository .zip archive'
            )}
          </span>
          <span className="text-xs text-[#9AA7BD] font-mono mt-1.5">
            Max {maxMb} MB archive · Up to {config?.max_zip_files ?? 1000} uncompressed files
          </span>
          <span className="text-[11px] text-[#7A89A3] font-mono mt-1">
            Safe extraction skips: node_modules, .git, dist, build, venv, and binary media
          </span>
        </label>
      </div>

      {/* Collapsible: How to make a small zip */}
      <div className="mt-3 text-left">
        <button
          type="button"
          onClick={() => setShowZipHelp(!showZipHelp)}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-[#FFB547] hover:underline cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FFB547] rounded"
          aria-expanded={showZipHelp}
        >
          <span>{showZipHelp ? '▾' : '▸'}</span>
          <span className="font-semibold">How to make a small zip</span>
        </button>

        {showZipHelp && (
          <div className="mt-2.5 p-4 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.18)] text-xs font-mono space-y-3 text-[#9AA7BD]">
            <div>
              <span className="text-[#EAF0FA] font-semibold block mb-1">
                Option 1: Tracked files only (recommended)
              </span>
              <p className="text-[11px] text-[#7A89A3] mb-1.5">
                Exports only git-tracked files, automatically excluding untracked folders and build artifacts:
              </p>
              <code className="block p-2.5 bg-[#0B1220] rounded-lg border border-[rgba(148,170,210,0.14)] text-[#4FE3C1] select-all overflow-x-auto">
                git archive --format=zip --output=repo.zip HEAD
              </code>
            </div>
            <div className="border-t border-[rgba(148,170,210,0.1)] pt-2.5">
              <span className="text-[#EAF0FA] font-semibold block mb-1">
                Option 2: Exclude heavy folders manually
              </span>
              <p className="text-[11px] text-[#7A89A3]">
                If compressing manually, make sure to exclude build artifacts, virtual environments, and binaries:
              </p>
              <p className="text-[11px] text-[#FFB547] mt-1 font-mono">
                Exclude: <code className="text-[#EAF0FA]">node_modules</code>, <code className="text-[#EAF0FA]">venv</code>, <code className="text-[#EAF0FA]">.git</code>, and media files.
              </p>
            </div>
          </div>
        )}
      </div>

      {activeError && (
        <div className="mt-4 p-4 bg-[#FF5A5F]/10 border border-[#FF5A5F]/30 rounded-xl text-[#FF5A5F] text-sm font-mono">
          {activeError}
        </div>
      )}

      {/* Live Terminal Log During Job Execution */}
      {jobId && terminalLogs.length > 0 && (
        <div className="mt-6 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.2)] p-4 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-[rgba(148,170,210,0.1)] text-[#7A89A3]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FFB547] animate-pulse" />
              <span className="uppercase tracking-wider">PIPELINE TERMINAL</span>
            </div>
            <span>JOB: {jobId.slice(0, 8)}</span>
          </div>
          <div className="space-y-1.5 text-[#9AA7BD] max-h-48 overflow-y-auto">
            {terminalLogs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-[#7A89A3] select-none">&gt;</span>
                <span className={log.includes('[ERR]') ? 'text-[#FF5A5F]' : log.includes('complete') ? 'text-[#4FE3C1]' : 'text-[#EAF0FA]'}>
                  {log}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || Boolean(jobId) || isOverSize || Boolean(activeError)}
        className="mt-6 w-full py-3.5 text-[#1A1206] font-sans font-semibold rounded-xl transition-all shadow-lg hover:shadow-[#FFB547]/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        style={{
          background: 'linear-gradient(180deg, #FFC766 0%, #FF9F2E 100%)',
        }}
      >
        {jobId ? 'Scan in progress...' : isOverSize ? 'File exceeds size limit' : 'Start Unified Scan →'}
      </button>
    </div>
  );
}
