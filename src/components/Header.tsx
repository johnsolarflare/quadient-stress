import type { ConnectionState } from '../types';

interface HeaderProps {
  connectionState: ConnectionState;
  batteryLevel: number | null;
  onLogoDoubleClick?: () => void;
  onLogoClick?: () => void;
  isMobile?: boolean;
}

export function Header({ connectionState, batteryLevel, onLogoDoubleClick, onLogoClick, isMobile }: HeaderProps) {
  const statusColors: Record<ConnectionState, string> = {
    connected: '#22C55E',
    connecting: '#FF4200',
    reconnecting: '#EF4444',
    disconnected: '#5C6371',
  };

  const statusLabels: Record<ConnectionState, string> = {
    connected: 'CONNECTED',
    connecting: 'CONNECTING...',
    reconnecting: 'RECONNECTING...',
    disconnected: 'DISCONNECTED',
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2vw, 2rem)',
      }}
    >
      {/* Logo — double-click (desktop) or tap (mobile) to open operator panel */}
      <div
        onDoubleClick={onLogoDoubleClick}
        onClick={onLogoClick}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', cursor: 'default', userSelect: 'none' }}
      >
        <svg width="140" height="32" viewBox="0 0 140 32" fill="none">
          <text
            x="0"
            y="26"
            fontFamily="Quicksand, sans-serif"
            fontSize="26"
            fontWeight="700"
            fill="white"
          >
            quad
            <tspan fill="#FF4200">i</tspan>
            ent
          </text>
        </svg>
        {/* On mobile: subtitle under logo */}
        {isMobile && (
          <span style={{
            fontSize: '0.6rem',
            fontFamily: 'Quicksand, sans-serif',
            fontWeight: 600,
            color: '#5C6371',
            letterSpacing: '0.2em',
          }}>
            STRESS TEST
          </span>
        )}
      </div>

      {/* Title — desktop centre */}
      {!isMobile && (
        <div
          style={{
            fontSize: 'clamp(0.875rem, 1.5vw, 1.25rem)',
            fontWeight: 700,
            fontFamily: 'Quicksand, sans-serif',
            color: '#ffffff',
            letterSpacing: '0.2em',
          }}
        >
          STRESS TEST
        </div>
      )}

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {batteryLevel !== null && connectionState === 'connected' && (
          <span
            style={{
              fontSize: '0.75rem',
              fontFamily: 'Rubik, sans-serif',
              color: batteryLevel < 20 ? '#EF4444' : '#5C6371',
            }}
          >
            {batteryLevel}%
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColors[connectionState],
              boxShadow: connectionState === 'connected'
                ? `0 0 8px ${statusColors[connectionState]}`
                : 'none',
              animation: connectionState === 'connecting' || connectionState === 'reconnecting'
                ? 'blink 1s ease-in-out infinite'
                : 'none',
            }}
          />
          <span
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: statusColors[connectionState],
              letterSpacing: '0.1em',
            }}
          >
            {statusLabels[connectionState]}
          </span>
        </div>
      </div>
    </header>
  );
}
