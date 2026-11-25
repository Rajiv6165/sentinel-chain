import benchmarksData from '../data/benchmarks.json';

export default function ProofStrip() {
  const stats = benchmarksData.hero_proof_stats || [
    { value: '55', caption: 'real malicious names tested' },
    { value: '512', caption: 'legit packages as negatives' },
    { value: '20', caption: 'hand-verified projects' },
    { value: '0', caption: 'false-unreachable (was 4)' }
  ];

  return (
    <div
      className="anim-proof coord-proof flex items-center justify-between border-t border-[rgba(148,170,210,0.16)] pt-[calc(16*var(--u))] z-20 pointer-events-auto tablet-full-width compact-full-width"
      style={{ boxSizing: 'border-box' }}
    >
      {/* Left Block */}
      <div className="flex flex-col gap-[calc(4*var(--u))] pr-[calc(24*var(--u))] flex-shrink-0">
        <span className="font-mono text-[calc(10.5*var(--u))] uppercase tracking-[0.16em] text-[#7A89A3] font-medium">
          MEASURED, NOT CLAIMED
        </span>
        <a
          href="https://github.com/rajivthakker/sentinel-chain/blob/main/docs/benchmarks.md"
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-[calc(12*var(--u))] text-[#9AA7BD] hover:text-[#FFB547] transition-colors flex items-center gap-[calc(4*var(--u))] group"
        >
          <span>Read the methodology</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </div>

      {/* Right Stats with 1px dividers */}
      <div className="proof-stats-container flex items-center gap-0 flex-1 justify-end">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            className={`proof-stat-item flex items-baseline gap-[calc(12*var(--u))] px-[calc(28*var(--u))] ${
              idx > 0 ? 'border-l border-[rgba(148,170,210,0.16)]' : ''
            }`}
          >
            {/* Number in Instrument Serif 30u --text */}
            <span
              className="font-serif text-[calc(30*var(--u))] text-[#EAF0FA] font-normal leading-none"
              style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
            >
              {stat.value}
            </span>

            {/* Caption mono 10u --muted, max 24 chars */}
            <span className="font-mono text-[calc(10*var(--u))] text-[#9AA7BD] leading-tight max-w-[24ch]">
              {stat.caption}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
