import { getStressLevel, getStressColor, getStressLabel } from '../types';

interface StressGaugeProps {
  bpm: number;
  isActive: boolean;
}

export function StressGauge({ bpm, isActive }: StressGaugeProps) {
  const stressLevel = getStressLevel(bpm);
  const color = getStressColor(stressLevel);
  const label = getStressLabel(stressLevel);

  // Calculate fill percentage (45-200 BPM range)
  const fillPercent = isActive ? Math.min(100, Math.max(0, ((bpm - 45) / 155) * 100)) : 0;

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <span
          style={{
            fontSize: 'clamp(0.75rem, 1.2vw, 0.875rem)',
            fontWeight: 600,
            fontFamily: 'Quicksand, sans-serif',
            color: '#5C6371',
            letterSpacing: '0.1em',
          }}
        >
          STRESS LEVEL
        </span>
        <span
          style={{
            fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)',
            fontWeight: 700,
            fontFamily: 'Quicksand, sans-serif',
            color: isActive ? color : '#5C6371',
            transition: 'color 0.3s ease',
          }}
        >
          {isActive ? label : '--'}
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: '100%',
          height: '12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${fillPercent}%`,
            height: '100%',
            borderRadius: '6px',
            background: isActive
              ? `linear-gradient(90deg, #22C55E, #FF4200, #EF4444, #DC2626) ${fillPercent}% 0 / 400% 100%`
              : 'transparent',
            transition: 'width 0.3s ease',
            boxShadow: isActive ? `0 0 12px ${color}60` : 'none',
          }}
        />
      </div>

      {/* Zone labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.25rem',
          fontSize: '0.625rem',
          fontFamily: 'Rubik, sans-serif',
          color: '#5C637180',
        }}
      >
        <span>CALM</span>
        <span>MODERATE</span>
        <span>ELEVATED</span>
        <span>MAX</span>
      </div>
    </div>
  );
}
