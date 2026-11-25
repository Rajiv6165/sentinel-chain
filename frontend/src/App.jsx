import { useState, useEffect } from 'react';
import HeroStage from './components/HeroStage';
import FileUpload from './components/FileUpload';
import ScanResults from './components/ScanResults';
import SandboxScan from './components/SandboxScan';
import SandboxResults from './components/SandboxResults';
import FullScan from './components/FullScan';
import FullScanResults from './components/FullScanResults';
import TrendDashboard from './components/TrendDashboard';
import { API_BASE_URL, extractErrorMessage } from './config';
import sampleReportData from './data/sampleReport.json';

function App() {
  const [activeTab, setActiveTab] = useState('static');
  
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  
  const [sandboxResult, setSandboxResult] = useState(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  const [fullScanResult, setFullScanResult] = useState(null);
  const [fullScanLoading, setFullScanLoading] = useState(false);

  const [isSampleData, setIsSampleData] = useState(false);

  const [apiConfig, setApiConfig] = useState({
    sandbox_enabled: false,
    public_demo: true,
    max_upload_mb: 15,
    max_uncompressed_mb: 50,
    max_zip_files: 1000
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

  // Handle "Try sample" from Hero Console Card
  const handleTrySample = () => {
    setIsSampleData(true);
    setScanResult(sampleReportData);
    setActiveTab('static');
    setTimeout(() => {
      const el = document.getElementById('scanner');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  // Handle file dropped/selected from Hero Console Card
  const handleHeroFileSelected = async (file) => {
    setIsSampleData(false);
    setScanError(null);

    const isZip = file.name.endsWith('.zip');
    const isManifest = file.name.endsWith('.json') || file.name.endsWith('.txt');

    if (!isZip && !isManifest) {
      setScanError('Please upload a package.json, requirements.txt, or a repository .zip file.');
      const el = document.getElementById('scanner');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (isZip) {
      setActiveTab('full');
      setFullScanLoading(true);
      setTimeout(() => {
        const el = document.getElementById('scanner');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 50);

      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`${API_BASE_URL}/api/full-scan`, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) {
          const detail = await extractErrorMessage(res, 'Failed to start full scan');
          throw new Error(detail);
        }
        const data = await res.json();
        const jobId = data.job_id;

        // Poll job status
        const pollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch(`${API_BASE_URL}/api/full-scan/${jobId}`);
            const pollData = await pollRes.json();
            if (pollData.status === 'completed') {
              clearInterval(pollInterval);
              setFullScanLoading(false);
              setFullScanResult({ results: pollData.result, jobId, projectName: file.name.replace('.zip', '') });
            } else if (pollData.status === 'failed') {
              clearInterval(pollInterval);
              setFullScanLoading(false);
              setScanError(pollData.error || 'Scan failed');
            }
          } catch (_err) {
            clearInterval(pollInterval);
            setFullScanLoading(false);
            setScanError('Failed to poll status');
          }
        }, 2000);
      } catch (err) {
        setScanError(err.message || 'Failed to start scan');
        setFullScanLoading(false);
      }
    } else {
      setActiveTab('static');
      setLoading(true);
      setTimeout(() => {
        const el = document.getElementById('scanner');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 50);

      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`${API_BASE_URL}/api/scan`, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) {
          const detail = await extractErrorMessage(res, 'Failed to scan dependency file');
          throw new Error(detail);
        }
        const data = await res.json();
        setScanResult(data);
      } catch (err) {
        setScanError(err.message || 'Scan failed');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-[#EAF0FA] antialiased">
      {/* 1. Hero Stage: Coordinate-Scaled Full Viewport Hero */}
      <HeroStage
        apiConfig={apiConfig}
        onFileSelected={handleHeroFileSelected}
        onTrySample={handleTrySample}
      />

      {/* 2. Engines Grid: Six engines, one verdict */}
      <section id="engines" className="max-w-6xl mx-auto px-6 py-24 border-t border-[rgba(148,170,210,0.16)]">
        <div className="text-center mb-16">
          <h2
            className="text-[44px] font-normal tracking-tight text-[#EAF0FA] m-0"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
          >
            Six engines, one verdict
          </h2>
          <p className="text-[#9AA7BD] text-base mt-3 max-w-xl mx-auto font-sans">
            Comprehensive multi-layer supply chain verification before deployment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Engine 1: Typosquat */}
          <div className="rounded-[16px] p-6 bg-[rgba(14,22,38,0.78)] border border-[rgba(148,170,210,0.16)] hover:border-[#FFB547] transition-all duration-300 flex flex-col justify-between shadow-lg group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-[#FFB547] font-semibold tracking-wider">[TYPOSQUAT]</span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-[#FFB547]/10 text-[#FFB547] border border-[#FFB547]/20">Active</span>
              </div>
              <h3 className="text-lg font-semibold text-[#EAF0FA] mb-2 font-sans group-hover:text-[#FFB547] transition-colors">Typosquat Detection</h3>
              <p className="text-[#9AA7BD] text-sm leading-relaxed font-sans">
                Edit-distance, keyboard-adjacency, and registry metadata heuristics to eliminate false alarms and catch parasitic packages.
              </p>
            </div>
          </div>

          {/* Engine 2: Reachability */}
          <div className="rounded-[16px] p-6 bg-[rgba(14,22,38,0.78)] border border-[rgba(148,170,210,0.16)] hover:border-[#4FE3C1] transition-all duration-300 flex flex-col justify-between shadow-lg group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-[#4FE3C1] font-semibold tracking-wider">[REACHABILITY]</span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-[#4FE3C1]/10 text-[#4FE3C1] border border-[#4FE3C1]/20">Active</span>
              </div>
              <h3 className="text-lg font-semibold text-[#EAF0FA] mb-2 font-sans group-hover:text-[#4FE3C1] transition-colors">AST Reachability</h3>
              <p className="text-[#9AA7BD] text-sm leading-relaxed font-sans">
                Traces call graphs across JS/TS and Python files: proves whether the vulnerable function is actually called from your entry points.
              </p>
            </div>
          </div>

          {/* Engine 3: Sandbox */}
          <div className="rounded-[16px] p-6 bg-[rgba(14,22,38,0.78)] border border-[rgba(148,170,210,0.16)] hover:border-[#7AA2FF] transition-all duration-300 flex flex-col justify-between shadow-lg group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-[#7AA2FF] font-semibold tracking-wider">[SANDBOX]</span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-[#070B14] text-[#7A89A3] border border-[rgba(148,170,210,0.16)]">
                  {apiConfig.sandbox_enabled ? 'Active' : 'OFF IN PUBLIC DEMO'}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-[#EAF0FA] mb-2 font-sans group-hover:text-[#7AA2FF] transition-colors">Behavioral Sandbox</h3>
              <p className="text-[#9AA7BD] text-sm leading-relaxed font-sans">
                Monitors install-time telemetry, suspicious child processes, and unauthorized socket connections in an isolated container.
              </p>
            </div>
          </div>

          {/* Engine 4: SBOM+VEX */}
          <div className="rounded-[16px] p-6 bg-[rgba(14,22,38,0.78)] border border-[rgba(148,170,210,0.16)] hover:border-[#4FE3C1] transition-all duration-300 flex flex-col justify-between shadow-lg group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-[#4FE3C1] font-semibold tracking-wider">[SBOM+VEX]</span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-[#4FE3C1]/10 text-[#4FE3C1] border border-[#4FE3C1]/20">Active</span>
              </div>
              <h3 className="text-lg font-semibold text-[#EAF0FA] mb-2 font-sans group-hover:text-[#4FE3C1] transition-colors">SBOM &amp; VEX Generation</h3>
              <p className="text-[#9AA7BD] text-sm leading-relaxed font-sans">
                Exports industry-standard CycloneDX and SPDX manifests with machine-readable exploitability annotations.
              </p>
            </div>
          </div>

          {/* Engine 5: Sigstore */}
          <div className="rounded-[16px] p-6 bg-[rgba(14,22,38,0.78)] border border-[rgba(148,170,210,0.16)] hover:border-[#7AA2FF] transition-all duration-300 flex flex-col justify-between shadow-lg group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-[#7AA2FF] font-semibold tracking-wider">[SIGSTORE]</span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-[#7AA2FF]/10 text-[#7AA2FF] border border-[#7AA2FF]/20">Active</span>
              </div>
              <h3 className="text-lg font-semibold text-[#EAF0FA] mb-2 font-sans group-hover:text-[#7AA2FF] transition-colors">Keyless Provenance</h3>
              <p className="text-[#9AA7BD] text-sm leading-relaxed font-sans">
                Cryptographic attestations signed keylessly and verifiable against the public Rekor transparency log.
              </p>
            </div>
          </div>

          {/* Engine 6: License */}
          <div className="rounded-[16px] p-6 bg-[rgba(14,22,38,0.78)] border border-[rgba(148,170,210,0.16)] hover:border-[#FFB547] transition-all duration-300 flex flex-col justify-between shadow-lg group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-[#FFB547] font-semibold tracking-wider">[LICENSE]</span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-[#FFB547]/10 text-[#FFB547] border border-[#FFB547]/20">Active</span>
              </div>
              <h3 className="text-lg font-semibold text-[#EAF0FA] mb-2 font-sans group-hover:text-[#FFB547] transition-colors">License Governance</h3>
              <p className="text-[#9AA7BD] text-sm leading-relaxed font-sans">
                Automatic SPDX classification, copyleft isolation flags, and policy-as-code gating before build pipelines.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Scanner Section: The restyled tabbed scanner app */}
      <section id="scanner" className="max-w-5xl mx-auto px-6 py-16">
        {/* Sample Data Persistent Notice */}
        {isSampleData && (
          <div className="mb-8 p-4 rounded-xl border border-[#FFB547]/40 bg-[#FFB547]/10 flex items-center justify-between text-[#FFB547]">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFB547] animate-pulse" />
              <span className="font-mono text-xs font-semibold tracking-wide">
                SAMPLE DATA DISPLAY · Showing realistic AST reachability and typosquat analysis
              </span>
            </div>
            <button
              onClick={() => {
                setIsSampleData(false);
                setScanResult(null);
              }}
              className="text-xs font-mono underline hover:text-white cursor-pointer"
            >
              Clear Sample ✕
            </button>
          </div>
        )}

        {/* Scan Error Message */}
        {scanError && (
          <div className="mb-6 p-4 rounded-xl border border-[#FF5A5F]/40 bg-[#FF5A5F]/10 text-[#FF5A5F] text-xs font-mono text-center">
            {scanError}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8 border-b border-[rgba(148,170,210,0.16)]">
          <button
            onClick={() => setActiveTab('static')}
            className={`px-6 py-3 font-mono text-xs tracking-wider uppercase transition-colors border-b-2 cursor-pointer ${
              activeTab === 'static'
                ? 'border-[#FFB547] text-[#FFB547] font-semibold'
                : 'border-transparent text-[#9AA7BD] hover:text-[#EAF0FA]'
            }`}
          >
            Dependency Scan
          </button>
          {apiConfig.sandbox_enabled && (
            <button
              onClick={() => setActiveTab('sandbox')}
              className={`px-6 py-3 font-mono text-xs tracking-wider uppercase transition-colors border-b-2 cursor-pointer ${
                activeTab === 'sandbox'
                  ? 'border-[#7AA2FF] text-[#7AA2FF] font-semibold'
                  : 'border-transparent text-[#9AA7BD] hover:text-[#EAF0FA]'
              }`}
            >
              Sandbox Scan
            </button>
          )}
          <button
            onClick={() => setActiveTab('full')}
            className={`px-6 py-3 font-mono text-xs tracking-wider uppercase transition-colors border-b-2 cursor-pointer ${
              activeTab === 'full'
                ? 'border-[#4FE3C1] text-[#4FE3C1] font-semibold'
                : 'border-transparent text-[#9AA7BD] hover:text-[#EAF0FA]'
            }`}
          >
            Unified Scan
          </button>
          <button
            onClick={() => setActiveTab('trends')}
            className={`px-6 py-3 font-mono text-xs tracking-wider uppercase transition-colors border-b-2 cursor-pointer ${
              activeTab === 'trends'
                ? 'border-[#FFB547] text-[#FFB547] font-semibold'
                : 'border-transparent text-[#9AA7BD] hover:text-[#EAF0FA]'
            }`}
          >
            Trend Dashboard
          </button>
        </div>

        <main>
          {activeTab === 'static' && (
            <>
              <FileUpload
                onScanResult={(res) => {
                  setIsSampleData(false);
                  setScanResult(res);
                }}
                setLoading={setLoading}
                apiConfig={apiConfig}
              />
              
              {loading && (
                <div className="mt-8 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.2)] p-5 font-mono text-xs">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[rgba(148,170,210,0.1)] text-[#FFB547]">
                    <span className="w-2 h-2 rounded-full bg-[#FFB547] animate-pulse" />
                    <span className="uppercase tracking-wider">ANALYZING MANIFEST DEPENDENCIES</span>
                  </div>
                  <div className="space-y-1.5 text-[#9AA7BD]">
                    <p>&gt; Resolving dependency graph and versions...</p>
                    <p>&gt; Querying typosquat heuristic cache (Levenshtein + QWERTY + registry age)...</p>
                    <p className="text-[#FFB547] animate-pulse">&gt; Calculating AST reachability &amp; EPSS probabilities...</p>
                  </div>
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
                <div className="mt-8 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.2)] p-5 font-mono text-xs">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[rgba(148,170,210,0.1)] text-[#7AA2FF]">
                    <span className="w-2 h-2 rounded-full bg-[#7AA2FF] animate-pulse" />
                    <span className="uppercase tracking-wider">SANDBOX ISOLATION ACTIVE</span>
                  </div>
                  <div className="space-y-1.5 text-[#9AA7BD]">
                    <p>&gt; Provisioning isolated micro-container...</p>
                    <p>&gt; Installing package payload with network monitor enabled...</p>
                    <p className="text-[#7AA2FF] animate-pulse">&gt; Capturing filesystem diffs and outbound sockets...</p>
                  </div>
                </div>
              )}

              {!sandboxLoading && sandboxResult && (
                <SandboxResults result={sandboxResult} />
              )}
            </>
          )}

          {activeTab === 'full' && (
            <>
              <FullScan
                onScanResult={(res) => {
                  setIsSampleData(false);
                  setFullScanResult(res);
                }}
                setLoading={setFullScanLoading}
                apiConfig={apiConfig}
              />
              
              {fullScanLoading && !fullScanResult && (
                <div className="mt-8 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.2)] p-5 font-mono text-xs">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[rgba(148,170,210,0.1)] text-[#4FE3C1]">
                    <span className="w-2 h-2 rounded-full bg-[#4FE3C1] animate-pulse" />
                    <span className="uppercase tracking-wider">UNIFIED PIPELINE EXECUTING</span>
                  </div>
                  <div className="space-y-1.5 text-[#9AA7BD]">
                    <p>&gt; Decompressing repository archive and extracting manifests...</p>
                    <p>&gt; Running typosquat heuristic and AST call graph reachability traversal...</p>
                    <p className="text-[#4FE3C1] animate-pulse">&gt; Generating CycloneDX SBOM, VEX, and license report...</p>
                  </div>
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
      </section>

      {/* 4. Footer */}
      <footer className="border-t border-[rgba(148,170,210,0.16)] py-12 text-center text-[#7A89A3] text-xs font-mono">
        <div className="flex items-center justify-center gap-6 mb-3">
          <a
            href="https://github.com/rajivthakker/sentinel-chain"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#EAF0FA] transition-colors"
          >
            GitHub
          </a>
          <span>·</span>
          <a
            href="https://github.com/rajivthakker/sentinel-chain/blob/main/docs/benchmarks.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#EAF0FA] transition-colors"
          >
            Benchmarks
          </a>
          <span>·</span>
          <a
            href="https://github.com/rajivthakker/sentinel-chain/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#EAF0FA] transition-colors"
          >
            Documentation
          </a>
        </div>
        <p className="m-0 text-[#7A89A3]">
          Sentinel-Chain · Supply-Chain Security &amp; AST Exploitability Engine
        </p>
      </footer>
    </div>
  );
}

export default App;
