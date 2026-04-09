import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getHRZone, getZoneColor, getZoneLabel, computeVisualBPM } from './types';
import type { ConnectionState, SessionState, DataSource, HRReading, AggregatedStats, SessionData, HRZone, ZoneThresholds } from './types';
import { BLEService } from './services/ble';
import { DummyDataService } from './services/dummyData';
import { SessionManager } from './services/sessionManager';
import { getAggregatedStats } from './services/db';
import { initRemoteSync, onRemoteCommand, onRemoteDataSource, onRemoteBpmAdjust, pushStatus } from './services/remoteSync';
import { Header } from './components/Header';
import { Waveform } from './components/Waveform';
import { BPMDisplay } from './components/BPMDisplay';
import { StressGauge } from './components/StressGauge';
import { SessionTimer } from './components/SessionTimer';
import { StatsCards } from './components/StatsCards';
import { SessionSummary } from './components/SessionSummary';
import { OperatorPanel } from './components/OperatorPanel';
import { RemoteControl } from './components/RemoteControl';
import { PrizeTakeover } from './components/PrizeTakeover';

// Remote control view — phone opens ?remote in URL
const IS_REMOTE = new URLSearchParams(window.location.search).has('remote');
// Kiosk/cast display mode — hides operator panel for clean Chromecast casting
const IS_KIOSK = new URLSearchParams(window.location.search).has('kiosk');

// Initialise Firebase sync (no-op if env vars not set)
initRemoteSync();

const IDLE_PUNS = [
  'Last one peaked at 157 BPM when the photocopier jammed mid-presentation.',
  'The fax from accounts still hasn\'t arrived. It\'s been three days.',
  'Think you\'re calmer than your manager? The overhead projector says otherwise.',
  'Your in-tray has 47 items. The one at the bottom has been there since before anyone can remember.',
  'It\'s just the annual appraisal. The form is four pages. In triplicate.',
  'Someone booked the only meeting room. For the whole day. Just for themselves.',
  'Your 9am became a 3pm. The memo never made it round.',
];

const ZONE_PUNS: Record<number, string[]> = {
  1: [
    'Suspiciously relaxed. Have you checked your in-tray lately?',
    'Ice in those veins. Your manager is mildly concerned.',
    'Either very zen or it\'s not your turn to fix the photocopier today.',
    'This is fine. The pigeon hole isn\'t overflowing. Yet.',
  ],
  2: [
    'Getting warmer. There\'s a note on your desk marked urgent.',
    'A meeting just appeared in the paper diary.',
    'Someone\'s left a Post-it on your monitor. It looks serious.',
    'The pressure is registering. Just like the fax tone.',
  ],
  3: [
    'Three memos. All marked urgent. All landed at once.',
    'Your to-do list just grew by four handwritten items.',
    'That deadline is closer than it looks. The wall calendar doesn\'t lie.',
    'Is that the fax machine going off again?',
  ],
  4: [
    'The MD wants "just a quick word" in his office.',
    'Your 3pm became a 2pm. The receptionist just rang.',
    'Multiple stakeholders. One overhead projector. No spare bulb.',
    'Live presentation. Wrong transparency on the projector.',
  ],
  5: [
    'Invoice missing. Client calling. Printer jammed. Pigeon hole overflowing.',
    'All-hands in five. You\'re presenting. The projector bulb just blew.',
    'Everyone is waiting. The fax still hasn\'t arrived. Everyone.',
    'Deep breaths. The right file is in the cabinet somewhere. Probably.',
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
  const [bleError, setBleError] = useState<string | null>(null);

  // Zone range presets — thresholds are BPM rise above personal baseline
  // Tighter = person hits high zones with a smaller heart rate increase
  // Presets expressed as total rise from baseline to Zone 5.
  // Zones are distributed proportionally across that range.
  // e.g. Tight: someone at 65 BPM hits Zone 5 at ~100 BPM.
  const SENSITIVITY_PRESETS: { id: string; label: string; description: string; example: string; thresholds: ZoneThresholds }[] = [
    {
      id: 'micro',
      label: 'Micro  (+20 BPM)',
      description: 'Max stress at just +20 BPM above baseline',
      example: 'e.g. 65 → 85 BPM = Zone 5',
      thresholds: { z2: 4, z3: 8, z4: 14, z5: 20 },
    },
    {
      id: 'tight',
      label: 'Tight  (+35 BPM)',
      description: 'Max stress at +35 BPM above baseline',
      example: 'e.g. 65 → 100 BPM = Zone 5',
      thresholds: { z2: 7, z3: 14, z4: 23, z5: 35 },
    },
    {
      id: 'medium',
      label: 'Medium  (+50 BPM)',
      description: 'Max stress at +50 BPM above baseline',
      example: 'e.g. 65 → 115 BPM = Zone 5',
      thresholds: { z2: 10, z3: 20, z4: 33, z5: 50 },
    },
    {
      id: 'wide',
      label: 'Wide  (+70 BPM)',
      description: 'Max stress at +70 BPM above baseline',
      example: 'e.g. 65 → 135 BPM = Zone 5',
      thresholds: { z2: 14, z3: 28, z4: 46, z5: 70 },
    },
  ];
  const [sensitivityPreset, setSensitivityPreset] = useState<string>('tight');
  const activeThresholds = SENSITIVITY_PRESETS.find(p => p.id === sensitivityPreset)!.thresholds;
  const sensitivityMultiplier = 1.0; // BPM display is always raw — no amplification
  const [baselineHR, setBaselineHR] = useState(70);
  const [baselineDetected, setBaselineDetected] = useState(false);
  const baselineReadings = useRef<number[]>([]);
  const [bpmOffset, setBpmOffset] = useState(0);
  const [wristbandWorn, setWristbandWorn] = useState(false);
  const bpmOffsetRef = useRef(0);
  const activeThresholdsRef = useRef(activeThresholds);
  const decayIntervalRef = useRef<number | null>(null);
  const wristbandWornRef = useRef(false);
  const dataSourceRef = useRef<DataSource>('dummy');
  const baselineHRRef = useRef(70);
  const startTimeRef = useRef<number | null>(null);

  const [idlePunIndex, setIdlePunIndex] = useState(0);
  const [idleScreen, setIdleScreen] = useState<'challenger' | 'prize'>('challenger');
  const [idleTransitioning, setIdleTransitioning] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const withFade = useCallback((fn: () => void | Promise<void>) => {
    setFadingOut(true);
    window.setTimeout(async () => {
      await fn();
      setFadingOut(false);
    }, 500);
  }, []);
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

  // Keyboard shortcut for operator panel (Enter key) — disabled in kiosk mode
  useEffect(() => {
    if (IS_KIOSK) return;
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

  // Decay the BPM offset back toward 0 at 1 BPM per 2 seconds after a manual adjustment.
  // Clears itself once offset reaches 0.
  const startOffsetDecay = useCallback(() => {
    if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
    decayIntervalRef.current = window.setInterval(() => {
      setBpmOffset((prev) => {
        if (prev === 0) {
          clearInterval(decayIntervalRef.current!);
          decayIntervalRef.current = null;
          return 0;
        }
        return prev > 0 ? prev - 1 : prev + 1;
      });
    }, 2000);
  }, []);

  // Secret operator override keys (W/S) for BPM offset
  // Step size scales with active sensitivity preset (one zone boundary per press),
  // capped at ±z5 so the override stays within the chosen range.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (sessionState !== 'active') return;

      const { z2: step, z5: max } = activeThresholdsRef.current;
      switch (e.key) {
        case 'w':
        case 'W':
          e.preventDefault();
          setBpmOffset((prev) => Math.min(prev + step, max));
          startOffsetDecay();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          setBpmOffset((prev) => Math.max(prev - step, -max));
          startOffsetDecay();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessionState, startOffsetDecay]);

  // Offset decays back toward 0 at 1 BPM per 2s after each manual adjustment

  useEffect(() => { bpmOffsetRef.current = bpmOffset; }, [bpmOffset]);
  useEffect(() => { baselineHRRef.current = baselineHR; }, [baselineHR]);
  useEffect(() => { activeThresholdsRef.current = activeThresholds; }, [activeThresholds]);
  useEffect(() => { wristbandWornRef.current = wristbandWorn; }, [wristbandWorn]);
  useEffect(() => { dataSourceRef.current = dataSource; }, [dataSource]);

  useEffect(() => {
    sessionManager.current.onStateChange = (state) => setSessionState(state);
    sessionManager.current.onStatsUpdate = (session) => setSessionStats(session);
  }, []);

  // Stale-reading watchdog: if no valid reading arrives within 3s, clear BPM
  const staleTimerRef = useRef<number | null>(null);
  const clearBpmOnStale = useCallback(() => {
    setCurrentBPM(0);
    setSmoothedBPM(0);
    bpmHistoryRef.current = [];
  }, []);

  const handleReading = useCallback((reading: HRReading) => {
    // Ignore zero-BPM readings (belt removed, no signal)
    if (reading.bpm === 0) return;
    // Discard BLE readings when the wristband is not marked as worn —
    // prevents idle/ambient sensor noise showing as a real heartbeat
    if (dataSourceRef.current === 'ble' && !wristbandWornRef.current) return;

    setCurrentBPM(reading.bpm);

    // Reset stale watchdog on every valid reading
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = window.setTimeout(clearBpmOnStale, 3000);

    // Rolling 4-reading average (~1s at 250ms interval) for stable display
    bpmHistoryRef.current.push(reading.bpm);
    if (bpmHistoryRef.current.length > 4) bpmHistoryRef.current.shift();
    const avg = Math.round(
      bpmHistoryRef.current.reduce((a, b) => a + b, 0) / bpmHistoryRef.current.length,
    );
    setSmoothedBPM(avg);

    // Record visual BPM (amplified + offset) so MIN/AVG/MAX match the display
    const recordedBPM = computeVisualBPM(avg, baselineHRRef.current, 1.0, bpmOffsetRef.current);
    sessionManager.current.addReading({ ...reading, bpm: recordedBPM });

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
      const supportError = BLEService.getSupportError();
      if (supportError) {
        setBleError(supportError);
        return;
      }
      setBleError(null);
      try {
        bleService.current.onReading = handleReading;
        bleService.current.onConnectionChange = setConnectionState;
        bleService.current.onBatteryUpdate = setBatteryLevel;
        await bleService.current.requestDevice();
      } catch (err) {
        // User cancelled the picker — don't show an error
        if (err instanceof Error && err.name === 'NotFoundError') return;
        const msg = err instanceof Error ? err.message : 'Bluetooth connection failed.';
        setBleError(msg);
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
    const finalSession = await sessionManager.current.endSession();
    if (finalSession) setSessionStats(finalSession);
    if (dataSource === 'dummy') {
      dummyService.current.stop();
    }
    setSessionState('completed');
    setBpmOffset(0);
    if (decayIntervalRef.current) { clearInterval(decayIntervalRef.current); decayIntervalRef.current = null; }
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
    setWristbandWorn(false);
    if (staleTimerRef.current) { clearTimeout(staleTimerRef.current); staleTimerRef.current = null; }
    if (decayIntervalRef.current) { clearInterval(decayIntervalRef.current); decayIntervalRef.current = null; }
  };

  const handleToggleDataSource = () => {
    handleDisconnect();
    setDataSource((d) => (d === 'ble' ? 'dummy' : 'ble'));
  };

  // Listen for remote commands from phone controller
  useEffect(() => {
    const unsub = onRemoteCommand((command) => {
      if (command === 'start' && sessionState === 'idle') withFade(handleStartSession);
      if (command === 'end' && sessionState === 'active') withFade(handleEndSession);
      if (command === 'reset' && sessionState === 'completed') withFade(handleResetSession);
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

  // Listen for BPM offset adjustments from remote (active session only)
  // Uses same sensitivity-scaled step as the W/S keyboard shortcut
  useEffect(() => {
    const unsub = onRemoteBpmAdjust((direction) => {
      if (sessionState !== 'active') return;
      const { z2: step, z5: max } = activeThresholdsRef.current;
      if (direction === 'up') { setBpmOffset((prev) => Math.min(prev + step, max)); startOffsetDecay(); }
      if (direction === 'down') { setBpmOffset((prev) => Math.max(prev - step, -max)); startOffsetDecay(); }
    });
    return unsub;
  }, [sessionState, startOffsetDecay]);

  // Push live status to Firebase so remote control can display it (every ~2s)
  useEffect(() => {
    if (sessionState !== 'active') return;
    const id = setInterval(() => pushStatus(smoothedBPM, sessionState, dataSource, connectionState), 2000);
    return () => clearInterval(id);
  }, [sessionState, smoothedBPM, dataSource, connectionState]);

  // On session/connection/source state change, push immediately
  useEffect(() => {
    pushStatus(smoothedBPM, sessionState, dataSource, connectionState);
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
            withFade(handleStartSession);
          }
          break;
        case '2':
          if (sessionState === 'idle') {
            e.preventDefault();
            const supportError = BLEService.getSupportError();
            if (supportError) { setBleError(supportError); break; }
            setBleError(null);
            setDataSource('ble');
            bleService.current.onReading = handleReading;
            bleService.current.onConnectionChange = setConnectionState;
            bleService.current.onBatteryUpdate = setBatteryLevel;
            bleService.current.requestDevice().then(() => {
              withFade(handleStartSession);
            }).catch((err) => {
              if (err instanceof Error && err.name === 'NotFoundError') return;
              setBleError(err instanceof Error ? err.message : 'Bluetooth connection failed.');
              console.error('BLE connection failed:', err);
            });
          }
          break;
        case '3':
          if (sessionState === 'active') {
            e.preventDefault();
            withFade(handleEndSession);
          }
          break;
        case '4':
          if (sessionState === 'completed') {
            e.preventDefault();
            withFade(handleResetSession);
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

  // Cycle between challenger screen (12s) and prize takeover (8s), with fade-out transition
  useEffect(() => {
    if (sessionState !== 'idle') {
      setIdleScreen('challenger');
      setIdleTransitioning(false);
      return;
    }
    let timer: number;
    const switchTo = (next: 'challenger' | 'prize') => {
      // Phase 1: fade out current screen (600ms)
      setIdleTransitioning(true);
      timer = window.setTimeout(() => {
        // Phase 2: swap screen, fade in
        setIdleScreen(next);
        setIdleTransitioning(false);
        // Schedule next switch
        const hold = next === 'challenger' ? 12000 : 8000;
        timer = window.setTimeout(() => {
          switchTo(next === 'challenger' ? 'prize' : 'challenger');
        }, hold);
      }, 600);
    };
    // Start: challenger holds for 12s then switches
    timer = window.setTimeout(() => switchTo('prize'), 12000);
    return () => clearTimeout(timer);
  }, [sessionState]);

  // Dominant zone for results screen — computed from session readings by time spent
  const dominantZoneResult = useMemo(() => {
    if (!sessionStats || sessionStats.readings.length < 2) return null;
    const readings = sessionStats.readings;
    const zoneDuration: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 1; i < readings.length; i++) {
      const interval = readings[i].timestamp - readings[i - 1].timestamp;
      const z = getHRZone(readings[i - 1].bpm, baselineHR, activeThresholds);
      zoneDuration[z] += interval;
    }
    const dominant = (Object.entries(zoneDuration).sort((a, b) => b[1] - a[1])[0][0]) as unknown as HRZone;
    return Number(dominant) as HRZone;
  }, [sessionStats]);

  const ZONE_RESULTS_MESSAGES: Record<number, string> = {
    1: 'You kept your cool throughout. The in-tray didn\'t stand a chance.',
    2: 'You stayed aware but in control — pressure noted, composure kept.',
    3: 'You felt the heat. Every memo landed. You handled it.',
    4: 'Things got intense — the deadlines were closing in and you felt every one.',
    5: 'Full overload. The projector bulb blew and you didn\'t flinch.',
  };

  // Compute visual BPM (amplified + operator offset) for all stress visuals
  // Uses smoothed BPM so display/zone/waveform don't jitter with per-reading noise
  // visualBPM: raw BPM + operator offset only — no amplification, display stays honest
  const visualBPM = computeVisualBPM(smoothedBPM, baselineHR, sensitivityMultiplier, bpmOffset);
  // Zone is relative to personal baseline + active range preset
  const zone: HRZone = baselineDetected
    ? getHRZone(smoothedBPM + bpmOffset, baselineHR, activeThresholds)
    : getHRZone(visualBPM);
  const stressColor = getZoneColor(zone);
  const isActive = sessionState === 'active';

  // Fast zone debounce (500ms) for the gauge — reacts quickly to real changes
  const stableZoneTimerRef = useRef<number | null>(null);
  const [stableZone, setStableZone] = useState<HRZone>(zone);
  useEffect(() => {
    if (stableZoneTimerRef.current) clearTimeout(stableZoneTimerRef.current);
    stableZoneTimerRef.current = window.setTimeout(() => {
      setStableZone(zone);
      stableZoneTimerRef.current = null;
    }, 500);
    return () => {
      if (stableZoneTimerRef.current) clearTimeout(stableZoneTimerRef.current);
    };
  }, [zone]);

  // Slow zone debounce (10s) for puns — prevents flip-flopping at zone boundaries
  const punZoneTimerRef = useRef<number | null>(null);
  const [punZone, setPunZone] = useState<HRZone>(zone);
  useEffect(() => {
    if (punZoneTimerRef.current) clearTimeout(punZoneTimerRef.current);
    punZoneTimerRef.current = window.setTimeout(() => {
      setPunZone(zone);
      punZoneTimerRef.current = null;
    }, 10000);
    return () => {
      if (punZoneTimerRef.current) clearTimeout(punZoneTimerRef.current);
    };
  }, [zone]);

  // Pun variant cycles every 12s (independent of zone changes)
  const [punVariantIndex, setPunVariantIndex] = useState(0);
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setPunVariantIndex((i) => i + 1), 12000);
    return () => clearInterval(id);
  }, [isActive]);

  const zonePun = useMemo(
    () => ZONE_PUNS[punZone][punVariantIndex % ZONE_PUNS[punZone].length],
    [punZone, punVariantIndex],
  );

  // Fade-out → swap text → fade-in to prevent snap-flickering at zone boundaries
  const [displayedPun, setDisplayedPun] = useState(zonePun);
  const [punVisible, setPunVisible] = useState(true);
  useEffect(() => {
    setPunVisible(false);
    const t = setTimeout(() => {
      setDisplayedPun(zonePun);
      setPunVisible(true);
    }, 350);
    return () => clearTimeout(t);
  }, [zonePun]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#F9FAFB',
        color: '#374151',
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
            backgroundImage: `radial-gradient(ellipse at 50% 30%, ${stressColor}18, transparent 70%)`,
            transition: 'background-image 1s ease',
            pointerEvents: 'none',
          }}
        />
      )}

      <Header
        connectionState={connectionState}
        batteryLevel={batteryLevel}
        dataSource={dataSource}
        onLogoDoubleClick={IS_KIOSK ? undefined : () => setPanelOpen((v) => !v)}
        onLogoClick={IS_KIOSK ? undefined : isMobile ? () => setPanelOpen((v) => !v) : undefined}
        onStatusClick={IS_KIOSK ? undefined : () => setPanelOpen((v) => !v)}
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, animation: fadingOut ? 'fadeOut 0.5s ease forwards' : undefined }}>
        {isActive ? isMobile ? (
          /* ── ACTIVE STATE: mobile single-column ── */
          <div key="active-mobile" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 0, animation: 'fadeIn 0.5s ease' }}>
            {/* BPM ring — centred */}
            <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <BPMDisplay bpm={currentBPM} visualBPM={visualBPM} isActive={isActive} />
            </div>
            {/* Waveform — takes remaining height */}
            <div style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', minHeight: '100px', background: '#000000', boxShadow: '0 2px 16px rgba(0,0,0,0.18)' }}>
              <Waveform bpm={visualBPM} isActive={isActive} />
            </div>
            {/* HR Zone + pun + timer */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <StressGauge bpm={visualBPM} isActive={isActive} stableZone={stableZone} />
              <div style={{ fontSize: '0.78rem', fontFamily: 'Montserrat, sans-serif', color: stressColor, fontStyle: 'italic', opacity: punVisible ? 1 : 0, transition: 'opacity 0.35s ease' }}>
                {displayedPun}
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
            <div style={{ gridColumn: 1, gridRow: 1, borderRadius: '12px', overflow: 'hidden', height: '100%', background: '#000000', boxShadow: '0 2px 16px rgba(0,0,0,0.18)' }}>
              <Waveform bpm={visualBPM} isActive={isActive} />
            </div>
            <div style={{ gridColumn: 2, gridRow: 1 }}>
              <BPMDisplay bpm={currentBPM} visualBPM={visualBPM} isActive={isActive} />
            </div>
            <div style={{ gridColumn: 1, gridRow: 2, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <StressGauge bpm={visualBPM} isActive={isActive} stableZone={stableZone} />
              <div
                style={{
                  fontSize: 'clamp(0.7rem, 1.1vw, 0.85rem)',
                  fontFamily: 'Montserrat, sans-serif',
                  color: stressColor,
                  fontStyle: 'italic',
                  opacity: punVisible ? 1 : 0,
                  transition: 'opacity 0.35s ease',
                }}
              >
                {displayedPun}
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
                gap: 'clamp(1.25rem, 3vw, 2.5rem)',
              }}
            >
              <div
                style={{
                  fontSize: 'clamp(1.25rem, 3vw, 2.25rem)',
                  fontFamily: 'Quicksand, sans-serif',
                  fontWeight: 700,
                  color: '#FF4200',
                }}
              >
                Session Complete
              </div>

              {dominantZoneResult && (
                <div
                  style={{
                    width: 'clamp(260px, 50vw, 420px)',
                    borderRadius: '12px',
                    background: '#fff',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
                    borderTop: `4px solid ${getZoneColor(dominantZoneResult)}`,
                    padding: 'clamp(1rem, 2vw, 1.5rem) clamp(1.25rem, 2.5vw, 2rem)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.65rem',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      color: '#9CA3AF',
                      textTransform: 'uppercase',
                    }}
                  >
                    Your dominant zone
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(1.1rem, 2.2vw, 1.5rem)',
                      fontFamily: 'Quicksand, sans-serif',
                      fontWeight: 700,
                      color: getZoneColor(dominantZoneResult),
                      lineHeight: 1.1,
                    }}
                  >
                    Zone {dominantZoneResult} — {getZoneLabel(dominantZoneResult)}
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(0.75rem, 1.1vw, 0.85rem)',
                      fontFamily: 'Montserrat, sans-serif',
                      color: '#5C6371',
                      lineHeight: 1.5,
                    }}
                  >
                    {ZONE_RESULTS_MESSAGES[dominantZoneResult]}
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 'clamp(3rem, 8vw, 6rem)',
                    fontFamily: 'Quicksand, sans-serif',
                    fontWeight: 700,
                    color: '#CC3400',
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
                    marginTop: '0.25rem',
                  }}
                >
                  Peak BPM
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'clamp(2.5rem, 6vw, 5rem)', justifyContent: 'center' }}>
                {[
                  { label: 'Avg BPM', value: sessionStats?.avgHR ?? '--' },
                  { label: 'Min BPM', value: sessionStats?.minHR ?? '--' },
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
                    <div style={{ fontSize: 'clamp(1.25rem, 2.5vw, 2rem)', fontFamily: 'Quicksand, sans-serif', fontWeight: 700, color: '#374151' }}>
                      {value}
                    </div>
                    <div style={{ fontSize: 'clamp(0.625rem, 1vw, 0.75rem)', fontFamily: 'Quicksand, sans-serif', fontWeight: 600, color: '#9CA3AF' }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : idleScreen === 'prize' ? (
          /* ── IDLE: PRIZE TAKEOVER ── GSAP-animated component */
          <PrizeTakeover
            key="idle-prize"
            isMobile={isMobile}
            isExiting={idleTransitioning || fadingOut}
          />
        ) : (
          /* ── IDLE: NEXT CHALLENGER ── */
          <div key="idle-challenger" style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: idleTransitioning ? 'fadeOut 0.6s ease forwards' : 'fadeIn 0.7s ease' }}>
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
                  textShadow: '0 0 40px #FF420060',
                  textAlign: 'center',
                }}
              >
                Next Challenger
              </div>
              <div
                key={idlePunIndex}
                style={{
                  fontSize: isMobile ? '0.95rem' : 'clamp(0.8rem, 1.4vw, 1.05rem)',
                  fontFamily: 'Montserrat, sans-serif',
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
        </div>

        {/* Footer — hidden on mobile */}
        <footer
          style={{
            display: isMobile ? 'none' : 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.5rem 0',
          }}
        >
          <img
            src="/quadient-logo.png"
            alt="Quadient"
            height="16"
            style={{ opacity: 0.25, filter: 'grayscale(1)' }}
          />
          <span
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              color: '#9CA3AF',
            }}
          >
            Make room for the remarkable.
          </span>
        </footer>
      </main>

      {!IS_KIOSK && (
        <OperatorPanel
          isOpen={panelOpen}
          onClose={() => setPanelOpen(false)}
          connectionState={connectionState}
          sessionState={sessionState}
          dataSource={dataSource}
          batteryLevel={batteryLevel}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onStartSession={() => withFade(handleStartSession)}
          onEndSession={() => withFade(handleEndSession)}
          onResetSession={() => withFade(handleResetSession)}
          onToggleDataSource={handleToggleDataSource}
          aggregatedStats={aggregatedStats}
          onStatsRefresh={refreshStats}
          bleError={bleError}
          onClearBleError={() => setBleError(null)}
          sensitivityPreset={sensitivityPreset}
          onSensitivityChange={setSensitivityPreset}
          sensitivityPresets={SENSITIVITY_PRESETS}
          wristbandWorn={wristbandWorn}
          onToggleWristbandWorn={() => setWristbandWorn((v) => !v)}
        />
      )}
    </div>
  );
}
