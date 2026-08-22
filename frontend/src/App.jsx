import { useState } from 'react'
import FileUpload from './components/FileUpload'
import ScanResults from './components/ScanResults'
import SandboxScan from './components/SandboxScan'
import SandboxResults from './components/SandboxResults'

function App() {
  const [activeTab, setActiveTab] = useState('static');
  
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [sandboxResult, setSandboxResult] = useState(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  return (
    <div className="min-h-screen bg-dark-900 text-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12 text-center">
          <div className="inline-block p-3 bg-dark-800 rounded-2xl border border-dark-700 shadow-xl mb-6">
            <svg className="w-12 h-12 text-brand-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-blue-600 mb-4">
            Sentinel-chain
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Supply-chain security platform. Upload your dependency file to detect typosquatting attacks against top npm and PyPI packages.
          </p>
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
          </div>

          {activeTab === 'static' && (
            <>
              <FileUpload onScanResult={setScanResult} setLoading={setLoading} />
              
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
        </main>
      </div>
    </div>
  )
}

export default App
