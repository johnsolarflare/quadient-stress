import { getHRZone, getZoneColor, getZoneLabel } from '../types';
import type { HRZone } from '../types';

interface StressGaugeProps {
  bpm: number;
  isActive: boolean;
  stableZone?: HRZone;
}

const ZONES = [1, 2, 3, 4, 5] as const;
const ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

export function StressGauge({ bpm, isActive, stableZone }: StressGaugeProps) {
  const zone = getHRZone(bpm);
  const displayZone = stableZone ?? zone;
  const color = getZoneColor(displayZone);
  const label = getZoneLabel(displayZone);

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
            fontSize: 'clamp(0.625rem, 1vw, 0.75rem)',
            fontWeight: 600,
            fontFamily: 'Quicksand, sans-serif',
            color: '#5C6371',
          }}
        >
          Hr Zone
        </span>
        <span
          style={{
            fontSize: 'clamp(0.75rem, 1.2vw, 0.875rem)',
            fontWeight: 700,
            fontFamily: 'Quicksand, sans-serif',
            color: isActive ? color : '#5C6371',
            transition: 'color 0.3s ease',
          }}
        >
          {isActive ? label : '--'}
        </span>
      </div>

      {/* 5-segment zone bar */}
      <div style={{ display: 'flex', gap: '3px', height: '10px' }}>
        {ZONES.map((z) => (
          <div
            key={z}
            style={{
              flex: 1,
              borderRadius: '3px',
              background: isActive && z <= displayZone
                ? getZoneColor(z)
                : 'rgba(255, 255, 255, 0.06)',
              boxShadow: isActive && z === displayZone
                ? `0 0 10px ${getZoneColor(z)}80`
                : 'none',
              transition: 'background 0.3s ease, box-shadow 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Zone labels */}
      <div
        style={{
          display: 'flex',
          gap: '3px',
          marginTop: '0.25rem',
        }}
      >
        {ZONES.map((z, i) => (
          <div
            key={z}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '0.5rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: isActive && z <= displayZone ? getZoneColor(z) : '#5C637150',
              letterSpacing: '0.05em',
              transition: 'color 0.3s ease',
            }}
          >
            {ZONE_LABELS[i]}
          </div>
        ))}
      </div>
    </div>
  );
}
