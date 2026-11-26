import { useState, useRef, useEffect } from 'react';
import { API_BASE_URL, extractErrorMessage } from '../config';

export default function FileUpload({ onScanResult, setLoading, apiConfig, externalError, onClearError }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState('file'); // 'file' or 'zip'
  const [config, setConfig] = useState(apiConfig || null);
  const [showZipHelp, setShowZipHelp] = useState(false);
  const fileInputRef = useRef(null);

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

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const clearErrors = () => {
    setError(null);
    if (onClearError) onClearError();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    clearErrors();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    clearErrors();
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleRemoveFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFile(null);
    clearErrors();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = async (file) => {
    setSelectedFile(file);
    clearErrors();

    if (scanMode === 'file' && !file.name.endsWith('.json') && !file.name.endsWith('.txt')) {
      setError('Please upload a package.json or requirements.txt file.');
      return;
    }
    if (scanMode === 'zip' && !file.name.endsWith('.zip')) {
      setError('Please upload a .zip repository archive.');
      return;
    }

    // Client-side file size check
    if (file.size > maxBytes) {
      const selectedMb = (file.size / (1024 * 1024)).toFixed(1);
      setError(`${selectedMb} MB selected, limit is ${maxMb} MB`);
      return; // Do NOT send request!
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const endpoint = scanMode === 'zip' ? `${API_BASE_URL}/api/reachability-scan` : `${API_BASE_URL}/api/scan`;
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorDetail = await extractErrorMessage(res, 'Failed to scan file');
        throw new Error(errorDetail);
      }

      const data = await res.json();
      onScanResult(data);
    } catch (err) {
      setError(err.message || 'An error occurred during scan.');
    } finally {
      setLoading(false);
    }
  };

  const activeError = externalError || error;
  const isOverSize = Boolean(selectedFile && selectedFile.size > maxBytes);

  return (
    <div className="w-full max-w-2xl mx-auto mt-6">
      {/* Mode switcher tabs */}
      <div className="flex justify-center mb-6 gap-2">
        <button
          type="button"
          className={`px-4 py-2 rounded-xl font-mono text-xs font-semibold transition-all cursor-pointer ${
            scanMode === 'file'
              ? 'bg-[#FFB547] text-[#1A1206] shadow-[0_0_12px_rgba(255,181,71,0.25)]'
              : 'bg-[#0B1220] text-[#9AA7BD] hover:text-[#EAF0FA] border border-[rgba(148,170,210,0.16)]'
          }`}
          onClick={() => {
            setScanMode('file');
            clearErrors();
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        >
          Dependency File
        </button>
        <button
          type="button"
          className={`px-4 py-2 rounded-xl font-mono text-xs font-semibold transition-all cursor-pointer ${
            scanMode === 'zip'
              ? 'bg-[#FFB547] text-[#1A1206] shadow-[0_0_12px_rgba(255,181,71,0.25)]'
              : 'bg-[#0B1220] text-[#9AA7BD] hover:text-[#EAF0FA] border border-[rgba(148,170,210,0.16)]'
          }`}
          onClick={() => {
            setScanMode('zip');
            clearErrors();
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        >
          Reachability ZIP
        </button>
      </div>

      {/* Drop Zone */}
      <div
        className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center bg-[rgba(14,22,38,0.78)] focus:outline-none focus:ring-2 focus:ring-[#FFB547] ${
          isDragging
            ? 'border-[#FFB547] bg-[#FFB547]/10'
            : 'border-[rgba(148,170,210,0.28)] hover:border-[#FFB547]/60 hover:bg-[#0B1220]/60'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <div className="w-12 h-12 rounded-xl bg-[#0B1220] border border-[rgba(148,170,210,0.2)] flex items-center justify-center text-[#FFB547] mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <h3
          className="text-2xl font-normal text-[#EAF0FA] mb-2"
          style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
        >
          Upload {scanMode === 'file' ? 'Dependency Manifest' : 'Repository Archive'}
        </h3>

        <div className="text-sm text-[#9AA7BD] mb-4 max-w-md">
          {selectedFile ? (
            <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
              <span className={isOverSize ? 'text-[#FF5A5F] font-mono' : 'text-[#FFB547] font-mono'}>
                Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
              </span>
              <button
                type="button"
                onClick={handleRemoveFile}
                className="px-2 py-0.5 rounded text-xs font-mono bg-[#FF5A5F]/15 hover:bg-[#FF5A5F]/25 text-[#FF5A5F] border border-[#FF5A5F]/30 cursor-pointer transition-colors"
                title="Remove file"
              >
                ✕ Remove
              </button>
            </div>
          ) : scanMode === 'file' ? (
            <>
              Drop your <span className="text-[#FFB547] font-mono">package.json</span> or <span className="text-[#FFB547] font-mono">requirements.txt</span>
              <span className="block text-xs text-[#7A89A3] mt-2 font-mono">
                Active limit: Max {maxMb} MB upload
              </span>
            </>
          ) : (
            <>
              Drop your project <span className="text-[#FFB547] font-mono">.zip</span> archive
              <span className="block text-xs text-[#9AA7BD] mt-2 font-mono bg-[#0B1220] p-2 rounded-lg border border-[rgba(148,170,210,0.16)]">
                Limits: Max {maxMb} MB upload • Up to {config?.max_zip_files ?? 1000} files &amp; {config?.max_uncompressed_mb ?? 50} MB uncompressed (excluding node_modules, .git, dist, build, venv, media)
              </span>
            </>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept={scanMode === 'file' ? ".json,.txt" : ".zip"}
        />

        <button
          type="button"
          disabled={isOverSize}
          className="px-5 py-2.5 rounded-xl font-sans font-semibold text-xs text-[#1A1206] shadow-md transition-all hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          style={{ background: 'linear-gradient(180deg, #FFC766 0%, #FF9F2E 100%)' }}
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          {selectedFile ? (isOverSize ? 'File too large' : 'Change File') : 'Select File'}
        </button>
      </div>

      {/* Collapsible: How to make a small zip for ZIP mode */}
      {scanMode === 'zip' && (
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
      )}

      {activeError && (
        <div className="mt-4 p-4 bg-[#FF5A5F]/15 border border-[#FF5A5F]/40 rounded-xl text-[#FF5A5F] text-xs font-mono text-center">
          {activeError}
        </div>
      )}
    </div>
  );
}
