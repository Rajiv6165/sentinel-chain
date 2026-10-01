import { useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';

export default function FullScanResults({ result, jobId }) {
  const reportRef = useRef();
  const [attestationData, setAttestationData] = useState(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState('');

  const handleSignProvenance = async () => {
    if (!jobId) return;
    setIsSigning(true);
    setSignError('');
    try {
      const res = await fetch(`http://localhost:8000/api/sbom/${jobId}/attestation?sign=true`);
      if (!res.ok) throw new Error('Failed to generate signed attestation');
      const data = await res.json();
      setAttestationData(data);
    } catch (err) {
      setSignError(err.message);
    } finally {
      setIsSigning(false);
    }
  };

  const handleExportPDF = () => {
    const element = reportRef.current;
    const opt = {
      margin:       1,
      filename:     'sentinel-chain-report.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  const getRiskColor = (risk) => {
    switch (risk?.toUpperCase()) {
      case 'CRITICAL': return 'bg-red-500 text-white';
      case 'HIGH': return 'bg-orange-500 text-white';
      case 'MEDIUM': return 'bg-yellow-500 text-gray-900';
      case 'LOW': return 'bg-green-500 text-white';
      case 'SAFE': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const permissiveCount = result.filter(p => p.license?.category === 'Permissive').length;
  const copyleftCount = result.filter(p => ['Weak Copyleft', 'Strong Copyleft'].includes(p.license?.category)).length;
  const unknownLicenseCount = result.filter(p => ['Unknown', 'Unknown/Proprietary'].includes(p.license?.category)).length;
  const hasLicenseData = result.some(p => p.license);

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Full Scan Report</h2>
        <div className="flex gap-2">
          {jobId && (
            <>
              <a 
                href={`http://localhost:8000/api/sbom/${jobId}?format=cyclonedx`}
                target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 bg-dark-700 hover:bg-dark-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-dark-600"
              >
                CycloneDX SBOM
              </a>
              <a 
                href={`http://localhost:8000/api/sbom/${jobId}?format=spdx`}
                target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 bg-dark-700 hover:bg-dark-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-dark-600"
              >
                SPDX SBOM
              </a>
              <a 
                href={`http://localhost:8000/api/sbom/${jobId}?format=vex`}
                target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 bg-dark-700 hover:bg-dark-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-dark-600"
              >
                VEX Document
              </a>
              {!attestationData ? (
                <button 
                  onClick={handleSignProvenance}
                  disabled={isSigning}
                  className="px-3 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {isSigning ? 'Signing...' : 'Sign Provenance'}
                </button>
              ) : (
                <div className="relative group flex items-center">
                  <div className="px-3 py-2 bg-green-500/20 border border-green-500/50 text-green-400 text-sm font-medium rounded-lg flex items-center gap-2 cursor-pointer">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Verified
                  </div>
                  {attestationData.signature?.hashedrekord && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-dark-800 border border-dark-700 rounded-lg p-4 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none group-hover:pointer-events-auto">
                      <p className="text-xs text-gray-400 mb-2 font-mono break-all">
                        Log Index: {attestationData.signature.hashedrekord.logIndex}
                      </p>
                      <a 
                        href={`https://search.sigstore.dev/?logIndex=${attestationData.signature.hashedrekord.logIndex}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-brand-400 hover:text-brand-300 text-xs flex items-center gap-1"
                      >
                        View in Rekor Log
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <button 
            onClick={handleExportPDF}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2 ml-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Export PDF
          </button>
        </div>
      </div>

      <div ref={reportRef} className="bg-dark-800 p-8 rounded-2xl border border-dark-700 shadow-xl space-y-8 text-gray-200">
        <div className="text-center mb-8 border-b border-dark-700 pb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Sentinel-Chain Risk Report</h1>
          <p className="text-gray-400">Automated Supply Chain Security Analysis</p>
        </div>

        {hasLicenseData && (
          <div className="bg-dark-900 rounded-xl p-6 border border-dark-700 mb-8 flex justify-around">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-400">{permissiveCount}</div>
              <div className="text-sm text-gray-400 uppercase tracking-wide">Permissive</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-400">{copyleftCount}</div>
              <div className="text-sm text-gray-400 uppercase tracking-wide">Copyleft</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400">{unknownLicenseCount}</div>
              <div className="text-sm text-gray-400 uppercase tracking-wide">Unknown</div>
            </div>
          </div>
        )}

        {result.length === 0 ? (
          <div className="text-center p-8 bg-dark-900 rounded-xl">
            <p className="text-xl text-gray-400">No risks detected across any scanned dependencies.</p>
          </div>
        ) : (
          result.map((pkg, idx) => (
            <div key={idx} className="bg-dark-900 rounded-xl p-6 border border-dark-700">
              <div className="flex justify-between items-center border-b border-dark-800 pb-4 mb-4">
                <h3 className="text-xl font-bold font-mono text-brand-400">{pkg.package_name}</h3>
                <span className={`px-4 py-1 rounded-full font-bold text-sm tracking-wider ${getRiskColor(pkg.overall_risk)}`}>
                  {pkg.overall_risk} RISK
                </span>
              </div>

              <div className="space-y-6">
                {/* Typosquat Section */}
                {pkg.typosquat && (
                  <div className="bg-dark-800/50 p-4 rounded-lg border border-dark-700">
                    <h4 className="font-semibold text-lg mb-2 text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500"></span> Typosquat Analysis
                    </h4>
                    <p className="text-sm text-gray-400 mb-2">
                      Suspected target: <span className="font-mono text-gray-300">{pkg.typosquat.suspected_target}</span>
                      <br/>
                      Distance score: {pkg.typosquat.distance_score} ({pkg.typosquat.risk_level} risk)
                    </p>
                    {pkg.typosquat.narrative && (
                      <div className="mt-3 p-3 bg-brand-900/20 border border-brand-500/30 rounded text-brand-200 text-sm italic">
                        <strong>AI Analysis:</strong> {pkg.typosquat.narrative}
                      </div>
                    )}
                  </div>
                )}

                {/* License Section */}
                {pkg.license && (
                  <div className="bg-dark-800/50 p-4 rounded-lg border border-dark-700">
                    <h4 className="font-semibold text-lg mb-2 text-white flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${pkg.license.status === 'fail' ? 'bg-red-500' : pkg.license.status === 'warn' ? 'bg-yellow-500' : 'bg-green-500'}`}></span> License Compliance
                    </h4>
                    <p className="text-sm text-gray-400 mb-2">
                      SPDX ID: <span className="font-mono text-gray-300">{pkg.license.spdx_id}</span> ({pkg.license.category})
                      <br/>
                      Policy Status: <span className={`font-bold ${pkg.license.status === 'fail' ? 'text-red-400' : pkg.license.status === 'warn' ? 'text-yellow-400' : 'text-green-400'}`}>{pkg.license.status.toUpperCase()}</span>
                    </p>
                    {pkg.license.status !== 'pass' && (
                      <div className="mt-2 p-2 bg-dark-900 rounded font-mono text-xs text-gray-400">
                        {pkg.license.reason}
                      </div>
                    )}
                  </div>
                )}

                {/* Reachability Section */}
                {pkg.cves && pkg.cves.length > 0 && (
                  <div className="bg-dark-800/50 p-4 rounded-lg border border-dark-700">
                    <h4 className="font-semibold text-lg mb-2 text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span> CVE & Reachability
                    </h4>
                    {pkg.cves.map((cve, cidx) => (
                      <div key={cidx} className="mb-4 last:mb-0">
                        <p className="text-sm text-gray-400 mb-2">
                          Status: <span className={`font-bold ${cve.reachability === 'REACHABLE' ? 'text-red-400' : 'text-green-400'}`}>{cve.reachability}</span>
                          <br/>
                          EPSS Probability: {(cve.epss_score * 100).toFixed(2)}%
                        </p>
                        {cve.reachability === 'REACHABLE' && cve.call_chain && (
                          <div className="mb-2 p-2 bg-dark-900 rounded font-mono text-xs overflow-x-auto text-gray-400">
                            {cve.call_chain.join(' → ')}
                          </div>
                        )}
                        {cve.narrative && (
                          <div className="mt-2 p-3 bg-brand-900/20 border border-brand-500/30 rounded text-brand-200 text-sm italic">
                            <strong>AI Analysis:</strong> {cve.narrative}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Sandbox Section */}
                {pkg.sandbox && pkg.sandbox.evidence && pkg.sandbox.evidence.length > 0 && (
                  <div className="bg-dark-800/50 p-4 rounded-lg border border-dark-700">
                    <h4 className="font-semibold text-lg mb-2 text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span> Sandbox Behavior
                    </h4>
                    <ul className="list-disc pl-5 mb-3 text-sm text-gray-400 space-y-1">
                      {pkg.sandbox.evidence.map((ev, eidx) => (
                        <li key={eidx}>{ev.message} <span className="text-xs uppercase text-gray-500">({ev.level})</span></li>
                      ))}
                    </ul>
                    {pkg.sandbox.narrative && (
                      <div className="mt-3 p-3 bg-brand-900/20 border border-brand-500/30 rounded text-brand-200 text-sm italic">
                        <strong>AI Analysis:</strong> {pkg.sandbox.narrative}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
