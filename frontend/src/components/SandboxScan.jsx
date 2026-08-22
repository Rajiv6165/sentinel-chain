import React, { useState, useEffect } from 'react';

export default function SandboxScan({ onScanResult, setLoading }) {
  const [ecosystem, setEcosystem] = useState('npm');
  const [packageName, setPackageName] = useState('');
  const [version, setVersion] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let interval;
    if (jobId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://localhost:8000/api/sandbox-scan/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            setStatus(`Status: ${data.status}`);
            
            if (data.status === 'completed' || data.status === 'failed') {
              clearInterval(interval);
              setJobId(null);
              setLoading(false);
              onScanResult(data);
            }
          }
        } catch (error) {
          console.error("Failed to fetch job status", error);
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, onScanResult, setLoading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!packageName) return;

    setLoading(true);
    setStatus('Starting sandbox...');
    onScanResult(null);

    try {
      const res = await fetch('http://localhost:8000/api/sandbox-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ecosystem,
          package_name: packageName,
          version: version || null
        })
      });

      if (!res.ok) {
        throw new Error('Failed to start scan');
      }

      const data = await res.json();
      setJobId(data.job_id);
      setStatus('Job created, waiting in queue...');
    } catch (error) {
      console.error(error);
      setLoading(false);
      setStatus('Failed to start scan');
    }
  };

  return (
    <div className="bg-dark-800 p-8 rounded-2xl border border-dark-700 shadow-xl max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-white text-center">Sandbox Behavioral Scan</h2>
      <p className="text-gray-400 mb-8 text-center text-sm">
        Installs a package in a secure, isolated container to monitor its behavior (network, filesystem, processes).
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Ecosystem</label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setEcosystem('npm')}
              className={`flex-1 py-3 px-4 rounded-xl border ${
                ecosystem === 'npm' 
                  ? 'bg-brand-500/20 border-brand-500 text-brand-300' 
                  : 'bg-dark-900 border-dark-700 text-gray-400 hover:border-gray-600'
              } transition-colors`}
            >
              npm
            </button>
            <button
              type="button"
              onClick={() => setEcosystem('pypi')}
              className={`flex-1 py-3 px-4 rounded-xl border ${
                ecosystem === 'pypi' 
                  ? 'bg-blue-500/20 border-blue-500 text-blue-300' 
                  : 'bg-dark-900 border-dark-700 text-gray-400 hover:border-gray-600'
              } transition-colors`}
            >
              PyPI
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Package Name</label>
          <input
            type="text"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="e.g. express, lodash, requests"
            className="w-full bg-dark-900 border border-dark-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-brand-500 transition-colors"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Version (Optional)</label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g. 4.18.2"
            className="w-full bg-dark-900 border border-dark-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={!packageName || jobId !== null}
          className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-medium shadow-lg shadow-brand-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {jobId ? status : 'Run Sandboxed Install'}
        </button>
      </form>
    </div>
  );
}
