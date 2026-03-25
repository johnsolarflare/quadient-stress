import type { ConnectionState } from '../types';

interface HeaderProps {
  connectionState: ConnectionState;
  batteryLevel: number | null;
  dataSource?: 'ble' | 'dummy';
  onLogoDoubleClick?: () => void;
  onLogoClick?: () => void;
  isMobile?: boolean;
}

export function Header({ connectionState, batteryLevel, dataSource, onLogoDoubleClick, onLogoClick, isMobile }: HeaderProps) {
  const isDemo = dataSource === 'dummy' || dataSource === undefined;

  const statusColors: Record<ConnectionState, string> = {
    connected: '#05B9F0',
    connecting: '#FF4200',
    reconnecting: '#CC3400',
    disconnected: '#9CA3AF',
  };

  const statusLabels: Record<ConnectionState, string> = {
    connected: isDemo ? 'Demo' : 'Connected',
    connecting: 'Connecting...',
    reconnecting: 'Reconnecting...',
    disconnected: isDemo ? 'Demo' : 'Disconnected',
  };

  return (
    <header
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: 'clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2vw, 2rem)',
        borderBottom: '1px solid rgba(55,65,81,0.08)',
        background: '#ffffff',
      }}
    >
      {/* Logo — colour version for light background */}
      <div
        onDoubleClick={onLogoDoubleClick}
        onClick={onLogoClick}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', cursor: 'default', userSelect: 'none' }}
      >
        <img
          src="/quadient-logo.png"
          alt="Quadient"
          height="32"
          style={{ display: 'block' }}
        />
        {isMobile && (
          <span style={{
            fontSize: '0.6rem',
            fontFamily: 'Quicksand, sans-serif',
            fontWeight: 600,
            color: '#9CA3AF',
          }}>
            Stress Test
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
            color: '#374151',
          }}
        >
          Stress Test
        </div>
      )}

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end' }}>
        {batteryLevel !== null && connectionState === 'connected' && !isDemo && (
          <span
            style={{
              fontSize: '0.75rem',
              fontFamily: 'Montserrat, sans-serif',
              color: batteryLevel < 20 ? '#CC3400' : '#9CA3AF',
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
            }}
          >
            {statusLabels[connectionState]}
          </span>
        </div>
      </div>
    </header>
  );
}
