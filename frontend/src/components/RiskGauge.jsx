/**
 * RiskGauge renders a calibrated arc gauge indicating threat severity.
 */
export default function RiskGauge({ score = 0, level = 'LOW', size = 120 }) {
  // Normalize score between 0 and 100
  const normalizedScore = Math.min(100, Math.max(0, score));

  // Determine color from level or score
  let strokeColor = '#4FE3C1'; // safe
  let levelLabel = level || 'SAFE';

  const lvl = (level || '').toUpperCase();
  if (lvl === 'CRITICAL' || normalizedScore >= 75) {
    strokeColor = '#FF5A5F'; // danger
    levelLabel = 'CRITICAL';
  } else if (lvl === 'HIGH' || normalizedScore >= 50) {
    strokeColor = '#FF5A5F';
    levelLabel = 'HIGH';
  } else if (lvl === 'MEDIUM' || normalizedScore >= 25) {
    strokeColor = '#FFB547'; // accent
    levelLabel = 'MEDIUM';
  } else if (lvl === 'LOW') {
    strokeColor = '#4FE3C1';
    levelLabel = 'LOW';
  } else {
    strokeColor = '#4FE3C1';
    levelLabel = 'SAFE';
  }

  // Semi-circle arc: radius 40, circumference ~ 125.6
  const radius = 40;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center select-none" style={{ width: size }}>
      <svg width={size} height={size * 0.65} viewBox="0 0 100 65" className="overflow-visible">
        {/* Background Track Arc */}
        <path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke="rgba(148, 170, 210, 0.15)"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Foreground Value Arc */}
        <path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s ease'
          }}
        />

        {/* Center Text Score */}
        <text
          x="50"
          y="48"
          textAnchor="middle"
          fill="#EAF0FA"
          fontFamily="'JetBrains Mono', monospace"
          fontSize="16"
          fontWeight="bold"
        >
          {normalizedScore}
        </text>
      </svg>

      <span
        className="font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded -mt-1"
        style={{
          color: strokeColor,
          backgroundColor: `${strokeColor}1A`,
          border: `1px solid ${strokeColor}40`
        }}
      >
        {levelLabel}
      </span>
    </div>
  );
}
