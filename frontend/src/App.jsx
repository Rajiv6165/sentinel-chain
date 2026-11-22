import { useState, useEffect } from 'react'
import FileUpload from './components/FileUpload'
import ScanResults from './components/ScanResults'
import SandboxScan from './components/SandboxScan'
import SandboxResults from './components/SandboxResults'
import FullScan from './components/FullScan'
import FullScanResults from './components/FullScanResults'
import TrendDashboard from './components/TrendDashboard'
import { API_BASE_URL } from './config'

function App() {
  const [activeTab, setActiveTab] = useState('static');
  
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [sandboxResult, setSandboxResult] = useState(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  const [fullScanResult, setFullScanResult] = useState(null);
  const [fullScanLoading, setFullScanLoading] = useState(false);

  const [apiConfig, setApiConfig] = useState({
    sandbox_enabled: false,
    public_demo: true
  });

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setApiConfig(data);
          if (!data.sandbox_enabled && activeTab === 'sandbox') {
            setActiveTab('static');
          }
        }
      })
      .catch((err) => console.log('Config fetch notice:', err));
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 text-gray-100 p-8">
      {/* Public Demo Warning Banner */}
      <div className="max-w-5xl mx-auto mb-6">
        <div className="bg-amber-950/40 border border-amber-600/50 rounded-xl px-4 py-3 flex items-center justify-between text-amber-200 shadow-lg text-sm">
          <div className="flex items-center space-x-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <span className="font-semibold tracking-wide">
              Public demo — don&apos;t upload private code.
            </span>
          </div>
          <span className="text-xs text-amber-400/80 hidden sm:inline">
            Rate-limited • Ephemeral workspace • Hardened sandbox isolation
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        <header className="mb-10 text-center">
          <div className="inline-block p-3 bg-dark-800 rounded-2xl border border-dark-700 shadow-xl mb-4">
            <svg className="w-12 h-12 text-brand-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-blue-600 mb-3">
            Sentinel-chain
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Supply-chain security platform. Detect typosquatting, reachability, sandbox evasion, license violations, and track project risk history over time.
          </p>

          {!apiConfig.sandbox_enabled && (
            <div className="mt-4 inline-flex items-center space-x-2 text-xs bg-dark-800 border border-dark-700 text-gray-400 px-3 py-1.5 rounded-full">
              <span className="h-2 w-2 rounded-full bg-blue-500"></span>
              <span>
                Sandbox engine disabled for public demo (untrusted execution requires isolated worker infrastructure).
              </span>
            </div>
          )}
        </header>

        <main>
          <div className="flex justify-center mb-8 border-b border-dark-700">
            <button
              onClick={() => setActiveTab('static')}
              className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                activeTab === 'static'
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Dependency Scan
            </button>
            {apiConfig.sandbox_enabled && (
              <button
                onClick={() => setActiveTab('sandbox')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === 'sandbox'
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                Sandbox Scan (Phase 3)
              </button>
            )}
            <button
              onClick={() => setActiveTab('full')}
              className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                activeTab === 'full'
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Unified Scan (Phases 4-9)
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                activeTab === 'trends'
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Trend Dashboard (Phase 10)
            </button>
          </div>

          {activeTab === 'static' && (
            <>
              <FileUpload onScanResult={setScanResult} setLoading={setLoading} apiConfig={apiConfig} />
              
              {loading && (
                <div className="mt-12 text-center">
                  <div className="inline-block w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin"></div>
                  <p className="mt-4 text-brand-400 animate-pulse">Analyzing dependencies...</p>
                </div>
              )}

              {!loading && scanResult && (
                <ScanResults result={scanResult} />
              )}
            </>
          )}

          {activeTab === 'sandbox' && (
            <>
              <SandboxScan onScanResult={setSandboxResult} setLoading={setSandboxLoading} />
              
              {sandboxLoading && (
                <div className="mt-12 text-center">
                  <div className="inline-block w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin"></div>
                  <p className="mt-4 text-brand-400 animate-pulse">Running sandboxed installation...</p>
                </div>
              )}

              {!sandboxLoading && sandboxResult && (
                <SandboxResults result={sandboxResult} />
              )}
            </>
          )}

          {activeTab === 'full' && (
            <>
              <FullScan onScanResult={setFullScanResult} setLoading={setFullScanLoading} apiConfig={apiConfig} />
              
              {fullScanLoading && (
                <div className="mt-12 text-center">
                  <div className="inline-block w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin"></div>
                  <p className="mt-4 text-brand-400 animate-pulse">Running full unified scan across all engines...</p>
                </div>
              )}

              {!fullScanLoading && fullScanResult && (
                <FullScanResults
                  result={fullScanResult.results}
                  jobId={fullScanResult.jobId}
                  projectName={fullScanResult.projectName}
                />
              )}
            </>
          )}

          {activeTab === 'trends' && (
            <TrendDashboard />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
