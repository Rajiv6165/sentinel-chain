import { useState } from 'react';
import benchmarksData from '../data/benchmarks.json';

export default function BenchmarkExplorer() {
  const [distance, setDistance] = useState(1); // 1, 2, 3
  const [registryEnabled, setRegistryEnabled] = useState(true);
  const [showFalsePositives, setShowFalsePositives] = useState(false);
  const [showMissedAttacks, setShowMissedAttacks] = useState(false);

  // Derive the active configuration key
  let configKey = `dist${distance}_reg_${registryEnabled ? 'on' : 'off'}`;
  
  // If combination does not exist, fall back to available
  if (!benchmarksData.typosquat_configurations[configKey]) {
    configKey = `dist${distance}_reg_on`;
  }

  const activeConfig = benchmarksData.typosquat_configurations[configKey] || benchmarksData.typosquat_configurations.dist1_reg_on;
  const canToggleRegistry = distance === 2; // Only distance 2 has both with & without registry data

  const handleDistanceChange = (d) => {
    setDistance(d);
    // If selecting dist 1 or 3, force registry true because no offline dist-only sweep was recorded
    if (d !== 2 && !registryEnabled) {
      setRegistryEnabled(true);
    }
  };

  return (
    <section
      id="benchmarks"
      aria-labelledby="benchmarks-heading"
      className="max-w-6xl mx-auto px-6 py-24 border-t border-[rgba(148,170,210,0.16)] scroll-mt-28"
    >
      {/* Header */}
      <div className="text-center mb-16">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-[#4FE3C1]" />
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#4FE3C1] font-semibold">
            EMPIRICAL DATASET VALIDATION
          </span>
        </div>
        <h2
          id="benchmarks-heading"
          className="text-4xl md:text-5xl font-normal tracking-tight text-[#EAF0FA] m-0"
          style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
        >
          Measured, not claimed
        </h2>
        <p className="text-[#9AA7BD] text-sm md:text-base mt-3 max-w-2xl mx-auto font-sans leading-relaxed">
          Evaluated against 55 documented real-world malware attacks, 512 challenging legitimate packages, and 20 ground-truth reachability micro-projects.
        </p>

        {/* In-sample note mandated by benchmark guidelines */}
        <div className="inline-block mt-4 px-4 py-1.5 rounded-full bg-[#0B1220] border border-[rgba(148,170,210,0.2)]">
          <span className="font-mono text-xs text-[#FFB547]">
            Note: {benchmarksData.in_sample_note}
          </span>
        </div>
      </div>

      {/* Interactive Threshold Controls */}
      <div className="rounded-2xl border border-[rgba(148,170,210,0.2)] bg-[rgba(14,22,38,0.78)] backdrop-blur-xl p-6 md:p-8 shadow-xl mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-[rgba(148,170,210,0.12)]">
          {/* Distance Segmented Control */}
          <div>
            <label className="font-mono text-xs text-[#7A89A3] uppercase tracking-wider block mb-2">
              Max Levenshtein Edit Distance
            </label>
            <div role="group" aria-label="Max Edit Distance" className="flex p-1 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.16)]">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={distance === d}
                  onClick={() => handleDistanceChange(d)}
                  className={`px-5 py-2 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FFB547] ${
                    distance === d
                      ? 'bg-[#FFB547] text-[#1A1206] shadow-sm'
                      : 'text-[#9AA7BD] hover:text-[#EAF0FA]'
                  }`}
                >
                  Distance {d} {d === 1 ? '(Default)' : d === 2 ? '(Review)' : '(Sweep)'}
                </button>
              ))}
            </div>
          </div>

          {/* Registry Heuristics Toggle */}
          <div>
            <label className="font-mono text-xs text-[#7A89A3] uppercase tracking-wider block mb-2">
              Registry Heuristics
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={registryEnabled}
                disabled={!canToggleRegistry}
                onClick={() => setRegistryEnabled(!registryEnabled)}
                title={!canToggleRegistry ? 'Only Distance 2 includes both Phase 11 (No Registry) and Phase 12 (With Registry) benchmarks' : 'Toggle registry signals'}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#4FE3C1] ${
                  registryEnabled ? 'bg-[#4FE3C1]' : 'bg-[#7A89A3]/30'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-[#070B14] transition-transform ${
                    registryEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
              <div className="flex flex-col text-left">
                <span className="font-mono text-xs font-bold text-[#EAF0FA]">
                  {registryEnabled ? 'Registry Enabled' : 'No Registry (Distance Only)'}
                </span>
                <span className="font-mono text-[10px] text-[#7A89A3]">
                  {canToggleRegistry
                    ? 'Comparing Phase 11 baseline vs Phase 12 heuristics'
                    : 'Fixed in dataset for this threshold'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Overview Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-6 mb-6">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4FE3C1]" />
            <span className="font-mono text-sm font-bold text-[#EAF0FA]">
              {activeConfig.label}
            </span>
          </div>
          <span className="font-mono text-xs text-[#FFB547] bg-[#FFB547]/10 border border-[#FFB547]/30 px-3 py-1 rounded-full self-start sm:self-auto">
            Tier: {activeConfig.tier}
          </span>
        </div>

        {/* Primary Metric Bars (Precision, Recall, F1) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Precision */}
          <div className="p-4 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.14)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-[#7A89A3] uppercase">Precision</span>
              <span className="font-serif text-2xl text-[#4FE3C1]" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                {activeConfig.precision}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Precision"
              aria-valuenow={Math.round(activeConfig.precision_num)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full h-2.5 rounded-full bg-[#0B1220] overflow-hidden border border-[rgba(148,170,210,0.1)]"
            >
              <div
                className="h-full rounded-full bg-[#4FE3C1] transition-all duration-700 ease-out"
                style={{ width: `${activeConfig.precision_num}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-[#9AA7BD] mt-2">
              TP / (TP + FP) · False alarms: {activeConfig.fp}
            </span>
          </div>

          {/* Recall */}
          <div className="p-4 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.14)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-[#7A89A3] uppercase">Recall</span>
              <span className="font-serif text-2xl text-[#FFB547]" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                {activeConfig.recall}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Recall"
              aria-valuenow={Math.round(activeConfig.recall_num)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full h-2.5 rounded-full bg-[#0B1220] overflow-hidden border border-[rgba(148,170,210,0.1)]"
            >
              <div
                className="h-full rounded-full bg-[#FFB547] transition-all duration-700 ease-out"
                style={{ width: `${activeConfig.recall_num}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-[#9AA7BD] mt-2">
              TP / (TP + FN) · Caught {activeConfig.tp} / {activeConfig.total_positives} attacks
            </span>
          </div>

          {/* F1 Score */}
          <div className="p-4 rounded-xl bg-[#070B14] border border-[rgba(148,170,210,0.14)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-[#7A89A3] uppercase">F1 Score</span>
              <span className="font-serif text-2xl text-[#7AA2FF]" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                {activeConfig.f1}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="F1 Score"
              aria-valuenow={Math.round(activeConfig.f1_num)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full h-2.5 rounded-full bg-[#0B1220] overflow-hidden border border-[rgba(148,170,210,0.1)]"
            >
              <div
                className="h-full rounded-full bg-[#7AA2FF] transition-all duration-700 ease-out"
                style={{ width: `${activeConfig.f1_num}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-[#9AA7BD] mt-2">
              Harmonic mean of precision &amp; recall
            </span>
          </div>
        </div>

        {/* Confusion Matrix 4-Grid */}
        <div className="p-5 rounded-xl bg-[#070B14]/80 border border-[rgba(148,170,210,0.14)] mb-6">
          <div className="font-mono text-xs text-[#7A89A3] uppercase tracking-wider mb-3">
            Confusion Matrix Breakdown
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-lg bg-[#0B1220] border border-[#4FE3C1]/20">
              <span className="font-mono text-[10px] text-[#7A89A3] uppercase block">True Positives (TP)</span>
              <span className="font-serif text-2xl text-[#4FE3C1] font-bold" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                {activeConfig.tp}
              </span>
              <span className="font-mono text-[10px] text-[#9AA7BD] block mt-0.5">attacks caught</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1220] border border-[#FF5A5F]/20">
              <span className="font-mono text-[10px] text-[#7A89A3] uppercase block">False Positives (FP)</span>
              <span className="font-serif text-2xl text-[#FF5A5F] font-bold" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                {activeConfig.fp}
              </span>
              <span className="font-mono text-[10px] text-[#9AA7BD] block mt-0.5">false alarms</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1220] border border-[#FFB547]/20">
              <span className="font-mono text-[10px] text-[#7A89A3] uppercase block">False Negatives (FN)</span>
              <span className="font-serif text-2xl text-[#FFB547] font-bold" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                {activeConfig.fn}
              </span>
              <span className="font-mono text-[10px] text-[#9AA7BD] block mt-0.5">missed attacks</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1220] border border-[#4FE3C1]/20">
              <span className="font-mono text-[10px] text-[#7A89A3] uppercase block">True Negatives (TN)</span>
              <span className="font-serif text-2xl text-[#4FE3C1] font-bold" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                {activeConfig.tn}
              </span>
              <span className="font-mono text-[10px] text-[#9AA7BD] block mt-0.5">cleared negatives</span>
            </div>
          </div>
        </div>

        {/* Expandable False Positives Accordion */}
        <div className="border border-[rgba(148,170,210,0.14)] rounded-xl overflow-hidden mb-3">
          <button
            type="button"
            onClick={() => setShowFalsePositives(!showFalsePositives)}
            className="w-full px-5 py-3.5 bg-[#070B14] hover:bg-[#0B1220] flex items-center justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#EAF0FA]">
                Remaining False Positives ({benchmarksData.false_positives.length} out of 512 negatives)
              </span>
              <span className="font-mono text-[10px] text-[#FF5A5F] px-2 py-0.5 rounded bg-[#FF5A5F]/10 border border-[#FF5A5F]/20">
                88.2% reduction from Phase 11
              </span>
            </div>
            <span className="font-mono text-xs text-[#FFB547]">
              {showFalsePositives ? 'Hide ▲' : 'Inspect ▼'}
            </span>
          </button>
          {showFalsePositives && (
            <div className="p-4 bg-[#070B14]/60 border-t border-[rgba(148,170,210,0.1)] overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-[rgba(148,170,210,0.15)] text-[#7A89A3] text-[10px] uppercase">
                    <th className="pb-2">Legitimate Package</th>
                    <th className="pb-2">Target Matched</th>
                    <th className="pb-2">Distance</th>
                    <th className="pb-2">Reasoning &amp; Registry Analysis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(148,170,210,0.08)]">
                  {benchmarksData.false_positives.map((fp, i) => (
                    <tr key={i} className="hover:bg-[#0B1220]/50">
                      <td className="py-2.5 font-bold text-[#EAF0FA]">{fp.package}</td>
                      <td className="py-2.5 text-[#4FE3C1]">{fp.target}</td>
                      <td className="py-2.5 text-[#FFB547]">{fp.distance}</td>
                      <td className="py-2.5 text-[#9AA7BD] text-[11px] leading-relaxed">{fp.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expandable Missed Attacks Accordion */}
        <div className="border border-[rgba(148,170,210,0.14)] rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMissedAttacks(!showMissedAttacks)}
            className="w-full px-5 py-3.5 bg-[#070B14] hover:bg-[#0B1220] flex items-center justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#EAF0FA]">
                Missed Attacks at Dist &le; 1 ({benchmarksData.missed_attacks.length} attacks analysis)
              </span>
              <span className="font-mono text-[10px] text-[#4FE3C1] px-2 py-0.5 rounded bg-[#4FE3C1]/10 border border-[#4FE3C1]/20">
                5 caught in Dist-2 review tier
              </span>
            </div>
            <span className="font-mono text-xs text-[#FFB547]">
              {showMissedAttacks ? 'Hide ▲' : 'Inspect ▼'}
            </span>
          </button>
          {showMissedAttacks && (
            <div className="p-4 bg-[#070B14]/60 border-t border-[rgba(148,170,210,0.1)] overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-[rgba(148,170,210,0.15)] text-[#7A89A3] text-[10px] uppercase">
                    <th className="pb-2">Missed Package</th>
                    <th className="pb-2">Intended Victim</th>
                    <th className="pb-2">Advisory Citation</th>
                    <th className="pb-2">Caught in Dist-2?</th>
                    <th className="pb-2">Reason for Miss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(148,170,210,0.08)]">
                  {benchmarksData.missed_attacks.map((ma, i) => (
                    <tr key={i} className="hover:bg-[#0B1220]/50">
                      <td className="py-2.5 font-bold text-[#FF5A5F]">{ma.package}</td>
                      <td className="py-2.5 text-[#4FE3C1]">{ma.target}</td>
                      <td className="py-2.5 text-[#9AA7BD] text-[11px]">{ma.advisory}</td>
                      <td className="py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          ma.caught_in_review ? 'bg-[#4FE3C1]/10 text-[#4FE3C1] border border-[#4FE3C1]/30' : 'bg-[#7A89A3]/10 text-[#7A89A3]'
                        }`}>
                          {ma.caught_in_review ? 'Yes (Review)' : 'No'}
                        </span>
                      </td>
                      <td className="py-2.5 text-[#9AA7BD] text-[11px] leading-relaxed">{ma.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Reachability Engine Benchmark Strip */}
      <div className="rounded-2xl border border-[rgba(148,170,210,0.2)] bg-[rgba(14,22,38,0.78)] backdrop-blur-xl p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-[rgba(148,170,210,0.12)]">
          <div>
            <span className="font-mono text-xs text-[#4FE3C1] uppercase tracking-wider font-semibold block mb-1">
              [AST CALL-GRAPH REACHABILITY BENCHMARK]
            </span>
            <h3 className="text-xl md:text-2xl font-semibold text-[#EAF0FA] font-sans m-0">
              Phase 12 Reachability Engine Benchmark (20 Micro-Projects)
            </h3>
          </div>
          <span className="font-mono text-xs text-[#4FE3C1] px-3 py-1 rounded-full bg-[#4FE3C1]/10 border border-[#4FE3C1]/30 self-start md:self-auto">
            False-Unreachable: 0 (Was 4)
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4">
          <div className="p-3 rounded-lg bg-[#070B14] border border-[rgba(148,170,210,0.12)]">
            <span className="font-mono text-[10px] text-[#7A89A3] uppercase block">Correct Reachable</span>
            <span className="font-serif text-2xl text-[#4FE3C1] font-bold" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
              12 / 14
            </span>
            <span className="font-mono text-[10px] text-[#9AA7BD] block">85.7% True Positive</span>
          </div>

          <div className="p-3 rounded-lg bg-[#070B14] border border-[rgba(148,170,210,0.12)]">
            <span className="font-mono text-[10px] text-[#7A89A3] uppercase block">Correct Unreachable</span>
            <span className="font-serif text-2xl text-[#4FE3C1] font-bold" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
              4 / 6
            </span>
            <span className="font-mono text-[10px] text-[#9AA7BD] block">66.7% True Negative</span>
          </div>

          <div className="p-3 rounded-lg bg-[#070B14] border border-[#4FE3C1]/30 bg-[#4FE3C1]/5">
            <span className="font-mono text-[10px] text-[#4FE3C1] uppercase block font-semibold">False Unreachable</span>
            <span className="font-serif text-2xl text-[#4FE3C1] font-bold" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
              0
            </span>
            <span className="font-mono text-[10px] text-[#9AA7BD] block">Down from 4 in Phase 11</span>
          </div>

          <div className="p-3 rounded-lg bg-[#070B14] border border-[rgba(148,170,210,0.12)]">
            <span className="font-mono text-[10px] text-[#7A89A3] uppercase block">Honest Unknown</span>
            <span className="font-serif text-2xl text-[#7AA2FF] font-bold" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
              4 / 20
            </span>
            <span className="font-mono text-[10px] text-[#9AA7BD] block">Dynamic eval / dead imports</span>
          </div>
        </div>

        <p className="text-xs font-sans text-[#9AA7BD] leading-relaxed m-0">
          Cross-module imports, Express middleware, and lifecycle hooks are analyzed before emitting reachability verdicts. Dynamic constructs (<code className="text-[#EAF0FA]">getattr</code>, <code className="text-[#EAF0FA]">eval</code>) trigger safe <code className="text-[#7AA2FF]">UNKNOWN</code> tags and are never downgraded.
        </p>
      </div>
    </section>
  );
}
