import { useState, useEffect } from 'react';
import { API_BASE_URL, extractErrorMessage } from '../config';

export default function FullScan({ onScanResult, setLoading, apiConfig }) {
  const [file, setFile] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState(null);
  const [config, setConfig] = useState(apiConfig || null);

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
  
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.name.endsWith('.zip')) {
      setFile(selected);
      setError('');
    } else {
      setFile(null);
      setError('Please upload a .zip file containing the repository.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    
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
      
    } catch (err) {
      setError(err.message || 'Failed to start full scan');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/full-scan/${jobId}`);
          const data = await res.json();
          
          if (data.status === 'completed') {
            clearInterval(interval);
            setLoading(false);
            onScanResult({ results: data.result, jobId, projectName: projectName.trim() });
          } else if (data.status === 'failed') {
            clearInterval(interval);
            setLoading(false);
            setError(data.error || 'Scan failed');
          }
        } catch (_err) {
          clearInterval(interval);
          setLoading(false);
          setError('Failed to poll status');
        }
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [jobId]);

  return (
    <div className="bg-dark-800 p-8 rounded-2xl border border-dark-700 shadow-2xl">
      <h2 className="text-2xl font-bold mb-4 text-white">Full Unified Scan (Phases 1-10)</h2>
      <p className="text-gray-400 mb-6">
        Upload a repository .zip file. We will parse dependencies, run Typosquat detection (Phase 1), Reachability analysis with EPSS (Phase 2), Sandboxed Behavior analysis (Phase 3), License compliance (Phase 9), and track historical trends (Phase 10).
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Project Name <span className="text-gray-500 font-normal">(optional, enables persistent history & regression diff)</span>
        </label>
        <input 
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="e.g. sentinel-core or payments-service"
          className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
        />
      </div>
      
      <div className="border-2 border-dashed border-dark-600 rounded-xl p-10 text-center hover:border-brand-500 transition-colors bg-dark-900/50">
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
          <svg className="w-12 h-12 text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
          </svg>
          <span className="text-lg font-medium text-gray-300">
            {file ? file.name : 'Select a .zip file'}
          </span>
          <span className="text-sm text-gray-400 mt-2 font-mono">
            Only .zip files are supported • Max {config?.max_upload_mb ?? 15} MB upload
          </span>
          <span className="text-xs text-brand-400/90 mt-1 font-mono">
            Active limits: Up to {config?.max_zip_files ?? 1000} files &amp; {config?.max_uncompressed_mb ?? 50} MB uncompressed (excluding node_modules, .git, dist, build, venv, and media)
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file}
        className="mt-6 w-full py-4 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg"
      >
        Run Full Scan
      </button>
    </div>
  );
}
