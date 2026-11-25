import { useEffect, useState } from 'react';

export default function HeroChain() {
  const [viewBox, setViewBox] = useState('0 0 1440 200');

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w <= 599 || (h <= 599 && w <= 1180)) {
        // Compact: 5 nodes (3 to 7)
        setViewBox('390 0 660 200');
      } else if (w >= 600 && w <= 1180 && h >= 600) {
        // Tablet: 7 nodes (2 to 8)
        setViewBox('300 0 840 200');
      } else {
        // Desktop: full chain
        setViewBox('0 0 1440 200');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const nodes = [
    {
      id: 1,
      x: 150,
      name: 'express',
      verdict: 'SAFE',
      type: 'safe',
      strokeColor: '#4FE3C1',
      chipBg: 'rgba(79, 227, 193, 0.12)',
      chipText: '#4FE3C1',
      icon: (
        // Check icon
        <path d="M144 100l4 4 8-8" stroke="#4FE3C1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ),
      chipIcon: '✓ '
    },
    {
      id: 2,
      x: 292.5,
      name: 'lodash',
      verdict: 'NO PATH',
      type: 'safe-dim',
      strokeColor: 'rgba(79, 227, 193, 0.45)',
      chipBg: 'rgba(79, 227, 193, 0.08)',
      chipText: 'rgba(79, 227, 193, 0.75)',
      icon: (
        // Slash/dim path
        <path d="M286 106l13-12" stroke="rgba(79, 227, 193, 0.6)" strokeWidth="1.5" strokeLinecap="round" />
      ),
      chipIcon: '∅ '
    },
    {
      id: 3,
      x: 435,
      name: 'react',
      verdict: 'SAFE',
      type: 'safe',
      strokeColor: '#4FE3C1',
      chipBg: 'rgba(79, 227, 193, 0.12)',
      chipText: '#4FE3C1',
      icon: (
        <circle cx="435" cy="100" r="4.5" fill="none" stroke="#4FE3C1" strokeWidth="1.6" />
      ),
      chipIcon: '✓ '
    },
    {
      id: 4,
      x: 577.5,
      name: 'axios',
      verdict: 'NO PATH',
      type: 'safe-dim',
      strokeColor: 'rgba(79, 227, 193, 0.45)',
      chipBg: 'rgba(79, 227, 193, 0.08)',
      chipText: 'rgba(79, 227, 193, 0.75)',
      icon: (
        <path d="M571 106l13-12" stroke="rgba(79, 227, 193, 0.6)" strokeWidth="1.5" strokeLinecap="round" />
      ),
      chipIcon: '∅ '
    },
    {
      id: 5,
      x: 720,
      name: 'jsonwebtoken',
      verdict: 'REACHABLE',
      type: 'danger',
      strokeColor: '#FF5A5F',
      chipBg: 'rgba(255, 90, 95, 0.16)',
      chipText: '#FF5A5F',
      icon: (
        <path d="M714 96l6 8 6-8" stroke="#FF5A5F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ),
      chipIcon: '⚠ '
    },
    {
      id: 6,
      x: 862.5,
      name: 'lodsh',
      verdict: 'TYPOSQUAT ≈ lodash',
      type: 'accent',
      strokeColor: '#FFB547',
      chipBg: 'rgba(255, 181, 71, 0.14)',
      chipText: '#FFB547',
      icon: (
        <path d="M862.5 93v8m0 4v1" stroke="#FFB547" strokeWidth="2" strokeLinecap="round" />
      ),
      chipIcon: '≈ '
    },
    {
      id: 7,
      x: 1005,
      name: 'moment',
      verdict: 'SAFE',
      type: 'safe',
      strokeColor: '#4FE3C1',
      chipBg: 'rgba(79, 227, 193, 0.12)',
      chipText: '#4FE3C1',
      icon: (
        <circle cx="1005" cy="100" r="4.5" fill="none" stroke="#4FE3C1" strokeWidth="1.6" />
      ),
      chipIcon: '✓ '
    },
    {
      id: 8,
      x: 1147.5,
      name: 'flask',
      verdict: 'SAFE',
      type: 'safe',
      strokeColor: '#4FE3C1',
      chipBg: 'rgba(79, 227, 193, 0.12)',
      chipText: '#4FE3C1',
      icon: (
        <path d="M1143.5 94h8m-5 0v3l-4 7h10l-4-7v-3" fill="none" stroke="#4FE3C1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ),
      chipIcon: '✓ '
    },
    {
      id: 9,
      x: 1290,
      name: 'pyyaml',
      verdict: 'UNKNOWN',
      type: 'unknown',
      strokeColor: '#7A89A3',
      chipBg: 'rgba(122, 137, 163, 0.12)',
      chipText: '#9AA7BD',
      icon: (
        <circle cx="1290" cy="100" r="4" fill="none" stroke="#7A89A3" strokeWidth="1.5" strokeDasharray="2 2" />
      ),
      chipIcon: '? '
    }
  ];

  return (
    <>
      {/* Hero Chain SVG Container */}
      <div className="coord-chain pointer-events-none select-none z-10">
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full overflow-visible"
        >
          <defs>
            {/* Beam Glow Filter */}
            <filter id="beam-glow" x="-50%" y="0%" width="200%" height="100%">
              <feGaussianBlur stdDeviation="6" result="blur1" />
              <feGaussianBlur stdDeviation="14" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Danger node pulsing radial gradient */}
            <radialGradient id="danger-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FF5A5F" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#FF5A5F" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 1. Main Connecting Chain Line: x=96 -> 1344, y=100 */}
          <line
            x1="96"
            y1="100"
            x2="1344"
            y2="100"
            stroke="rgba(148, 170, 210, 0.28)"
            strokeWidth="1.5"
            className="anim-chain-line"
          />

          {/* 2. Call Path Dropping from jsonwebtoken (Node 5 at x=720) */}
          <g style={{ animation: 'fadeIn 0.6s ease 2.1s both' }}>
            {/* Dashed call path from (720, 160) to (720, 190) */}
            <line
              x1="720"
              y1="160"
              x2="720"
              y2="190"
              stroke="#FF5A5F"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              style={{
                strokeDasharray: '30',
                strokeDashoffset: '30',
                animation: 'callPathDraw 0.6s ease 2.0s forwards'
              }}
            />
            {/* Two dots along the path */}
            <circle cx="720" cy="162" r="2.5" fill="#FF5A5F" />
            <circle cx="720" cy="190" r="3" fill="#FF5A5F" />
            {/* Mono label at (736, 186): "app.get('/login') -> verify()" */}
            <text
              x="732"
              y="186"
              fill="#FF5A5F"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10"
              fontWeight="500"
              letterSpacing="0.02em"
            >
              app.get(&apos;/login&apos;) -&gt; verify()
            </text>
          </g>

          {/* 3. 9 Dependency Nodes and Verdict Chips */}
          {nodes.map((node, i) => {
            const verdictDelay = (0.9 + (node.x / 1440) * 2.2).toFixed(2);
            const popDelay = (0.2 + i * 0.06).toFixed(2);
            const chipWidth = node.verdict.length > 10 ? 144 : 76;
            const isDanger = node.id === 5;

            return (
              <g key={node.id} className="pointer-events-auto">
                {/* A. Verdict Chip (y=44 centered, height=22, radius=6) */}
                <g
                  style={{
                    animation: `chipSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${verdictDelay}s both`
                  }}
                >
                  <rect
                    x={node.x - chipWidth / 2}
                    y={33}
                    width={chipWidth}
                    height={22}
                    rx="6"
                    fill={node.chipBg}
                    stroke={node.strokeColor}
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                  <text
                    x={node.x}
                    y={48}
                    textAnchor="middle"
                    fill={node.chipText}
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize="9.5"
                    fontWeight="500"
                    letterSpacing="0.08em"
                    className="uppercase select-none"
                  >
                    {node.chipIcon}{node.verdict}
                  </text>
                </g>

                {/* B. Node Rounded Square (44x44, rx=12, centered at (node.x, 100)) */}
                <g
                  style={{
                    transformOrigin: `${node.x}px 100px`,
                    animation: `nodePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${popDelay}s both`
                  }}
                >
                  {/* Danger pulse ring on jsonwebtoken */}
                  {isDanger && (
                    <rect
                      x={node.x - 26}
                      y={74}
                      width="52"
                      height="52"
                      rx="16"
                      fill="url(#danger-glow)"
                      className="animate-pulse"
                      style={{
                        animation: 'dangerPulse 2.4s ease-in-out infinite 2.2s'
                      }}
                    />
                  )}

                  {/* Main Node Background */}
                  <rect
                    x={node.x - 22}
                    y={78}
                    width="44"
                    height="44"
                    rx="12"
                    fill="#0B1220"
                    stroke={node.type === 'unknown' ? 'rgba(148, 170, 210, 0.28)' : node.strokeColor}
                    strokeWidth="1.5"
                    strokeDasharray={node.type === 'unknown' ? '4 3' : 'none'}
                    style={{
                      transition: 'stroke 0.4s ease',
                      filter: isDanger ? 'drop-shadow(0 0 10px rgba(255, 90, 95, 0.35))' : 'none'
                    }}
                  />

                  {/* Inner Glyph */}
                  {node.icon}
                </g>

                {/* C. Node Label (mono 11u, --muted) at y=148 */}
                <text
                  x={node.x}
                  y={148}
                  textAnchor="middle"
                  fill="#9AA7BD"
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize="11"
                  fontWeight="500"
                  className="select-none tracking-tight"
                  style={{
                    animation: `fadeIn 0.5s ease ${popDelay}s both`
                  }}
                >
                  {node.name}
                </text>
              </g>
            );
          })}

          {/* 4. Scan Beam: 2u wide vertical line sweeping across SVG x=0 -> 1440 over 2.2s */}
          <g className="anim-scan-beam pointer-events-none">
            {/* Glow Aura */}
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="200"
              stroke="#7AA2FF"
              strokeWidth="6"
              strokeOpacity="0.6"
              filter="url(#beam-glow)"
            />
            {/* Core 2u Bright Line */}
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="200"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeOpacity="0.95"
            />
          </g>
        </svg>
      </div>

      {/* Tiny Caption centered at frame y=304u */}
      <div className="coord-chain-caption pointer-events-none select-none z-10">
        <span className="font-mono text-[calc(9.5*var(--u))] text-[#7A89A3] uppercase tracking-[0.12em] opacity-80">
          ILLUSTRATION · SAMPLE DEPENDENCY CHAIN, NOT A REAL SCAN
        </span>
      </div>
    </>
  );
}
