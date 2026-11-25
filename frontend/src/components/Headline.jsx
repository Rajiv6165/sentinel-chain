export default function Headline() {
  return (
    <div className="coord-headline pointer-events-none select-none z-20">
      {/* Eyebrow at top 340u */}
      <div className="anim-eyebrow coord-eyebrow flex items-center justify-center gap-[calc(8*var(--u))] whitespace-nowrap">
        <span className="w-[calc(6*var(--u))] h-[calc(6*var(--u))] rounded-full bg-[#FFB547] shadow-[0_0_8px_#FFB547]" />
        <span className="font-mono text-[calc(11*var(--u))] tracking-[0.16em] uppercase text-[#9AA7BD] font-medium">
          [ SUPPLY-CHAIN SECURITY · EXPLOITABILITY ANALYSIS ]
        </span>
      </div>

      {/* H1 at top 366u */}
      <h1
        className="anim-h1 coord-h1 font-serif font-normal leading-[1.02] tracking-[-0.01em] m-0"
        style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
        }}
      >
        <span className="block text-[#EAF0FA]">
          Not every CVE is a threat.
        </span>
        <span className="block italic text-[#FFB547] font-normal mt-[calc(4*var(--u))]">
          Prove which ones are.
        </span>
      </h1>

      {/* Subcopy at top 528u */}
      <p className="anim-subcopy coord-subcopy font-sans leading-[1.55] text-[#9AA7BD] m-0">
        Sentinel-Chain traces whether a vulnerable function is actually reachable from your code, then checks typosquats, license policy, and signed SBOMs.
      </p>
    </div>
  );
}
