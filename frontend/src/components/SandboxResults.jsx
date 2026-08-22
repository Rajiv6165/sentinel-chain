import React, { useState } from 'react';

export default function SandboxResults({ result }) {
  const [expanded, setExpanded] = useState(true);

  if (!result || result.status !== 'completed') {
    return (
      <div className="bg-dark-800 rounded-2xl border border-dark-700 shadow-xl overflow-hidden mt-8 p-6 text-center">
        <h3 className="text-xl font-bold mb-2 text-white">Scan Failed</h3>
        <p className="text-red-400">{result?.error || 'Unknown error occurred'}</p>
      </div>
    );
  }

  const data = result.result;
  const raw = result.raw;
  
  const getRiskColor = (level) => {
    switch (level) {
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'low': return 'text-green-500 bg-green-500/10 border-green-500/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  return (
    <div className="bg-dark-800 rounded-2xl border border-dark-700 shadow-xl overflow-hidden mt-8">
      <div className="p-6 border-b border-dark-700 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Sandbox Scan Results</h2>
          <p className="text-gray-400">
            {result.package} {result.version ? `v${result.version}` : ''} ({result.ecosystem})
          </p>
        </div>
        <div className={`px-4 py-2 rounded-full border text-sm font-bold uppercase tracking-wider ${getRiskColor(data.risk_level)}`}>
          {data.risk_level} RISK
        </div>
      </div>

      <div className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Behavioral Evidence</h3>
        
        {data.evidence && data.evidence.length > 0 ? (
          <div className="space-y-4">
            {data.evidence.map((ev, i) => (
              <div key={i} className={`p-4 rounded-xl border ${getRiskColor(ev.level)}`}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-bold capitalize">{ev.type}</span>
                  <span className="text-xs px-2 py-1 rounded bg-black/20 capitalize">{ev.level}</span>
                </div>
                <p className="text-sm opacity-90">{ev.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center border border-dark-700 rounded-xl bg-dark-900/50">
            <p className="text-gray-400">No suspicious behavior detected during installation.</p>
          </div>
        )}

        <div className="mt-8">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-brand-400 hover:text-brand-300 font-medium transition-colors"
          >
            {expanded ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            )}
            {expanded ? 'Hide Raw Logs' : 'View Raw Logs'}
          </button>
          
          {expanded && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-dark-900 rounded-xl p-4 border border-dark-700 overflow-x-auto">
                <h4 className="text-sm font-bold text-gray-400 mb-2">Network Calls</h4>
                {raw.network && raw.network.length > 0 ? (
                  <ul className="text-xs text-gray-300 space-y-1">
                    {raw.network.map((req, i) => (
                      <li key={i} className="font-mono">{req.method} {req.domain}:{req.port}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 italic">No network calls detected</p>
                )}
              </div>
              
              <div className="bg-dark-900 rounded-xl p-4 border border-dark-700 overflow-x-auto">
                <h4 className="text-sm font-bold text-gray-400 mb-2">Filesystem Diffs</h4>
                {raw.fs_diffs && raw.fs_diffs.length > 0 ? (
                  <ul className="text-xs text-gray-300 space-y-1">
                    {raw.fs_diffs.slice(0, 50).map((diff, i) => (
                      <li key={i} className="font-mono">
                        <span className={diff.Kind === 0 ? 'text-yellow-500' : diff.Kind === 1 ? 'text-green-500' : 'text-red-500'}>
                          {diff.Kind === 0 ? 'M' : diff.Kind === 1 ? 'A' : 'D'}
                        </span> {diff.Path}
                      </li>
                    ))}
                    {raw.fs_diffs.length > 50 && <li className="text-gray-500 italic font-sans">...and {raw.fs_diffs.length - 50} more</li>}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 italic">No filesystem changes detected</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
