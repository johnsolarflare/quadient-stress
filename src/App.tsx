import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getHRZone, getZoneColor, computeVisualBPM } from './types';
import type { ConnectionState, SessionState, DataSource, HRReading, AggregatedStats, SessionData, HRZone } from './types';
import { BLEService } from './services/ble';
import { DummyDataService } from './services/dummyData';
import { SessionManager } from './services/sessionManager';
import { getAggregatedStats } from './services/db';
import { initRemoteSync, onRemoteCommand, onRemoteDataSource, pushStatus, resetLastCommandAt } from './services/remoteSync';
import { Header } from './components/Header';
import { Waveform } from './components/Waveform';
import { BPMDisplay } from './components/BPMDisplay';
import { StressGauge } from './components/StressGauge';
import { SessionTimer } from './components/SessionTimer';
import { StatsCards } from './components/StatsCards';
import { SessionSummary } from './components/SessionSummary';
import { OperatorPanel } from './components/OperatorPanel';
import { RemoteControl } from './components/RemoteControl';

// Remote control view — phone opens ?remote in URL
const IS_REMOTE = new URLSearchParams(window.location.search).has('remote');

// Initialise Firebase sync (no-op if env vars not set)
initRemoteSync();

const IDLE_PUNS = [
  'Last one peaked at 157 BPM during the Q3 all-hands.',
  'The printer is jammed again. Time to find out what you\'re made of.',
  'Think you\'re calmer than your manager? Prove it.',
  'Your inbox has 47 unread. Just saying.',
  'It\'s just a performance review. What\'s the worst that could happen?',
  'The CEO wants to "quickly align" with you.',
  'Your 9am became a 3pm. Again.',
];

const ZONE_PUNS: Record<number, string[]> = {
  1: [
    'Suspiciously calm. Have you even checked your emails?',
    'Ice in those veins. Your manager is concerned.',
    'Either very zen or the Wi-Fi is down.',
    'This is fine. Everything is fine.',
  ],
  2: [
    'Getting warmer. Slack is about to ping.',
    'A meeting just appeared on your calendar.',
    'Someone mentioned you in a thread.',
    'The pressure is registering. Slightly.',
  ],
  3: [
    'Three unread Slacks. Simultaneously.',
    'Your to-do list just grew by four items.',
    'That deadline is closer than it looks.',
    'Is that your phone buzzing? Again?',
  ],
  4: [
    'The CEO wants "just a quick word".',
    'Your 3pm became a 2pm. Starting now.',
    'Multiple stakeholders. One screen.',
    'Live presentation. Wrong file open.',
  ],
  5: [
    'Production is down. Client is calling. Printer jammed.',
    'All-hands in five minutes. You\'re presenting.',
    'Everyone is waiting. Everyone.',
    'Deep breaths. You got this. Probably.',
  ],
};

export default function App() {
  if (IS_REMOTE) return <RemoteControl />;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [dataSource, setDataSource] = useState<DataSource>('dummy');
  const [currentBPM, setCurrentBPM] = useState(0);
  const [smoothedBPM, setSmoothedBPM] = useState(0);
  const bpmHistoryRef = useRef<number[]>([]);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionData | null>(null);
  const [aggregatedStats, setAggregatedStats] = useState<AggregatedStats>({
    totalSessions: 0, avgPeakHR: 0, avgAvgHR: 0, highestHR: 0, avgSessionDuration: 0,
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Visual sensitivity & operator override
  const [sensitivityMultiplier] = useState(1.0);
  const [baselineHR, setBaselineHR] = useState(70);
  const [baselineDetected, setBaselineDetected] = useState(false);
  const baselineReadings = useRef<number[]>([]);
  const [bpmOffset, setBpmOffset] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  const [idlePunIndex, setIdlePunIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

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

    // Rolling 4-reading average (~1s at 250ms interval) for stable display
    bpmHistoryRef.current.push(reading.bpm);
    if (bpmHistoryRef.current.length > 4) bpmHistoryRef.current.shift();
    const avg = Math.round(
      bpmHistoryRef.current.reduce((a, b) => a + b, 0) / bpmHistoryRef.current.length,
    );
    setSmoothedBPM(avg);

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
    if (dataSource === 'ble' && connectionState !== 'connected') {
      alert('Connect your Polar sensor first — open the Operator Panel and click Connect.');
      return;
    }
    if (dataSource === 'dummy') {
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
    setSmoothedBPM(0);
    bpmHistoryRef.current = [];
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

  // Listen for remote commands from phone controller
  useEffect(() => {
    const unsub = onRemoteCommand((command) => {
      if (command === 'start' && sessionState === 'idle') handleStartSession();
      if (command === 'end' && sessionState === 'active') handleEndSession();
      if (command === 'reset' && sessionState === 'completed') handleResetSession();
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState]);

  // Listen for data source switch requests from remote
  useEffect(() => {
    const unsub = onRemoteDataSource((source) => {
      if (sessionState !== 'idle') return; // don't switch mid-session
      if (source !== dataSource) handleToggleDataSource();
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, dataSource]);

  // Push live status to Firebase so remote control can display it (every ~2s)
  useEffect(() => {
    if (sessionState !== 'active') return;
    const id = setInterval(() => pushStatus(smoothedBPM, sessionState, dataSource, connectionState), 2000);
    return () => clearInterval(id);
  }, [sessionState, smoothedBPM, dataSource, connectionState]);

  // On session/connection/source state change, push immediately
  useEffect(() => {
    pushStatus(smoothedBPM, sessionState, dataSource, connectionState);
    if (sessionState === 'idle') resetLastCommandAt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, dataSource, connectionState]);

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

  // Cycle idle puns every 5 seconds when in idle state
  useEffect(() => {
    if (sessionState !== 'idle') return;
    const id = setInterval(() => {
      setIdlePunIndex((i) => (i + 1) % IDLE_PUNS.length);
    }, 5000);
    return () => clearInterval(id);
  }, [sessionState]);

  // Compute visual BPM (amplified + operator offset) for all stress visuals
  // Uses smoothed BPM so display/zone/waveform don't jitter with per-reading noise
  const visualBPM = computeVisualBPM(smoothedBPM, baselineHR, sensitivityMultiplier, bpmOffset);
  const zone: HRZone = getHRZone(visualBPM);
  const stressColor = getZoneColor(zone);
  const isActive = sessionState === 'active';

  // Debounced stable zone — zone must be steady for 2s before display updates
  const stableZoneTimerRef = useRef<number | null>(null);
  const [stableZone, setStableZone] = useState<HRZone>(zone);
  useEffect(() => {
    if (stableZoneTimerRef.current) clearTimeout(stableZoneTimerRef.current);
    stableZoneTimerRef.current = window.setTimeout(() => {
      setStableZone(zone);
      stableZoneTimerRef.current = null;
    }, 2000);
    return () => {
      if (stableZoneTimerRef.current) clearTimeout(stableZoneTimerRef.current);
    };
  }, [zone]);

  // Pun variant cycles every 8s (independent of zone changes)
  const [punVariantIndex, setPunVariantIndex] = useState(0);
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setPunVariantIndex((i) => i + 1), 8000);
    return () => clearInterval(id);
  }, [isActive]);

  const zonePun = useMemo(
    () => ZONE_PUNS[stableZone][punVariantIndex % ZONE_PUNS[stableZone].length],
    [stableZone, punVariantIndex],
  );

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
        onLogoClick={isMobile ? () => setPanelOpen((v) => !v) : undefined}
        isMobile={isMobile}
      />

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '0 clamp(1rem, 2vw, 2rem) clamp(0.75rem, 1.5vw, 1.25rem)',
          gap: 'clamp(0.75rem, 1.5vw, 1.25rem)',
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {isActive ? isMobile ? (
          /* ── ACTIVE STATE: mobile single-column ── */
          <div key="active-mobile" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 0, animation: 'fadeIn 0.5s ease' }}>
            {/* BPM ring — centred */}
            <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <BPMDisplay bpm={currentBPM} visualBPM={visualBPM} isActive={isActive} />
            </div>
            {/* Waveform — takes remaining height */}
            <div style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', minHeight: '100px' }}>
              <Waveform bpm={visualBPM} isActive={isActive} />
            </div>
            {/* HR Zone + pun + timer */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <StressGauge bpm={visualBPM} isActive={isActive} stableZone={stableZone} />
              <div key={stableZone} style={{ fontSize: '0.78rem', fontFamily: 'Rubik, sans-serif', color: `${stressColor}90`, fontStyle: 'italic', animation: 'fadeIn 0.6s ease' }}>
                {zonePun}
              </div>
              <SessionTimer startTime={startTime} isActive={isActive} />
            </div>
            {/* Stats row */}
            <div style={{ flexShrink: 0 }}>
              <StatsCards minHR={sessionStats?.minHR ?? 0} avgHR={sessionStats?.avgHR ?? 0} maxHR={sessionStats?.maxHR ?? 0} isActive={true} />
            </div>
          </div>
        ) : (
          /* ── ACTIVE STATE: desktop 2-column grid ── */
          <div
            key="active"
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr clamp(160px, 16vw, 210px)',
              gridTemplateRows: '1fr auto auto',
              gap: 'clamp(0.75rem, 1.5vw, 1.25rem)',
              minHeight: 0,
              animation: 'fadeIn 0.5s ease',
            }}
          >
            <div style={{ gridColumn: 1, gridRow: 1, borderRadius: '12px', overflow: 'hidden', height: '100%' }}>
              <Waveform bpm={visualBPM} isActive={isActive} />
            </div>
            <div style={{ gridColumn: 2, gridRow: 1 }}>
              <BPMDisplay bpm={currentBPM} visualBPM={visualBPM} isActive={isActive} />
            </div>
            <div style={{ gridColumn: 1, gridRow: 2, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <StressGauge bpm={visualBPM} isActive={isActive} stableZone={stableZone} />
              <div
                key={stableZone}
                style={{
                  fontSize: 'clamp(0.7rem, 1.1vw, 0.85rem)',
                  fontFamily: 'Rubik, sans-serif',
                  color: `${stressColor}90`,
                  fontStyle: 'italic',
                  animation: 'fadeIn 0.6s ease',
                }}
              >
                {zonePun}
              </div>
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
          <div key="completed" style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.6s ease' }}>
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
            {/* Full-width bottom row: stat cards + session summary — desktop only */}
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr clamp(160px, 16vw, 210px)', gap: 'clamp(0.75rem, 1.5vw, 1.25rem)' }}>
                <StatsCards
                  minHR={sessionStats?.minHR ?? 0}
                  avgHR={sessionStats?.avgHR ?? 0}
                  maxHR={sessionStats?.maxHR ?? 0}
                  isActive={true}
                />
                <SessionSummary stats={aggregatedStats} />
              </div>
            )}
          </div>
        ) : (
          /* ── IDLE STATE: full-width centred intro ── */
          <div key="idle" style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.5s ease' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.25rem',
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? '2.25rem' : 'clamp(2rem, 5vw, 4rem)',
                  fontFamily: 'Quicksand, sans-serif',
                  fontWeight: 700,
                  color: '#FF4200',
                  animation: 'breathe 3s ease-in-out infinite',
                  letterSpacing: '0.08em',
                  textShadow: '0 0 40px #FF420060',
                  textAlign: 'center',
                }}
              >
                NEXT CHALLENGER
              </div>
              <div
                key={idlePunIndex}
                style={{
                  fontSize: isMobile ? '0.95rem' : 'clamp(0.8rem, 1.4vw, 1.05rem)',
                  fontFamily: 'Rubik, sans-serif',
                  color: '#5C6371',
                  fontStyle: 'italic',
                  animation: 'punFade 5s ease forwards',
                  textAlign: 'center',
                  maxWidth: '480px',
                  padding: '0 1rem',
                }}
              >
                {IDLE_PUNS[idlePunIndex]}
              </div>
            </div>
            {!isMobile && <SessionSummary stats={aggregatedStats} />}
          </div>
        )}

        {/* Footer — hidden on mobile */}
        <footer
          style={{
            display: isMobile ? 'none' : 'flex',
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
      />
    </div>
  );
}
