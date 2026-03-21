export interface HRReading {
  bpm: number;
  timestamp: number;
  rrIntervals?: number[]; // in ms
}

export interface SessionData {
  id: string;
  startTime: number;
  endTime?: number;
  readings: HRReading[];
  minHR: number;
  maxHR: number;
  avgHR: number;
  peakHRTimestamp?: number;
  notes?: string;
}

export interface AggregatedStats {
  totalSessions: number;
  avgPeakHR: number;
  avgAvgHR: number;
  highestHR: number;
  avgSessionDuration: number; // in seconds
}

export type SessionState = 'idle' | 'active' | 'completed';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type StressLevel = 'calm' | 'moderate' | 'elevated' | 'max';

export type HRZone = 1 | 2 | 3 | 4 | 5;

export type DataSource = 'ble' | 'dummy';

export interface DataSourceInterface {
  start(): void;
  stop(): void;
  onReading: ((reading: HRReading) => void) | null;
  onConnectionChange: ((state: ConnectionState) => void) | null;
  onBatteryUpdate: ((level: number) => void) | null;
}

export function getStressLevel(bpm: number): StressLevel {
  if (bpm < 80) return 'calm';
  if (bpm < 110) return 'moderate';
  if (bpm < 140) return 'elevated';
  return 'max';
}

export function getStressColor(level: StressLevel): string {
  switch (level) {
    case 'calm': return '#22C55E';
    case 'moderate': return '#FF4200';
    case 'elevated': return '#EF4444';
    case 'max': return '#DC2626';
  }
}

export function getStressLabel(level: StressLevel): string {
  switch (level) {
    case 'calm': return 'CALM';
    case 'moderate': return 'MODERATE';
    case 'elevated': return 'ELEVATED';
    case 'max': return 'MAX STRESS';
  }
}

// Polar-style 5-zone system (based on % of estimated max HR ~185 bpm)
export function getHRZone(bpm: number): HRZone {
  if (bpm < 111) return 1;  // < 60% — Very Light
  if (bpm < 130) return 2;  // 60-70% — Light
  if (bpm < 148) return 3;  // 70-80% — Moderate
  if (bpm < 167) return 4;  // 80-90% — Hard
  return 5;                  // > 90% — Maximum
}

export function getZoneColor(zone: HRZone): string {
  switch (zone) {
    case 1: return '#60A5FA'; // blue — very light
    case 2: return '#22C55E'; // green — light
    case 3: return '#FBBF24'; // amber — moderate
    case 4: return '#FF4200'; // orange-red — hard (Quadient brand)
    case 5: return '#EF4444'; // red — maximum
  }
}

export function getZoneLabel(zone: HRZone): string {
  switch (zone) {
    case 1: return 'VERY LIGHT';
    case 2: return 'LIGHT';
    case 3: return 'MODERATE';
    case 4: return 'HARD';
    case 5: return 'MAXIMUM';
  }
}

/**
 * Compute the visual BPM used for all stress-level visuals.
 * Amplifies deviations from baseline and adds operator offset.
 * Raw BPM is still shown as the number; this drives colors/gauge/waveform.
 */
export function computeVisualBPM(
  rawBPM: number,
  baseline: number,
  multiplier: number,
  bpmOffset: number
): number {
  const amplifiedBPM = baseline + (rawBPM - baseline) * multiplier;
  const totalBPM = amplifiedBPM + bpmOffset;
  return Math.round(Math.max(40, Math.min(220, totalBPM)));
}
