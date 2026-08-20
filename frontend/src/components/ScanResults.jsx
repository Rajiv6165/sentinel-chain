import React, { useState } from 'react';

export default function ScanResults({ result }) {
  const [expandedRow, setExpandedRow] = useState(null);

  if (!result) return null;

  const { findings, scanned_count, message } = result;

  const toggleRow = (index) => {
    if (expandedRow === index) {
      setExpandedRow(null);
    } else {
      setExpandedRow(index);
    }
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'low': return 'text-green-400 bg-green-400/10 border-green-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getReachabilityColor = (reachability) => {
    switch (reachability) {
      case 'REACHABLE': return 'text-red-400 bg-red-400/10 border-red-400/20 font-bold';
      case 'UNREACHABLE': return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
      case 'UNKNOWN': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-100 flex items-center">
          <svg className="w-6 h-6 mr-2 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          Scan Report
        </h2>
        <div className="text-sm text-gray-400 bg-dark-800 px-4 py-2 rounded-full border border-dark-700">
          Scanned <span className="text-white font-mono">{scanned_count}</span> dependencies
        </div>
      </div>

      {message && (
         <div className="p-4 bg-dark-800 border border-dark-700 rounded-lg text-gray-300 text-center mb-6">
           {message}
         </div>
      )}

      {findings && findings.length > 0 ? (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-dark-800/50 border-b border-dark-700 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium">Package</th>
                  <th className="p-4 font-medium">Suspected Target</th>
                  <th className="p-4 font-medium">Risk</th>
                  <th className="p-4 font-medium">Reachability</th>
                  <th className="p-4 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {findings.map((finding, idx) => (
                  <React.Fragment key={idx}>
                    <tr 
                      className={`hover:bg-dark-700/30 transition-colors cursor-pointer ${expandedRow === idx ? 'bg-dark-700/30' : ''}`}
                      onClick={() => toggleRow(idx)}
                    >
                      <td className="p-4">
                        <span className="font-mono text-gray-200">{finding.package_name}</span>
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-brand-400">{finding.suspected_target}</span>
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRiskColor(finding.risk_level)}`}>
                          {finding.risk_level.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4">
                        {finding.reachability ? (
                           <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getReachabilityColor(finding.reachability)}`}>
                             {finding.reachability}
                           </span>
                        ) : (
                           <span className="text-gray-500 text-xs">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <svg className={`w-5 h-5 inline-block text-gray-500 transition-transform ${expandedRow === idx ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </td>
                    </tr>
                    {expandedRow === idx && (
                      <tr className="bg-dark-900/50">
                        <td colSpan="4" className="p-6 border-l-2 border-brand-500">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Analysis Reason</h4>
                              <p className="text-gray-300">{finding.reasoning}</p>
                            </div>
                            <div>
                              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Metrics</h4>
                              <div className="flex space-x-4 mb-4">
                                <div className="bg-dark-800 p-3 rounded-lg border border-dark-700 flex-1">
                                  <div className="text-xs text-gray-400 mb-1">Levenshtein Distance</div>
                                  <div className="text-xl font-mono text-white">{finding.distance_score}</div>
                                </div>
                              </div>
                              {finding.reachability && (
                                <div>
                                  <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Reachability Analysis</h4>
                                  <div className="bg-dark-800 p-3 rounded-lg border border-dark-700">
                                    <p className="text-sm text-gray-300 mb-2">{finding.reachability_reason}</p>
                                    {finding.call_chain && finding.call_chain.length > 0 && (
                                      <div className="mt-3 p-3 bg-dark-900 rounded border border-dark-700 font-mono text-xs text-gray-400 overflow-x-auto">
                                        <div className="flex items-center space-x-2">
                                          {finding.call_chain.map((step, stepIdx) => (
                                            <div key={stepIdx} className="flex items-center">
                                              <span className={stepIdx === finding.call_chain.length - 1 ? "text-red-400 font-bold" : "text-gray-300"}>
                                                {step}
                                              </span>
                                              {stepIdx < finding.call_chain.length - 1 && (
                                                <svg className="w-4 h-4 mx-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-panel p-12 text-center border-dashed">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 text-green-400 mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h3 className="text-xl font-medium text-gray-200 mb-2">All Clear!</h3>
          <p className="text-gray-400">No typosquatting risks detected in the uploaded file against the known top packages.</p>
        </div>
      )}
    </div>
  );
}
