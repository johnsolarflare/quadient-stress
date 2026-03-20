import { useEffect, useRef } from 'react';
import { getStressLevel, getStressColor } from '../types';

interface BPMDisplayProps {
  bpm: number;        // Raw BPM — shown as the number
  visualBPM: number;  // Amplified BPM — drives colors and pulse speed
  isActive: boolean;
}

export function BPMDisplay({ bpm, visualBPM, isActive }: BPMDisplayProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  const prevBPM = useRef(bpm);

  useEffect(() => {
    prevBPM.current = bpm;
  }, [bpm]);

  // Colors and pulse use visualBPM for dramatic effect
  const stressLevel = getStressLevel(visualBPM);
  const color = getStressColor(stressLevel);

  // Pulse animation speed based on visualBPM
  const pulseDuration = visualBPM > 0 ? 60 / visualBPM : 1;

  return (
    <div
      ref={displayRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        borderRadius: '16px',
        backgroundImage: `linear-gradient(135deg, ${color}15, ${color}08)`,
        border: `2px solid ${color}40`,
        transition: 'background-image 0.5s ease, border-color 0.5s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Pulse ring */}
      {isActive && bpm > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '16px',
            border: `2px solid ${color}`,
            animation: `pulse ${pulseDuration}s ease-in-out infinite`,
            opacity: 0.3,
          }}
        />
      )}

      {/* Heart icon */}
      <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem', opacity: 0.6 }}>
        {isActive ? '\u2665' : '\u2661'}
      </div>

      {/* BPM number */}
      <div
        style={{
          fontSize: 'clamp(3rem, 8vw, 6rem)',
          fontWeight: 700,
          fontFamily: 'Quicksand, sans-serif',
          color: isActive ? color : '#5C6371',
          lineHeight: 1,
          transition: 'color 0.3s ease',
        }}
      >
        {isActive ? bpm || '--' : '--'}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)',
          fontWeight: 600,
          fontFamily: 'Quicksand, sans-serif',
          color: '#5C6371',
          letterSpacing: '0.15em',
          marginTop: '0.25rem',
        }}
      >
        BPM
      </div>
    </div>
  );
}
