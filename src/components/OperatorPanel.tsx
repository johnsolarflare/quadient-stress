import { useState, useEffect } from 'react';
import type { ConnectionState, SessionState, DataSource, AggregatedStats } from '../types';
import { exportSessionsCSV, clearAllSessions } from '../services/db';

interface OperatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  connectionState: ConnectionState;
  sessionState: SessionState;
  dataSource: DataSource;
  batteryLevel: number | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onStartSession: () => void;
  onEndSession: () => void;
  onResetSession: () => void;
  onToggleDataSource: () => void;
  aggregatedStats: AggregatedStats;
  onStatsRefresh: () => void;
  bleError?: string | null;
  onClearBleError?: () => void;
}

export function OperatorPanel({
  isOpen,
  onClose,
  connectionState,
  sessionState,
  dataSource,
  batteryLevel,
  onConnect,
  onDisconnect,
  onStartSession,
  onEndSession,
  onResetSession,
  onToggleDataSource,
  aggregatedStats,
  onStatsRefresh,
  bleError,
  onClearBleError,
}: OperatorPanelProps) {
  const [exportStatus, setExportStatus] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleExport = async () => {
    try {
      const csv = await exportSessionsCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quadient-stress-sessions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus('Exported!');
      setTimeout(() => setExportStatus(''), 2000);
    } catch {
      setExportStatus('Export failed');
    }
  };

  const handleClearData = async () => {
    if (window.confirm('Clear all session data? This cannot be undone.')) {
      await clearAllSessions();
      onStatsRefresh();
    }
  };

  if (!isOpen) return null;

  const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
    padding: '0.625rem 1rem',
    borderRadius: '8px',
    border: 'none',
    background: disabled ? '#F3F4F6' : color,
    color: disabled ? '#9CA3AF' : '#ffffff',
    fontFamily: 'Quicksand, sans-serif',
    fontWeight: 700,
    fontSize: '0.8125rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: '100%',
    transition: 'opacity 0.2s',
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 998,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '320px',
          background: '#ffffff',
          borderLeft: '1px solid rgba(55,65,81,0.12)',
          zIndex: 999,
          padding: '1.5rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          animation: 'slideInRight 0.3s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2
            style={{
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 700,
              fontSize: '1.125rem',
              color: '#374151',
              margin: 0,
            }}
          >
            Operator Controls
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#9CA3AF',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Data Source Toggle */}
        <div>
          <label
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: '#5C6371',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            Data Source
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => dataSource !== 'ble' && sessionState === 'idle' && onToggleDataSource()}
              style={{
                ...btnStyle(dataSource === 'ble' ? '#3860BE' : '#374151'),
                flex: 1,
                opacity: dataSource === 'ble' ? 1 : 0.45,
                outline: dataSource === 'ble' ? '1.5px solid #3860BE80' : 'none',
              }}
            >
              Polar Sensor
            </button>
            <button
              onClick={() => dataSource !== 'dummy' && sessionState === 'idle' && onToggleDataSource()}
              style={{
                ...btnStyle(dataSource === 'dummy' ? '#FF4200' : '#374151'),
                flex: 1,
                opacity: dataSource === 'dummy' ? 1 : 0.45,
                outline: dataSource === 'dummy' ? '1.5px solid #FF420080' : 'none',
              }}
            >
              Demo Mode
            </button>
          </div>
        </div>

        {/* Connection */}
        <div>
          <label
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: '#5C6371',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            Sensor Connection
          </label>
          {bleError && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '0.625rem 0.75rem',
                marginBottom: '0.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <span style={{ fontSize: '0.75rem', fontFamily: 'Montserrat, sans-serif', color: '#FCA5A5', lineHeight: 1.4 }}>
                {bleError}
              </span>
              <button
                onClick={onClearBleError}
                style={{ background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer', fontSize: '1rem', padding: 0, flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          )}
          {connectionState === 'connected' ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                  fontSize: '0.8125rem',
                  fontFamily: 'Montserrat, sans-serif',
                  color: '#05B9F0',
                }}
              >
                <span>Connected</span>
                {batteryLevel !== null && <span>Battery: {batteryLevel}%</span>}
              </div>
              <button onClick={onDisconnect} style={btnStyle('#CC3400')}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              disabled={connectionState === 'connecting' || dataSource === 'dummy'}
              style={btnStyle('#05B9F0', connectionState === 'connecting' || dataSource === 'dummy')}
            >
              {connectionState === 'connecting' ? 'Connecting...' : 'Connect Sensor'}
            </button>
          )}
        </div>

        {/* Session Controls */}
        <div>
          <label
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: '#5C6371',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            Session
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sessionState === 'idle' && (
              <button onClick={onStartSession} style={btnStyle('#05B9F0')}>
                Start New Session
              </button>
            )}
            {sessionState === 'active' && (
              <button onClick={onEndSession} style={btnStyle('#CC3400')}>
                End Session
              </button>
            )}
            {sessionState === 'completed' && (
              <button onClick={onResetSession} style={btnStyle('#FF4200')}>
                Ready for Next Participant
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div>
          <label
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: '#5C6371',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            Today's Stats
          </label>
          <div
            style={{
              background: '#F9FAFB',
              borderRadius: '8px',
              padding: '0.75rem',
              fontSize: '0.8125rem',
              fontFamily: 'Montserrat, sans-serif',
              color: '#5C6371',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Sessions:</span>
              <span style={{ color: '#FF4200' }}>{aggregatedStats.totalSessions}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Avg Peak HR:</span>
              <span style={{ color: '#FF4200' }}>{aggregatedStats.avgPeakHR || '--'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Highest HR:</span>
              <span style={{ color: '#CC3400' }}>{aggregatedStats.highestHR || '--'}</span>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
          <button onClick={handleExport} style={btnStyle('#374151')}>
            {exportStatus || 'Export Sessions (CSV)'}
          </button>
          <button onClick={handleClearData} style={btnStyle('#1F293780')}>
            Clear All Data
          </button>
        </div>

      </div>
    </>
  );
}
