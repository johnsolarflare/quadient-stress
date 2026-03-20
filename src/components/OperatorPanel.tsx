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
  sensitivityMultiplier: number;
  onSensitivityChange: (value: number) => void;
  baselineHR: number;
  baselineDetected: boolean;
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
  sensitivityMultiplier,
  onSensitivityChange,
  baselineHR,
  baselineDetected,
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
    background: disabled ? '#1F293780' : color,
    color: disabled ? '#5C637180' : '#ffffff',
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
          background: '#111827',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 999,
          padding: '1.5rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2
            style={{
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 700,
              fontSize: '1.125rem',
              color: '#ffffff',
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
              color: '#5C6371',
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
              letterSpacing: '0.1em',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            DATA SOURCE
          </label>
          <button onClick={onToggleDataSource} style={btnStyle(dataSource === 'ble' ? '#3860BE' : '#FF4200')}>
            {dataSource === 'ble' ? 'Polar Sensor (BLE)' : 'Demo Mode (Dummy Data)'}
          </button>
        </div>

        {/* Connection */}
        <div>
          <label
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: '#5C6371',
              letterSpacing: '0.1em',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            SENSOR CONNECTION
          </label>
          {connectionState === 'connected' ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                  fontSize: '0.8125rem',
                  fontFamily: 'Rubik, sans-serif',
                  color: '#22C55E',
                }}
              >
                <span>Connected</span>
                {batteryLevel !== null && <span>Battery: {batteryLevel}%</span>}
              </div>
              <button onClick={onDisconnect} style={btnStyle('#EF4444')}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              disabled={connectionState === 'connecting' || dataSource === 'dummy'}
              style={btnStyle('#22C55E', connectionState === 'connecting' || dataSource === 'dummy')}
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
              letterSpacing: '0.1em',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            SESSION
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sessionState === 'idle' && (
              <button onClick={onStartSession} style={btnStyle('#22C55E')}>
                Start New Session
              </button>
            )}
            {sessionState === 'active' && (
              <button onClick={onEndSession} style={btnStyle('#EF4444')}>
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

        {/* Visual Sensitivity */}
        <div>
          <label
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: '#5C6371',
              letterSpacing: '0.1em',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            VISUAL SENSITIVITY
          </label>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '8px',
              padding: '0.75rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.5rem',
                fontSize: '0.8125rem',
                fontFamily: 'Rubik, sans-serif',
                color: '#9CA3AF',
              }}
            >
              <span>Amplification</span>
              <span style={{ color: sensitivityMultiplier > 1 ? '#FF4200' : '#5C6371' }}>
                {sensitivityMultiplier.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={sensitivityMultiplier}
              onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
              style={{
                width: '100%',
                accentColor: '#FF4200',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.625rem',
                fontFamily: 'Rubik, sans-serif',
                color: '#5C637160',
                marginTop: '0.25rem',
              }}
            >
              <span>1x (Real)</span>
              <span>5x (Max)</span>
            </div>
            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                fontFamily: 'Rubik, sans-serif',
                color: baselineDetected ? '#22C55E' : '#5C637180',
              }}
            >
              Baseline: {baselineDetected ? `${baselineHR} BPM (auto)` : 'Detecting...'}
            </div>
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
              letterSpacing: '0.1em',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            TODAY'S STATS
          </label>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '8px',
              padding: '0.75rem',
              fontSize: '0.8125rem',
              fontFamily: 'Rubik, sans-serif',
              color: '#9CA3AF',
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
              <span style={{ color: '#EF4444' }}>{aggregatedStats.highestHR || '--'}</span>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
          <button onClick={handleExport} style={btnStyle('#1F2937')}>
            {exportStatus || 'Export Sessions (CSV)'}
          </button>
          <button onClick={handleClearData} style={btnStyle('#1F293780')}>
            Clear All Data
          </button>
        </div>

        {/* Keyboard shortcuts help */}
        <div
          style={{
            fontSize: '0.6875rem',
            fontFamily: 'Rubik, sans-serif',
            color: '#5C637160',
            lineHeight: 1.6,
          }}
        >
          <div><strong>Keyboard:</strong></div>
          <div>Enter — Toggle this panel</div>
          <div>1 — Start (Dummy Data)</div>
          <div>2 — Start (BLE Sensor)</div>
          <div>3 — End Session</div>
          <div>4 — Reset / Next</div>
        </div>
      </div>
    </>
  );
}
