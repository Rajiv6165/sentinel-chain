import { useEffect, useRef } from 'react';

export default function ChainEvidencePanel({
  evidence,
  node,
  onClose,
  onNavigate,
  isMobile
}) {
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Manage focus: when panel opens, focus close button or panel
  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [node.id]);

  // Handle global escape and arrow keys while panel is focused
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNavigate('next');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigate('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate]);

  if (!evidence || !node) return null;

  const isDanger = node.type === 'danger';
  const isAccent = node.type === 'accent';
  const isSafe = node.type === 'safe';
  const isSafeDim = node.type === 'safe-dim';
  const isUnknown = node.type === 'unknown';

  const badgeBorderColor = isDanger
    ? 'border-[#FF5A5F]/40 text-[#FF5A5F] bg-[#FF5A5F]/10'
    : isAccent
    ? 'border-[#FFB547]/40 text-[#FFB547] bg-[#FFB547]/10'
    : isSafe
    ? 'border-[#4FE3C1]/40 text-[#4FE3C1] bg-[#4FE3C1]/10'
    : isSafeDim
    ? 'border-[#4FE3C1]/30 text-[#4FE3C1]/80 bg-[#4FE3C1]/5'
    : 'border-[#7A89A3]/30 text-[#9AA7BD] bg-[#7A89A3]/10';

  const content = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence for ${node.name}`}
      className={`rounded-2xl border border-[rgba(148,170,210,0.22)] bg-[#0B1220]/95 backdrop-blur-xl shadow-2xl p-5 md:p-6 text-left ${
        isMobile
          ? 'w-full max-h-[85vh] overflow-y-auto'
          : 'w-[calc(900*var(--u))] max-w-[95vw] shadow-[0_20px_50px_rgba(0,0,0,0.6)]'
      }`}
      style={{
        boxShadow: isDanger
          ? '0 0 35px rgba(255, 90, 95, 0.15), 0 20px 50px rgba(0,0,0,0.7)'
          : isAccent
          ? '0 0 35px rgba(255, 181, 71, 0.12), 0 20px 50px rgba(0,0,0,0.7)'
          : '0 20px 50px rgba(0,0,0,0.7)'
      }}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(148,170,210,0.14)] pb-3 mb-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Sample Evidence Pill */}
          <span className="font-mono text-[10px] md:text-[11px] uppercase tracking-[0.14em] px-2.5 py-0.5 rounded-full bg-[#FFB547]/15 border border-[#FFB547]/40 text-[#FFB547] font-semibold">
            SAMPLE EVIDENCE
          </span>

          {/* Node Name */}
          <span className="font-mono text-base md:text-lg font-bold text-[#EAF0FA]">
            {node.name}
          </span>

          {/* Ecosystem */}
          <span className="font-mono text-[10px] uppercase text-[#7A89A3] px-1.5 py-0.5 rounded bg-[#070B14] border border-[rgba(148,170,210,0.1)]">
            {evidence.ecosystem || 'npm'}
          </span>

          {/* Verdict Chip */}
          <span className={`font-mono text-[10px] md:text-[11px] uppercase tracking-wider px-2.5 py-0.5 rounded-md border font-semibold ${badgeBorderColor}`}>
            {node.verdict}
          </span>
        </div>

        {/* Close Button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close evidence panel"
          className="text-[#9AA7BD] hover:text-[#EAF0FA] p-1.5 rounded-lg border border-transparent hover:border-[rgba(148,170,210,0.2)] hover:bg-[#070B14] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FFB547]"
        >
          <span className="font-mono text-xs uppercase px-1.5 hidden md:inline">Esc</span>
          <span className="text-base font-bold">✕</span>
        </button>
      </div>

      {/* Main Evidence Content */}
      <div className="space-y-4">
        {/* Summary */}
        <p className="text-sm md:text-base font-sans font-medium text-[#EAF0FA] leading-relaxed">
          {evidence.summary}
        </p>

        {/* Reachability Call Chain (jsonwebtoken) */}
        {evidence.callChain && (
          <div className="rounded-xl p-4 bg-[#070B14] border border-[#FF5A5F]/30 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-[#FF5A5F]">
              <span className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FF5A5F] animate-pulse" />
                AST CALL GRAPH TRACE: EXPLOITABLE PATH
              </span>
              <span className="text-[#9AA7BD]">Static Analysis</span>
            </div>

            {/* Stepper Chain */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {evidence.callChain.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg border font-mono text-xs flex flex-col justify-between ${
                    step.type === 'target'
                      ? 'bg-[#FF5A5F]/15 border-[#FF5A5F]/40 text-[#FF5A5F]'
                      : 'bg-[rgba(14,22,38,0.7)] border-[rgba(148,170,210,0.16)] text-[#EAF0FA]'
                  }`}
                >
                  <div className="text-[10px] text-[#7A89A3] uppercase mb-1">
                    Step {step.step}: {step.desc}
                  </div>
                  <div className="font-semibold text-xs break-all">
                    {step.code}
                  </div>
                </div>
              ))}
            </div>

            {/* Note that static analysis found a path */}
            <p className="text-xs font-sans text-[#9AA7BD] leading-relaxed pt-1 border-t border-[rgba(148,170,210,0.1)]">
              <strong className="text-[#EAF0FA]">Finding Note: </strong>
              {evidence.staticAnalysisNote || evidence.evidence}
            </p>
          </div>
        )}

        {/* Typosquat Registry Facts (lodsh) */}
        {evidence.registryFacts && (
          <div className="rounded-xl p-4 bg-[#070B14] border border-[#FFB547]/30 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-[#FFB547]">
              <span className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FFB547] animate-pulse" />
                TYPOSQUAT REGISTRY HEURISTICS
              </span>
              <span className="text-[#9AA7BD]">Edit Distance: {evidence.registryFacts.editDistance}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-[#0B1220] border border-[rgba(148,170,210,0.1)]">
                <div className="text-[10px] text-[#7A89A3] uppercase">Target Package</div>
                <div className="text-[#4FE3C1] font-semibold">{evidence.registryFacts.targetPackage}</div>
              </div>
              <div className="p-2 rounded bg-[#0B1220] border border-[rgba(148,170,210,0.1)]">
                <div className="text-[10px] text-[#7A89A3] uppercase">Weekly Downloads</div>
                <div className="text-[#FF5A5F] font-semibold">{evidence.registryFacts.suspectDownloads}</div>
              </div>
              <div className="p-2 rounded bg-[#0B1220] border border-[rgba(148,170,210,0.1)]">
                <div className="text-[10px] text-[#7A89A3] uppercase">Target Downloads</div>
                <div className="text-[#9AA7BD] font-semibold">{evidence.registryFacts.targetDownloads}</div>
              </div>
              <div className="p-2 rounded bg-[#0B1220] border border-[rgba(148,170,210,0.1)]">
                <div className="text-[10px] text-[#7A89A3] uppercase">Traffic Ratio</div>
                <div className="text-[#FFB547] font-semibold">{evidence.registryFacts.downloadRatio}</div>
              </div>
            </div>

            <p className="text-xs font-sans text-[#9AA7BD] leading-relaxed pt-1 border-t border-[rgba(148,170,210,0.1)]">
              <strong className="text-[#EAF0FA]">Registry Heuristic: </strong>
              {evidence.evidence}
            </p>
          </div>
        )}

        {/* Detailed technical breakdown for No Path or Unknown */}
        {evidence.details && (
          <div className="rounded-xl p-3.5 bg-[#070B14] border border-[rgba(148,170,210,0.15)] space-y-2 text-xs font-mono">
            {Object.entries(evidence.details).map(([key, value]) => (
              <div key={key} className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-2">
                <span className="text-[#7A89A3] uppercase text-[10px] min-w-[130px]">{key}:</span>
                <span className="text-[#EAF0FA]">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Standard Evidence prose */}
        {!evidence.callChain && !evidence.registryFacts && (
          <p className="text-xs md:text-sm font-sans text-[#9AA7BD] leading-relaxed">
            {evidence.evidence}
          </p>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t border-[rgba(148,170,210,0.12)] pt-3.5 mt-4 text-xs font-mono">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('prev')}
            className="px-2.5 py-1 rounded-md border border-[rgba(148,170,210,0.2)] bg-[#070B14] text-[#9AA7BD] hover:text-[#EAF0FA] hover:border-[#FFB547] transition-colors cursor-pointer"
          >
            ← Prev
          </button>
          <button
            onClick={() => onNavigate('next')}
            className="px-2.5 py-1 rounded-md border border-[rgba(148,170,210,0.2)] bg-[#070B14] text-[#9AA7BD] hover:text-[#EAF0FA] hover:border-[#FFB547] transition-colors cursor-pointer"
          >
            Next →
          </button>
          <span className="text-[#7A89A3] text-[11px] hidden md:inline">
            Node {node.id} of 9 (Use Arrow keys)
          </span>
        </div>

        <span className="text-[10px] text-[#7A89A3] uppercase tracking-wider">
          SAMPLE INSPECTOR · NOT LIVE DATA
        </span>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center">
        {/* Backdrop */}
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          aria-hidden="true"
        />
        {/* Bottom Sheet */}
        <div className="relative z-50 w-full animate-slide-up">
          <div className="w-12 h-1.5 bg-[#9AA7BD]/30 rounded-full mx-auto mb-2" />
          {content}
        </div>
      </div>
    );
  }

  // Desktop: centered below the chain inside the hero stage
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-[calc(260*var(--u))] z-30 pointer-events-auto"
      style={{ animation: 'fadeIn 0.2s ease forwards' }}
    >
      {content}
    </div>
  );
}
