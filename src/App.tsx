import { useState, useEffect, useRef, useCallback } from 'react';
import { getStressLevel, getStressColor, computeVisualBPM } from './types';
import type { ConnectionState, SessionState, DataSource, HRReading, AggregatedStats, SessionData } from './types';
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
          setBpmOffset((prev) => Math.min(prev + 5, 80));
          break;
        case 's':
          // lowercase only — uppercase S is not used, but keep lowercase-only for safety
          e.preventDefault();
          setBpmOffset((prev) => Math.max(prev - 5, -40));
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessionState]);

  // Decay bpmOffset toward 0 over time
  useEffect(() => {
    if (bpmOffset === 0 || sessionState !== 'active') return;

    const decayInterval = setInterval(() => {
      setBpmOffset((prev) => {
        if (prev > 0) return Math.max(0, prev - 2);
        if (prev < 0) return Math.min(0, prev + 2);
        return 0;
      });
    }, 1000);

    return () => clearInterval(decayInterval);
  }, [bpmOffset !== 0, sessionState]);

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
  const stressLevel = getStressLevel(visualBPM);
  const stressColor = getStressColor(stressLevel);
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
        {/* Waveform / Completed Screen / Idle Screen */}
        <div
          style={{
            flex: '1 1 40%',
            minHeight: '200px',
            borderRadius: '12px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {isActive ? (
            <Waveform bpm={visualBPM} isActive={isActive} />
          ) : sessionState === 'completed' ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#0a0a0f',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'clamp(0.75rem, 2vw, 1.5rem)',
              }}
            >
              {/* SESSION COMPLETE title */}
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

              {/* Peak HR hero stat */}
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

              {/* Secondary stats row */}
              <div
                style={{
                  display: 'flex',
                  gap: 'clamp(1.5rem, 4vw, 3rem)',
                  justifyContent: 'center',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 'clamp(1.25rem, 2.5vw, 2rem)',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: 700,
                      color: '#ffffff',
                    }}
                  >
                    {sessionStats?.avgHR ?? '--'}
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(0.625rem, 1vw, 0.75rem)',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: 600,
                      color: '#5C637180',
                      letterSpacing: '0.1em',
                    }}
                  >
                    AVG BPM
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 'clamp(1.25rem, 2.5vw, 2rem)',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: 700,
                      color: '#ffffff',
                    }}
                  >
                    {sessionStats?.minHR ?? '--'}
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(0.625rem, 1vw, 0.75rem)',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: 600,
                      color: '#5C637180',
                      letterSpacing: '0.1em',
                    }}
                  >
                    MIN BPM
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 'clamp(1.25rem, 2.5vw, 2rem)',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: 700,
                      color: '#ffffff',
                    }}
                  >
                    {(() => {
                      if (!sessionStats?.startTime) return '--:--';
                      const end = sessionStats.endTime ?? Date.now();
                      const secs = Math.floor((end - sessionStats.startTime) / 1000);
                      const m = Math.floor(secs / 60);
                      const s = secs % 60;
                      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    })()}
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(0.625rem, 1vw, 0.75rem)',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: 600,
                      color: '#5C637180',
                      letterSpacing: '0.1em',
                    }}
                  >
                    DURATION
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#0a0a0f',
                borderRadius: '12px',
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
              <div
                style={{
                  fontSize: 'clamp(0.75rem, 1.2vw, 1rem)',
                  fontFamily: 'Rubik, sans-serif',
                  color: '#5C637140',
                }}
              >
                Press Enter to open controls
              </div>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 'clamp(0.75rem, 1.5vw, 1.25rem)',
            alignItems: 'stretch',
          }}
        >
          <BPMDisplay bpm={currentBPM} visualBPM={visualBPM} isActive={isActive} />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(0.5rem, 1vw, 0.75rem)',
              justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <StressGauge bpm={visualBPM} isActive={isActive} />
              </div>
              <SessionTimer startTime={startTime} isActive={isActive} />
            </div>

            <StatsCards
              minHR={sessionStats?.minHR ?? 0}
              avgHR={sessionStats?.avgHR ?? 0}
              maxHR={sessionStats?.maxHR ?? 0}
              isActive={isActive || sessionState === 'completed'}
            />
          </div>
        </div>

        <SessionSummary stats={aggregatedStats} />

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
