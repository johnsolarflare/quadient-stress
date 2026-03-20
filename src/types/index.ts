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
