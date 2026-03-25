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
  if (bpm < 72) return 'calm';
  if (bpm < 88) return 'moderate';
  if (bpm < 105) return 'elevated';
  return 'max';
}

export function getStressColor(level: StressLevel): string {
  switch (level) {
    case 'calm': return '#05B9F0';
    case 'moderate': return '#FF4200';
    case 'elevated': return '#CC3400';
    case 'max': return '#CC3400';
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

// Office stress zones — calibrated for cognitive/psychological stress, not exercise
export function getHRZone(bpm: number): HRZone {
  if (bpm < 72)  return 1;  // COMPOSED — resting, unfazed
  if (bpm < 83)  return 2;  // AWARE — mild pressure registering
  if (bpm < 95)  return 3;  // TENSE — stress is visible
  if (bpm < 112) return 4;  // STRESSED — notable elevation
  return 5;                  // OVERLOADED — maximum cognitive stress
}

export function getZoneColor(zone: HRZone): string {
  switch (zone) {
    case 1: return '#05B9F0'; // q-Blue — calm, trustworthy
    case 2: return '#9CA3AF'; // q-Graphite light — aware, neutral
    case 3: return '#7536F0'; // q-Violet — tension, pressure
    case 4: return '#FF4200'; // q-Orange — urgency (Quadient brand)
    case 5: return '#CC3400'; // q-Orange accessible — maximum stress
  }
}

export function getZoneLabel(zone: HRZone): string {
  switch (zone) {
    case 1: return 'COMPOSED';
    case 2: return 'AWARE';
    case 3: return 'TENSE';
    case 4: return 'STRESSED';
    case 5: return 'OVERLOADED';
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
