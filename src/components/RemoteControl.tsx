import { useState, useEffect } from 'react';
import { sendCommand, sendDataSource, sendBpmNudge, onStatus, validatePin, setActivePin } from '../services/remoteSync';
import type { SessionState, ConnectionState, DataSource } from '../types';

const CACHE_KEY = 'remote_pin';

function getCachedPin(): string | null {
  return localStorage.getItem(CACHE_KEY);
}

function tryUnlock(pin: string): boolean {
  if (!validatePin(pin)) return false;
  localStorage.setItem(CACHE_KEY, pin);
  setActivePin(pin);
  return true;
}

export function RemoteControl() {
  const [unlocked, setUnlocked] = useState(() => {
    const cached = getCachedPin();
    if (cached && validatePin(cached)) {
      setActivePin(cached);
      return true;
    }
    return false;
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [bpm, setBpm] = useState(0);
  const [dataSource, setDataSource] = useState<DataSource>('dummy');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    const unsub = onStatus((liveBpm, liveState, liveDs, liveConn) => {
      setBpm(liveBpm);
      setSessionState(liveState as SessionState);
      setDataSource(liveDs as DataSource);
      setConnectionState(liveConn as ConnectionState);
    });
    return unsub;
  }, [unlocked]);

  const dispatch = (cmd: 'start' | 'end' | 'reset') => {
    setSending(true);
    sendCommand(cmd);
    setTimeout(() => setSending(false), 800);
  };

  const toggleDataSource = () => {
    const next: DataSource = dataSource === 'dummy' ? 'ble' : 'dummy';
    sendDataSource(next);
  };

  const btnBase: React.CSSProperties = {
    width: '100%',
    padding: '1.25rem',
    borderRadius: '12px',
    border: 'none',
    fontFamily: 'Quicksand, sans-serif',
    fontWeight: 700,
    fontSize: '1.125rem',
    cursor: sending ? 'not-allowed' : 'pointer',
    opacity: sending ? 0.6 : 1,
    transition: 'opacity 0.2s',
    color: '#ffffff',
  };

  // PIN gate
  if (!unlocked) {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (tryUnlock(pinInput.trim())) {
        setPinError(false);
        setUnlocked(true);
      } else {
        setPinError(true);
        setPinInput('');
      }
    };
    return (
      <div
        style={{
          width: '100vw', height: '100vh',
          backgroundColor: '#F9FAFB',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '1.25rem', padding: '2rem', boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: '2rem' }}>🔒</div>
        <div style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#FF4200' }}>
          Remote Control
        </div>
        <div style={{ fontFamily: 'Quicksand, sans-serif', fontSize: '0.875rem', color: '#5C6371' }}>
          Enter your access code
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '280px' }}>
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError(false); }}
            placeholder="Access code"
            autoFocus
            style={{
              width: '100%', padding: '0.875rem 1rem', borderRadius: '10px',
              border: `1.5px solid ${pinError ? '#CC3400' : '#D1D5DB'}`,
              fontFamily: 'Quicksand, sans-serif', fontWeight: 700,
              fontSize: '1.25rem', textAlign: 'center', letterSpacing: '0.25em',
              outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#374151',
            }}
          />
          {pinError && (
            <div style={{ fontFamily: 'Quicksand, sans-serif', fontSize: '0.8125rem', color: '#CC3400', textAlign: 'center' }}>
              Incorrect access code
            </div>
          )}
          <button
            type="submit"
            style={{
              width: '100%', padding: '0.875rem', borderRadius: '10px', border: 'none',
              background: '#FF4200', color: '#fff', fontFamily: 'Quicksand, sans-serif',
              fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
            }}
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  const connColor = connectionState === 'connected' ? '#05B9F0' : connectionState === 'connecting' ? '#FF4200' : '#5C6371';
  const connLabel = connectionState === 'connected' ? 'Connected' : connectionState === 'connecting' ? 'Connecting…' : 'Not connected';

  return (
    <div
      style={{
        width: '100vw', height: '100vh',
        backgroundColor: '#F9FAFB', color: '#374151',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '1.25rem', padding: '2rem', boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', fontFamily: 'Quicksand, sans-serif', fontWeight: 700, color: '#FF4200' }}>
          Remote Control
        </div>
        <div style={{ fontSize: '0.75rem', fontFamily: 'Quicksand, sans-serif', color: '#5C6371', marginTop: '0.2rem' }}>
          Quadient Stress Dashboard
        </div>
      </div>

      {/* Live BPM + nudge controls */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', fontFamily: 'Quicksand, sans-serif', fontWeight: 700, color: '#FF4200', lineHeight: 1 }}>
          {bpm > 0 ? bpm : '--'}
        </div>
        <div style={{ fontSize: '0.75rem', fontFamily: 'Quicksand, sans-serif', fontWeight: 600, color: '#5C6371', marginTop: '0.25rem' }}>
          LIVE BPM
        </div>
        {sessionState === 'active' && (
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button
              onClick={() => sendBpmNudge('down')}
              style={{
                width: '64px', height: '64px', borderRadius: '50%', border: 'none',
                background: '#1F2937', color: '#fff',
                fontSize: '1.75rem', fontFamily: 'Quicksand, sans-serif', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >−</button>
            <button
              onClick={() => sendBpmNudge('up')}
              style={{
                width: '64px', height: '64px', borderRadius: '50%', border: 'none',
                background: '#FF4200', color: '#fff',
                fontSize: '1.75rem', fontFamily: 'Quicksand, sans-serif', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >+</button>
          </div>
        )}
      </div>

      {/* Session status */}
      <div style={{
        padding: '0.375rem 1rem', borderRadius: '999px',
        background: sessionState === 'active' ? '#05B9F020' : sessionState === 'completed' ? '#FF420020' : 'rgba(255,255,255,0.05)',
        color: sessionState === 'active' ? '#05B9F0' : sessionState === 'completed' ? '#FF4200' : '#5C6371',
        fontSize: '0.75rem', fontFamily: 'Quicksand, sans-serif', fontWeight: 700,
      }}>
        {sessionState === 'active' ? '● Session Live' : sessionState === 'completed' ? '✓ Session Complete' : '○ Waiting'}
      </div>

      {/* Data source + connection */}
      <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '0.875rem 1rem' }}>
        <div style={{ fontSize: '0.625rem', fontFamily: 'Quicksand, sans-serif', fontWeight: 600, color: '#5C6371', marginBottom: '0.5rem' }}>
          Data Source
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem' }}>
          <button
            onClick={() => dataSource !== 'ble' && toggleDataSource()}
            disabled={sessionState === 'active'}
            style={{
              flex: 1, padding: '0.625rem', borderRadius: '8px', border: 'none',
              background: dataSource === 'ble' ? '#3860BE' : '#1F2937',
              opacity: dataSource === 'ble' ? 1 : 0.45,
              color: '#fff', fontFamily: 'Quicksand, sans-serif', fontWeight: 700,
              fontSize: '0.8125rem', cursor: sessionState === 'active' ? 'not-allowed' : 'pointer',
              outline: dataSource === 'ble' ? '1.5px solid #3860BE80' : 'none',
            }}
          >
            Polar Sensor
          </button>
          <button
            onClick={() => dataSource !== 'dummy' && toggleDataSource()}
            disabled={sessionState === 'active'}
            style={{
              flex: 1, padding: '0.625rem', borderRadius: '8px', border: 'none',
              background: dataSource === 'dummy' ? '#FF4200' : '#1F2937',
              opacity: dataSource === 'dummy' ? 1 : 0.45,
              color: '#fff', fontFamily: 'Quicksand, sans-serif', fontWeight: 700,
              fontSize: '0.8125rem', cursor: sessionState === 'active' ? 'not-allowed' : 'pointer',
              outline: dataSource === 'dummy' ? '1.5px solid #FF420080' : 'none',
            }}
          >
            Demo Mode
          </button>
        </div>
        {dataSource === 'ble' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: connColor, flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', fontFamily: 'Montserrat, sans-serif', color: connColor }}>
              {connLabel}
            </span>
            {connectionState !== 'connected' && (
              <span style={{ fontSize: '0.7rem', fontFamily: 'Montserrat, sans-serif', color: '#5C6371', marginLeft: '0.25rem' }}>
                — connect on the main screen
              </span>
            )}
          </div>
        )}
      </div>

      {/* Session controls */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {sessionState === 'idle' && (
          <button onClick={() => dispatch('start')} style={{ ...btnBase, background: '#05B9F0' }}>
            Start Session
          </button>
        )}
        {sessionState === 'active' && (
          <button onClick={() => dispatch('end')} style={{ ...btnBase, background: '#CC3400' }}>
            End Session
          </button>
        )}
        {sessionState === 'completed' && (
          <button onClick={() => dispatch('reset')} style={{ ...btnBase, background: '#FF4200' }}>
            Next Participant
          </button>
        )}
      </div>

      <div style={{ fontSize: '0.6875rem', fontFamily: 'Quicksand, sans-serif', color: '#5C637140', textAlign: 'center' }}>
        Controls synced live with the dashboard screen
      </div>
    </div>
  );
}
