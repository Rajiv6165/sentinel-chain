import { useEffect, useState } from 'react';

/**
 * CallChainDiagram renders an interactive call path as connected nodes
 * with an SVG connecting arrow and a short draw-in animation.
 */
export default function CallChainDiagram({ steps, isVulnerable = true }) {
  const [animReady, setAnimReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="w-full my-3 p-4 rounded-xl bg-[#070B14]/80 border border-[rgba(148,170,210,0.16)]">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs uppercase tracking-wider text-[#9AA7BD] font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FF5A5F] animate-pulse" />
          Execution Call Path (AST Trace)
        </span>
        <span className="font-mono text-[10px] text-[#7A89A3]">
          {steps.length} {steps.length === 1 ? 'node' : 'nodes'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 overflow-x-auto py-2 no-scrollbar">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const isTarget = isLast && isVulnerable;

          return (
            <div key={idx} className="flex items-center flex-shrink-0">
              {/* Node Card */}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs transition-all ${
                  isTarget
                    ? 'bg-[#FF5A5F]/15 border-[#FF5A5F] text-[#FF5A5F] shadow-[0_0_12px_rgba(255,90,95,0.25)] font-semibold'
                    : 'bg-[#0B1220] border-[rgba(148,170,210,0.2)] text-[#EAF0FA]'
                }`}
                style={{
                  transform: animReady ? 'scale(1)' : 'scale(0.92)',
                  opacity: animReady ? 1 : 0,
                  transition: `all 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s`
                }}
              >
                <span className="text-[10px] opacity-60">#{idx + 1}</span>
                <span>{step}</span>
                {isTarget && (
                  <span className="text-[10px] uppercase px-1 rounded bg-[#FF5A5F]/20 text-[#FF5A5F] font-bold">
                    Vulnerable
                  </span>
                )}
              </div>

              {/* Connecting Arrow */}
              {!isLast && (
                <div className="mx-2 text-[#7A89A3] flex items-center">
                  <svg
                    width="18"
                    height="12"
                    viewBox="0 0 18 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="overflow-visible"
                  >
                    <line
                      x1="0"
                      y1="6"
                      x2="13"
                      y2="6"
                      stroke="rgba(148,170,210,0.35)"
                      strokeWidth="1.5"
                      strokeDasharray="20"
                      strokeDashoffset={animReady ? '0' : '20'}
                      style={{
                        transition: `stroke-dashoffset 0.4s ease ${idx * 0.1 + 0.15}s`
                      }}
                    />
                    <polyline
                      points="11 3 14 6 11 9"
                      stroke="rgba(148,170,210,0.5)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
