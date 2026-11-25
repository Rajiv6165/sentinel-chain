import { useState } from 'react';

export default function SandboxResults({ result }) {
  const [expanded, setExpanded] = useState(true);

  if (!result || result.status !== 'completed') {
    return (
      <div className="bg-[rgba(14,22,38,0.78)] rounded-[22px] border border-[#FF5A5F]/30 shadow-xl overflow-hidden mt-8 p-6 text-center">
        <h3 className="text-lg font-sans font-semibold mb-1 text-[#EAF0FA]">Sandbox Execution Blocked</h3>
        <p className="text-[#FF5A5F] font-mono text-xs">{result?.error || 'Unknown container execution failure'}</p>
      </div>
    );
  }

  const data = result.result;
  const raw = result.raw || {};
  
  const getRiskBadge = (level) => {
    switch (level?.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'text-[#FF5A5F] bg-[#FF5A5F]/15 border-[#FF5A5F]/30';
      case 'medium':
        return 'text-[#FFB547] bg-[#FFB547]/15 border-[#FFB547]/30';
      case 'low':
      case 'safe':
        return 'text-[#4FE3C1] bg-[#4FE3C1]/15 border-[#4FE3C1]/30';
      default:
        return 'text-[#9AA7BD] bg-[rgba(148,170,210,0.1)] border-[rgba(148,170,210,0.2)]';
    }
  };

  return (
    <div className="bg-[rgba(14,22,38,0.78)] rounded-[22px] border border-[rgba(148,170,210,0.16)] shadow-xl overflow-hidden mt-8">
      <div className="p-6 border-b border-[rgba(148,170,210,0.16)] flex justify-between items-center">
        <div>
          <h2 className="text-xl font-sans font-semibold text-[#EAF0FA] mb-1">Sandbox Telemetry Report</h2>
          <p className="text-xs font-mono text-[#9AA7BD]">
            {result.package} {result.version ? `v${result.version}` : ''} ({result.ecosystem})
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full border text-xs font-mono font-semibold uppercase tracking-wider ${getRiskBadge(data.risk_level)}`}>
          {data.risk_level} RISK
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <h3 className="text-sm font-mono uppercase tracking-wider text-[#9AA7BD] mb-3">
            Behavioral Evidence
          </h3>
          
          {data.evidence && data.evidence.length > 0 ? (
            <div className="space-y-3">
              {data.evidence.map((ev, i) => (
                <div key={i} className={`p-4 rounded-xl border ${getRiskBadge(ev.level)}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold uppercase">{ev.type}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/30 uppercase">{ev.level}</span>
                  </div>
                  <p className="text-xs font-sans opacity-90 leading-relaxed">{ev.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center border border-[rgba(148,170,210,0.16)] rounded-xl bg-[#0B1220]/50">
              <p className="text-xs font-sans text-[#9AA7BD]">No suspicious behavior detected during installation.</p>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-[rgba(148,170,210,0.1)]">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-[#7AA2FF] hover:underline text-xs font-mono cursor-pointer"
          >
            <span>{expanded ? '▲ Hide Raw Container Logs' : '▼ View Raw Container Logs'}</span>
          </button>
          
          {expanded && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#070B14] rounded-xl p-4 border border-[rgba(148,170,210,0.16)] overflow-x-auto">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#9AA7BD] mb-2">Network Outbound</h4>
                {raw.network && raw.network.length > 0 ? (
                  <ul className="text-xs text-[#EAF0FA] space-y-1 font-mono">
                    {raw.network.map((req, i) => (
                      <li key={i} className="text-[11px] text-[#7AA2FF]">
                        {req.method} {req.domain}:{req.port}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#7A89A3] italic font-mono">No network calls detected</p>
                )}
              </div>
              
              <div className="bg-[#070B14] rounded-xl p-4 border border-[rgba(148,170,210,0.16)] overflow-x-auto">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#9AA7BD] mb-2">Filesystem Diffs</h4>
                {raw.fs_diffs && raw.fs_diffs.length > 0 ? (
                  <ul className="text-xs text-[#EAF0FA] space-y-1 font-mono">
                    {raw.fs_diffs.slice(0, 50).map((diff, i) => (
                      <li key={i} className="text-[11px] truncate">
                        <span className={diff.Kind === 0 ? 'text-[#FFB547]' : diff.Kind === 1 ? 'text-[#4FE3C1]' : 'text-[#FF5A5F]'}>
                          {diff.Kind === 0 ? '[M]' : diff.Kind === 1 ? '[A]' : '[D]'}
                        </span> {diff.Path}
                      </li>
                    ))}
                    {raw.fs_diffs.length > 50 && (
                      <li className="text-[#7A89A3] text-[10px] italic">...and {raw.fs_diffs.length - 50} more paths</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-xs text-[#7A89A3] italic font-mono">No filesystem mutations recorded</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
