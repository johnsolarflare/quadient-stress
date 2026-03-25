import { getHRZone, getZoneColor, getZoneLabel } from '../types';

interface BPMDisplayProps {
  bpm: number;
  visualBPM: number;
  isActive: boolean;
}

export function BPMDisplay({ bpm, visualBPM, isActive }: BPMDisplayProps) {
  const zone = getHRZone(visualBPM);
  const color = getZoneColor(zone);
  const label = getZoneLabel(zone);

  // SVG ring arc — fills proportionally through zones (zone 1 = 20%, zone 5 = 100%)
  const arcPercent = isActive && bpm > 0 ? (zone / 5) * 0.82 : 0; // 0.82 = 295deg of 360deg
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  const pulseDuration = visualBPM > 0 ? Math.max(0.4, 60 / visualBPM) : 1;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '0.75rem 0.5rem',
        gap: '0.5rem',
      }}
    >
      {/* Circular arc ring */}
      <div style={{ position: 'relative', width: '130px', height: '130px', flexShrink: 0 }}>
        <svg
          width="130"
          height="130"
          viewBox="0 0 130 130"
          style={{ position: 'absolute', inset: 0, transform: 'rotate(-148deg)' }}
        >
          {/* Track */}
          <circle
            cx="65" cy="65" r={radius}
            fill="none"
            stroke="rgba(55,65,81,0.12)"
            strokeWidth="8"
            strokeDasharray={`${circumference * 0.82} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Zone arc */}
          <circle
            cx="65" cy="65" r={radius}
            fill="none"
            stroke={isActive && bpm > 0 ? color : 'transparent'}
            strokeWidth="8"
            strokeDasharray={`${circumference * arcPercent} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease',
              filter: isActive && bpm > 0 ? `drop-shadow(0 0 6px ${color}80)` : 'none',
            }}
          />
        </svg>

        {/* Centre content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Pulse heart */}
          <div
            style={{
              fontSize: '0.875rem',
              color: isActive && bpm > 0 ? color : '#D1D5DB',
              animation: isActive && bpm > 0 ? `pulse ${pulseDuration}s ease-in-out infinite` : 'none',
              transition: 'color 0.3s ease',
              marginBottom: '0.125rem',
            }}
          >
            ♥
          </div>
          {/* BPM number — shows visualBPM so it matches the zone/ring */}
          <div
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              fontWeight: 700,
              fontFamily: 'Quicksand, sans-serif',
              color: isActive && bpm > 0 ? color : '#9CA3AF',
              lineHeight: 1,
              transition: 'color 0.3s ease',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isActive && bpm > 0 ? visualBPM : '--'}
          </div>
          <div
            style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              fontFamily: 'Quicksand, sans-serif',
              color: '#5C637180',
              marginTop: '0.125rem',
            }}
          >
            BPM
          </div>
        </div>
      </div>

      {/* Zone badge */}
      {isActive && bpm > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.125rem',
          }}
        >
          <div
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              background: `${color}20`,
              border: `1px solid ${color}50`,
              fontSize: '0.6875rem',
              fontWeight: 700,
              fontFamily: 'Quicksand, sans-serif',
              color,
              transition: 'all 0.3s ease',
            }}
          >
            Zone {zone}
          </div>
          <div
            style={{
              fontSize: '0.5625rem',
              fontFamily: 'Montserrat, sans-serif',
              color: '#5C637180',
            }}
          >
            {label}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            background: 'rgba(55,65,81,0.05)',
            border: '1px solid rgba(55,65,81,0.12)',
            fontSize: '0.6875rem',
            fontWeight: 600,
            fontFamily: 'Quicksand, sans-serif',
            color: '#5C637140',
          }}
        >
          Zone —
        </div>
      )}

      {/* Zone 1–5 mini pips */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {([1, 2, 3, 4, 5] as const).map((z) => (
          <div
            key={z}
            style={{
              width: z <= zone && isActive && bpm > 0 ? '20px' : '8px',
              height: '4px',
              borderRadius: '2px',
              background: z <= zone && isActive && bpm > 0 ? getZoneColor(z) : 'rgba(55,65,81,0.12)',
              transition: 'all 0.4s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
