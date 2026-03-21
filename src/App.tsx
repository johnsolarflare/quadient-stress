import { useState, useEffect, useRef, useCallback } from 'react';
import { getHRZone, getZoneColor, computeVisualBPM } from './types';
import type { ConnectionState, SessionState, DataSource, HRReading, AggregatedStats, SessionData, HRZone } from './types';
import { BLEService } from './services/ble';
import { DummyDataService } from './services/dummyData';
import { SessionManager } from './services/sessionManager';
import { getAggregatedStats } from './services/db';
import { Header } from './components/Header';
import { Waveform } from './components/Waveform';
import { BPMDisplay } from './components/BPMDisplay';
import { StressGauge } from './components/StressGauge';
import { SessionTimer } from './components/SessionTimer';
import { StatsCards } from './components/StatsCards';
import { SessionSummary } from './components/SessionSummary';
import { OperatorPanel } from './components/OperatorPanel';

export default function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [dataSource, setDataSource] = useState<DataSource>('dummy');
  const [currentBPM, setCurrentBPM] = useState(0);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionData | null>(null);
  const [aggregatedStats, setAggregatedStats] = useState<AggregatedStats>({
    totalSessions: 0, avgPeakHR: 0, avgAvgHR: 0, highestHR: 0, avgSessionDuration: 0,
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Visual sensitivity & operator override
  const [sensitivityMultiplier, setSensitivityMultiplier] = useState(1.0);
  const [baselineHR, setBaselineHR] = useState(70);
  const [baselineDetected, setBaselineDetected] = useState(false);
  const baselineReadings = useRef<number[]>([]);
  const [bpmOffset, setBpmOffset] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  const bleService = useRef(new BLEService());
  const dummyService = useRef(new DummyDataService());
  const sessionManager = useRef(new SessionManager());

  const refreshStats = useCallback(async () => {
    const stats = await getAggregatedStats();
    setAggregatedStats(stats);
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Keyboard shortcut for operator panel (Enter key)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        setPanelOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Secret operator override keys (W/S) for BPM offset
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (sessionState !== 'active') return;

      switch (e.key) {
        case 'w':
        case 'W':
          e.preventDefault();
          setBpmOffset((prev) => Math.min(prev + 15, 120));
          break;
        case 's':
        case 'S':
          e.preventDefault();
          setBpmOffset((prev) => Math.max(prev - 15, -40));
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessionState]);

  // Offset holds until operator manually adjusts — no auto-decay

  useEffect(() => {
    sessionManager.current.onStateChange = (state) => setSessionState(state);
    sessionManager.current.onStatsUpdate = (session) => setSessionStats(session);
  }, []);

  const handleReading = useCallback((reading: HRReading) => {
    setCurrentBPM(reading.bpm);
    sessionManager.current.addReading(reading);

    // Baseline detection: collect first 10 seconds of readings (uses ref to avoid stale closure)
    if (!baselineDetected && startTimeRef.current) {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      if (elapsed <= 10) {
        baselineReadings.current.push(reading.bpm);
      } else if (baselineReadings.current.length > 0) {
        const sum = baselineReadings.current.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / baselineReadings.current.length);
        setBaselineHR(avg);
        setBaselineDetected(true);
      }
    }
  }, [baselineDetected]);

  const handleConnect = async () => {
    if (dataSource === 'ble') {
      try {
        bleService.current.onReading = handleReading;
        bleService.current.onConnectionChange = setConnectionState;
        bleService.current.onBatteryUpdate = setBatteryLevel;
        await bleService.current.requestDevice();
      } catch (err) {
        console.error('BLE connection failed:', err);
      }
    } else {
      dummyService.current.onReading = handleReading;
      dummyService.current.onConnectionChange = setConnectionState;
      dummyService.current.onBatteryUpdate = setBatteryLevel;
      dummyService.current.start();
    }
  };

  const handleDisconnect = () => {
    if (dataSource === 'ble') {
      bleService.current.disconnect();
    } else {
      dummyService.current.stop();
    }
    setConnectionState('disconnected');
    setCurrentBPM(0);
    setBatteryLevel(null);
  };

  const handleStartSession = () => {
    if (dataSource === 'dummy') {
      // Always (re)start the dummy service — it's idempotent
      dummyService.current.onReading = handleReading;
      dummyService.current.onConnectionChange = setConnectionState;
      dummyService.current.onBatteryUpdate = setBatteryLevel;
      dummyService.current.start();
    }
    sessionManager.current.startSession();
    setSessionState('active');
    const now = Date.now();
    setStartTime(now);
    startTimeRef.current = now;
  };

  const handleEndSession = async () => {
    await sessionManager.current.endSession();
    if (dataSource === 'dummy') {
      dummyService.current.stop();
    }
    setSessionState('completed');
    setBpmOffset(0);
    await refreshStats();
  };

  const handleResetSession = () => {
    sessionManager.current.reset();
    setSessionState('idle');
    setCurrentBPM(0);
    setSessionStats(null);
    setStartTime(null);
    startTimeRef.current = null;
    setBpmOffset(0);
    setBaselineDetected(false);
    baselineReadings.current = [];
  };

  const handleToggleDataSource = () => {
    handleDisconnect();
    setDataSource((d) => (d === 'ble' ? 'dummy' : 'ble'));
  };

  // Numbered quick-keys for session control (work without opening the panel)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case '1':
          if (sessionState === 'idle') {
            e.preventDefault();
            setDataSource('dummy');
            handleStartSession();
          }
          break;
        case '2':
          if (sessionState === 'idle') {
            e.preventDefault();
            setDataSource('ble');
            bleService.current.onReading = handleReading;
            bleService.current.onConnectionChange = setConnectionState;
            bleService.current.onBatteryUpdate = setBatteryLevel;
            bleService.current.requestDevice().then(() => {
              handleStartSession();
            }).catch((err) => {
              console.error('BLE connection failed:', err);
            });
          }
          break;
        case '3':
          if (sessionState === 'active') {
            e.preventDefault();
            handleEndSession();
          }
          break;
        case '4':
          if (sessionState === 'completed') {
            e.preventDefault();
            handleResetSession();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessionState, handleReading]);

  // Compute visual BPM (amplified + operator offset) for all stress visuals
  const visualBPM = computeVisualBPM(currentBPM, baselineHR, sensitivityMultiplier, bpmOffset);
  const zone: HRZone = getHRZone(visualBPM);
  const stressColor = getZoneColor(zone);
  const isActive = sessionState === 'active';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0a0a0f',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {isActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(ellipse at 50% 30%, ${stressColor}08, transparent 70%)`,
            transition: 'background-image 1s ease',
            pointerEvents: 'none',
          }}
        />
      )}

      <Header
        connectionState={connectionState}
        batteryLevel={batteryLevel}
        onLogoDoubleClick={() => setPanelOpen((v) => !v)}
      />

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '0 clamp(1rem, 2vw, 2rem) clamp(0.75rem, 1.5vw, 1.25rem)',
          gap: 'clamp(0.75rem, 1.5vw, 1.25rem)',
          minHeight: 0,
        }}
      >
        {isActive ? (
          /* ── ACTIVE STATE: 2-column grid ── */
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr clamp(160px, 16vw, 210px)',
              gridTemplateRows: '1fr auto auto',
              gap: 'clamp(0.75rem, 1.5vw, 1.25rem)',
              minHeight: 0,
            }}
          >
            <div style={{ gridColumn: 1, gridRow: 1, borderRadius: '12px', overflow: 'hidden', height: '100%' }}>
              <Waveform bpm={visualBPM} isActive={isActive} />
            </div>
            <div style={{ gridColumn: 2, gridRow: 1 }}>
              <BPMDisplay bpm={currentBPM} visualBPM={visualBPM} isActive={isActive} />
            </div>
            <div style={{ gridColumn: 1, gridRow: 2 }}>
              <StressGauge bpm={visualBPM} isActive={isActive} />
            </div>
            <div style={{ gridColumn: 2, gridRow: 2 }}>
              <SessionTimer startTime={startTime} isActive={isActive} />
            </div>
            <div style={{ gridColumn: 1, gridRow: 3 }}>
              <StatsCards
                minHR={sessionStats?.minHR ?? 0}
                avgHR={sessionStats?.avgHR ?? 0}
                maxHR={sessionStats?.maxHR ?? 0}
                isActive={true}
              />
            </div>
            <div style={{ gridColumn: 2, gridRow: 3 }}>
              <SessionSummary stats={aggregatedStats} />
            </div>
          </div>
        ) : sessionState === 'completed' ? (
          /* ── COMPLETED STATE: full-width centred hero ── */
          <>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'clamp(0.75rem, 2vw, 1.5rem)',
              }}
            >
              <div
                style={{
                  fontSize: 'clamp(1.25rem, 3vw, 2.25rem)',
                  fontFamily: 'Quicksand, sans-serif',
                  fontWeight: 700,
                  color: '#FF4200',
                  letterSpacing: '0.15em',
                }}
              >
                SESSION COMPLETE
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 'clamp(3rem, 8vw, 6rem)',
                    fontFamily: 'Quicksand, sans-serif',
                    fontWeight: 700,
                    color: '#EF4444',
                    lineHeight: 1,
                  }}
                >
                  {sessionStats?.maxHR ?? '--'}
                </div>
                <div
                  style={{
                    fontSize: 'clamp(0.75rem, 1.2vw, 1rem)',
                    fontFamily: 'Quicksand, sans-serif',
                    fontWeight: 600,
                    color: '#5C6371',
                    letterSpacing: '0.15em',
                    marginTop: '0.25rem',
                  }}
                >
                  PEAK BPM
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'clamp(1.5rem, 4vw, 3rem)', justifyContent: 'center' }}>
                {[
                  { label: 'AVG BPM', value: sessionStats?.avgHR ?? '--' },
                  { label: 'MIN BPM', value: sessionStats?.minHR ?? '--' },
                  {
                    label: 'DURATION', value: (() => {
                      if (!sessionStats?.startTime) return '--:--';
                      const end = sessionStats.endTime ?? Date.now();
                      const secs = Math.floor((end - sessionStats.startTime) / 1000);
                      return `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
                    })()
                  },
                ].map(({ label, value }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 'clamp(1.25rem, 2.5vw, 2rem)', fontFamily: 'Quicksand, sans-serif', fontWeight: 700, color: '#ffffff' }}>
                      {value}
                    </div>
                    <div style={{ fontSize: 'clamp(0.625rem, 1vw, 0.75rem)', fontFamily: 'Quicksand, sans-serif', fontWeight: 600, color: '#5C637180', letterSpacing: '0.1em' }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Full-width bottom row: stat cards + session summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr clamp(160px, 16vw, 210px)', gap: 'clamp(0.75rem, 1.5vw, 1.25rem)' }}>
              <StatsCards
                minHR={sessionStats?.minHR ?? 0}
                avgHR={sessionStats?.avgHR ?? 0}
                maxHR={sessionStats?.maxHR ?? 0}
                isActive={true}
              />
              <SessionSummary stats={aggregatedStats} />
            </div>
          </>
        ) : (
          /* ── IDLE STATE: full-width centred intro ── */
          <>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  fontSize: 'clamp(1.5rem, 4vw, 3rem)',
                  fontFamily: 'Quicksand, sans-serif',
                  fontWeight: 700,
                  color: '#FF420060',
                  animation: 'breathe 3s ease-in-out infinite',
                }}
              >
                NEXT CHALLENGER
              </div>
              <div style={{ fontSize: 'clamp(0.75rem, 1.2vw, 1rem)', fontFamily: 'Rubik, sans-serif', color: '#5C637140' }}>
                Press Enter to open controls
              </div>
            </div>
            <SessionSummary stats={aggregatedStats} />
          </>
        )}

        {/* Footer — always full width */}
        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.5rem 0',
          }}
        >
          <svg width="100" height="22" viewBox="0 0 100 22">
            <text
              x="0"
              y="18"
              fontFamily="Quicksand, sans-serif"
              fontSize="18"
              fontWeight="700"
              fill="#ffffff40"
            >
              quad
              <tspan fill="#FF420060">i</tspan>
              ent
            </text>
          </svg>
          <span
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: '#5C637140',
              letterSpacing: '0.05em',
            }}
          >
            LESS CHAOS. MORE AUTOMATION.
          </span>
        </footer>
      </main>

      <OperatorPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        connectionState={connectionState}
        sessionState={sessionState}
        dataSource={dataSource}
        batteryLevel={batteryLevel}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onStartSession={handleStartSession}
        onEndSession={handleEndSession}
        onResetSession={handleResetSession}
        onToggleDataSource={handleToggleDataSource}
        aggregatedStats={aggregatedStats}
        onStatsRefresh={refreshStats}
        sensitivityMultiplier={sensitivityMultiplier}
        onSensitivityChange={setSensitivityMultiplier}
        baselineHR={baselineHR}
        baselineDetected={baselineDetected}
      />
    </div>
  );
}
