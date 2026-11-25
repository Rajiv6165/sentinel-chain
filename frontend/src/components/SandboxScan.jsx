import { useState, useEffect } from 'react';
import { API_BASE_URL, extractErrorMessage } from '../config';

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
          const res = await fetch(`${API_BASE_URL}/api/sandbox-scan/${jobId}`);
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
    setStatus('Initializing isolated sandbox container...');
    onScanResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/sandbox-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ecosystem,
          package_name: packageName.trim(),
          version: version.trim() || null
        })
      });

      if (!res.ok) {
        const errorDetail = await extractErrorMessage(res, 'Failed to start sandbox scan');
        throw new Error(errorDetail);
      }

      const data = await res.json();
      setJobId(data.job_id);
      setStatus('Container running; capturing syscalls & network sockets...');
    } catch (error) {
      console.error(error);
      setLoading(false);
      setStatus(error.message || 'Failed to start scan');
    }
  };

  return (
    <div className="bg-[rgba(14,22,38,0.78)] backdrop-blur-md p-8 rounded-[22px] border border-[rgba(148,170,210,0.16)] shadow-2xl max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-[rgba(148,170,210,0.16)] pb-4 mb-6">
        <div>
          <h2 className="text-2xl font-sans font-semibold text-[#EAF0FA] tracking-tight">
            Behavioral Sandbox
          </h2>
          <p className="text-sm text-[#9AA7BD] font-sans mt-1">
            Installs a package inside an isolated ephemeral container to monitor socket calls, child processes, and disk writes.
          </p>
        </div>
        <span className="font-mono text-xs text-[#7AA2FF] uppercase px-2.5 py-1 rounded bg-[#7AA2FF]/10 border border-[#7AA2FF]/25">
          Dynamic
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-[#9AA7BD] mb-2">
            Target Ecosystem
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setEcosystem('npm')}
              className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-mono transition-colors cursor-pointer ${
                ecosystem === 'npm' 
                  ? 'bg-[#FFB547]/15 border-[#FFB547] text-[#FFB547]' 
                  : 'bg-[#0B1220] border-[rgba(148,170,210,0.16)] text-[#9AA7BD] hover:border-[rgba(148,170,210,0.3)]'
              }`}
            >
              npm (Node.js)
            </button>
            <button
              type="button"
              onClick={() => setEcosystem('pypi')}
              className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-mono transition-colors cursor-pointer ${
                ecosystem === 'pypi' 
                  ? 'bg-[#7AA2FF]/15 border-[#7AA2FF] text-[#7AA2FF]' 
                  : 'bg-[#0B1220] border-[rgba(148,170,210,0.16)] text-[#9AA7BD] hover:border-[rgba(148,170,210,0.3)]'
              }`}
            >
              PyPI (Python)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-[#9AA7BD] mb-2">
            Package Name
          </label>
          <input
            type="text"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="e.g. express, lodash, requests"
            className="w-full bg-[#0B1220] border border-[rgba(148,170,210,0.16)] rounded-xl py-3 px-4 text-[#EAF0FA] placeholder-[#7A89A3] font-mono text-sm focus:outline-none focus:border-[#FFB547] transition-colors"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-[#9AA7BD] mb-2">
            Version <span className="text-[#7A89A3] lowercase">(optional, defaults to latest)</span>
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g. 4.18.2"
            className="w-full bg-[#0B1220] border border-[rgba(148,170,210,0.16)] rounded-xl py-3 px-4 text-[#EAF0FA] placeholder-[#7A89A3] font-mono text-sm focus:outline-none focus:border-[#FFB547] transition-colors"
          />
        </div>

        {status && (
          <div className="p-3 bg-[#070B14] border border-[rgba(148,170,210,0.2)] rounded-xl text-xs font-mono text-[#7AA2FF] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#7AA2FF] animate-pulse" />
            <span>{status}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!packageName || jobId !== null}
          className="w-full py-3.5 text-[#1A1206] font-sans font-semibold rounded-xl transition-all shadow-lg hover:shadow-[#FFB547]/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          style={{
            background: 'linear-gradient(180deg, #FFC766 0%, #FF9F2E 100%)',
          }}
        >
          {jobId ? 'Installing in Sandbox...' : 'Run Sandboxed Install →'}
        </button>
      </form>
    </div>
  );
}
