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
    case 1: return '#05B9F0'; // q-Blue — composed, trustworthy
    case 2: return '#7536F0'; // q-Violet — aware, pressure building
    case 3: return '#FF4200'; // q-Orange — tense, urgency
    case 4: return '#CC3400'; // accessible orange-red — stressed
    case 5: return '#8B1A00'; // deep red — overloaded, maximum stress
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
 * @deprecated Use getHRZoneWithSensitivity for zone calculation instead.
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

/**
 * Determine the HR zone given a raw BPM value, sensitivity multiplier, and
 * a personalised baseline (the participant's resting HR at session start).
 *
 * All zone gaps are calculated relative to the baseline, so thresholds scale
 * with the individual — someone resting at 55 BPM reaches the same zones with
 * the same relative effort as someone resting at 85 BPM.
 *
 * At 1.0× with the default baseline of 70, thresholds match the calibrated
 * office values exactly: 72 / 83 / 95 / 112.
 *
 * Higher sensitivity compresses all zone widths uniformly (not just early ones).
 *
 *   Sensitivity │ Z1→Z2         │ Z2→Z3         │ Z3→Z4         │ Z4→Z5
 *   ────────────┼───────────────┼───────────────┼───────────────┼──────────────
 *   0.5×        │ baseline + 4  │ baseline + 26 │ baseline + 50 │ baseline + 84
 *   1.0×        │ baseline + 2  │ baseline + 13 │ baseline + 25 │ baseline + 42
 *   1.5×        │ baseline + 1  │ baseline + 9  │ baseline + 17 │ baseline + 28
 *   2.0×        │ baseline + 1  │ baseline + 7  │ baseline + 13 │ baseline + 21
 *   3.0×        │ baseline + 1  │ baseline + 4  │ baseline +  8 │ baseline + 14
 */
export function getHRZoneWithSensitivity(
  bpm: number,
  sensitivity: number,
  baseline = 70,
): HRZone {
  // Zone gaps above baseline at 1.0×, divided by sensitivity for uniform compression
  const z2 = baseline + 2  / sensitivity;  // +2  at 1.0×
  const z3 = baseline + 13 / sensitivity;  // +13 at 1.0×
  const z4 = baseline + 25 / sensitivity;  // +25 at 1.0×
  const z5 = baseline + 42 / sensitivity;  // +42 at 1.0×
  if (bpm < z2) return 1;
  if (bpm < z3) return 2;
  if (bpm < z4) return 3;
  if (bpm < z5) return 4;
  return 5;
}
