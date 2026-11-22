import { useState, useRef, useEffect } from 'react';
import { API_BASE_URL, extractErrorMessage } from '../config';

export default function FileUpload({ onScanResult, setLoading, apiConfig }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState('file'); // 'file' or 'zip'
  const [config, setConfig] = useState(apiConfig || null);
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

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file) => {
    if (scanMode === 'file' && !file.name.endsWith('.json') && !file.name.endsWith('.txt')) {
      setError('Please upload a package.json or requirements.txt file.');
      return;
    }
    if (scanMode === 'zip' && !file.name.endsWith('.zip')) {
      setError('Please upload a .zip repository archive.');
      return;
    }
    
    setError(null);
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

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div className="flex justify-center mb-6 space-x-4">
        <button 
          className={`px-4 py-2 rounded-full font-medium transition-colors ${scanMode === 'file' ? 'bg-brand-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-gray-200'}`}
          onClick={() => setScanMode('file')}
        >
          Dependency Scan
        </button>
        <button 
          className={`px-4 py-2 rounded-full font-medium transition-colors ${scanMode === 'zip' ? 'bg-brand-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-gray-200'}`}
          onClick={() => setScanMode('zip')}
        >
          Reachability Scan (ZIP)
        </button>
      </div>

      <div 
        className={`glass-panel border-2 border-dashed p-10 text-center transition-all duration-300 cursor-pointer flex flex-col items-center justify-center ${isDragging ? 'border-brand-500 bg-brand-500/10' : 'border-dark-700 hover:border-brand-500/50 hover:bg-dark-700/50'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <svg className="w-16 h-16 text-brand-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
        <h3 className="text-xl font-medium text-gray-200 mb-2">Upload {scanMode === 'file' ? 'Dependency File' : 'Repository Archive'}</h3>
        <p className="text-gray-400 mb-6">
          {scanMode === 'file' ? (
            <>
              Drag and drop your <span className="text-brand-400 font-mono">package.json</span> or <span className="text-brand-400 font-mono">requirements.txt</span>
              <span className="block text-xs text-gray-500 mt-2 font-mono">
                Limit: Max {config?.max_upload_mb ?? 15} MB upload
              </span>
            </>
          ) : (
            <>
              Drag and drop your project <span className="text-brand-400 font-mono">.zip</span> archive
              <span className="block text-xs text-brand-400/90 mt-2 font-mono bg-dark-800/80 px-3 py-1.5 rounded-lg border border-dark-600 inline-block">
                Active limits: Max {config?.max_upload_mb ?? 15} MB upload • Up to {config?.max_zip_files ?? 1000} files &amp; {config?.max_uncompressed_mb ?? 50} MB uncompressed (excluding node_modules, .git, dist, build, venv, and media)
              </span>
            </>
          )}
        </p>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          accept={scanMode === 'file' ? ".json,.txt" : ".zip"}
        />
        
        <button className="btn-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
          Select File
        </button>
      </div>
      
      {error && (
        <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-center">
          {error}
        </div>
      )}
    </div>
  );
}
