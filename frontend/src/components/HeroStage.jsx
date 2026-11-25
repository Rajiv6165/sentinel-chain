import Nav from './Nav';
import HeroChain from './HeroChain';
import Headline from './Headline';
import ConsoleCard from './ConsoleCard';
import ProofStrip from './ProofStrip';

export default function HeroStage({ apiConfig, onFileSelected, onTrySample }) {
  return (
    <section className="stage relative overflow-hidden select-none" aria-label="Sentinel-Chain Hero">
      {/* Background ambient lighting */}
      <div className="hero-ambient-bg" />
      <div className="hero-dot-grid" />

      {/* Coordinate Frame: 1440 x 900 base */}
      <div className="frame">
        {/* Navigation */}
        <Nav />

        {/* Hero Dependency Chain (inline SVG + caption) */}
        <HeroChain />

        {/* Headline Block: Eyebrow + H1 + Subcopy */}
        <Headline />

        {/* Scan Console Card */}
        <ConsoleCard
          apiConfig={apiConfig}
          onFileSelected={onFileSelected}
          onTrySample={onTrySample}
        />

        {/* Proof Strip */}
        <ProofStrip />
      </div>
    </section>
  );
}
