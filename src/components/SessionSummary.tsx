import type { AggregatedStats } from '../types';

interface SessionSummaryProps {
  stats: AggregatedStats;
}

export function SessionSummary({ stats }: SessionSummaryProps) {
  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (stats.totalSessions === 0) {
    return (
      <div
        style={{
          padding: 'clamp(0.75rem, 1.5vw, 1rem)',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          textAlign: 'center',
          fontFamily: 'Montserrat, sans-serif',
          color: '#9CA3AF',
          fontSize: 'clamp(0.75rem, 1.2vw, 0.875rem)',
        }}
      >
        No completed sessions yet today
      </div>
    );
  }

  const items = [
    { label: 'Participants', value: stats.totalSessions.toString() },
    { label: 'Avg Peak HR', value: stats.avgPeakHR.toString() },
    { label: 'Highest HR', value: stats.highestHR.toString() },
    { label: 'Avg Session', value: formatDuration(stats.avgSessionDuration) },
  ];

  return (
    <div
      style={{
        padding: 'clamp(0.75rem, 1.5vw, 1.25rem)',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      <div
        style={{
          fontSize: 'clamp(0.625rem, 1vw, 0.75rem)',
          fontWeight: 600,
          fontFamily: 'Quicksand, sans-serif',
          color: '#9CA3AF',
          marginBottom: '0.75rem',
        }}
      >
        Today's Sessions
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'clamp(0.5rem, 1vw, 1rem)',
        }}
      >
        {items.map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
                fontWeight: 700,
                fontFamily: 'Quicksand, sans-serif',
                color: '#FF4200',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: 'clamp(0.5rem, 0.8vw, 0.6875rem)',
                fontFamily: 'Montserrat, sans-serif',
                color: '#9CA3AF',
                marginTop: '0.125rem',
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
