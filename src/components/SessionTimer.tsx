import { useState, useEffect } from 'react';

interface SessionTimerProps {
  startTime: number | null;
  isActive: boolean;
}

export function SessionTimer({ startTime, isActive }: SessionTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive || !startTime) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 200);

    return () => clearInterval(interval);
  }, [isActive, startTime]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      {/* Recording dot */}
      {isActive && (
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: '#CC3400',
            animation: 'blink 1s ease-in-out infinite',
          }}
        />
      )}
      <span
        style={{
          fontFamily: 'Quicksand, sans-serif',
          fontWeight: 600,
          fontSize: 'clamp(1rem, 2vw, 1.5rem)',
          color: isActive ? '#374151' : '#9CA3AF',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {isActive ? display : '--:--'}
      </span>
    </div>
  );
}
