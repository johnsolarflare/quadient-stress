interface StatsCardsProps {
  minHR: number;
  avgHR: number;
  maxHR: number;
  isActive: boolean;
}

export function StatsCards({ minHR, avgHR, maxHR, isActive }: StatsCardsProps) {
  const cards = [
    { label: 'MIN', value: minHR, color: '#22C55E' },
    { label: 'AVG', value: avgHR, color: '#FF4200' },
    { label: 'MAX', value: maxHR, color: '#EF4444' },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'clamp(0.5rem, 1vw, 1rem)',
      }}
    >
      {cards.map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            padding: 'clamp(0.75rem, 1.5vw, 1.25rem)',
            textAlign: 'center',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              fontSize: 'clamp(0.625rem, 1vw, 0.75rem)',
              fontWeight: 600,
              fontFamily: 'Quicksand, sans-serif',
              color: '#5C6371',
              letterSpacing: '0.15em',
              marginBottom: '0.25rem',
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
              fontWeight: 700,
              fontFamily: 'Quicksand, sans-serif',
              color: isActive && value > 0 ? color : '#5C637180',
              fontVariantNumeric: 'tabular-nums',
              transition: 'color 0.3s ease',
            }}
          >
            {isActive && value > 0 && value < Infinity ? value : '--'}
          </div>
        </div>
      ))}
    </div>
  );
}
