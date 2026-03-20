import type { HRReading, SessionData, SessionState } from '../types';
import { saveSession } from './db';

export class SessionManager {
  private state: SessionState = 'idle';
  private currentSession: SessionData | null = null;
  private readings: HRReading[] = [];

  onStateChange: ((state: SessionState) => void) | null = null;
  onStatsUpdate: ((session: SessionData) => void) | null = null;

  getState(): SessionState {
    return this.state;
  }

  getCurrentSession(): SessionData | null {
    return this.currentSession;
  }

  startSession(): void {
    if (this.state === 'active') return;

    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.currentSession = {
      id,
      startTime: Date.now(),
      readings: [],
      minHR: Infinity,
      maxHR: 0,
      avgHR: 0,
    };
    this.readings = [];
    this.state = 'active';
    this.onStateChange?.(this.state);
  }

  addReading(reading: HRReading): void {
    if (this.state !== 'active' || !this.currentSession) return;

    this.readings.push(reading);

    // Update stats
    const bpm = reading.bpm;
    if (bpm < this.currentSession.minHR) this.currentSession.minHR = bpm;
    if (bpm > this.currentSession.maxHR) {
      this.currentSession.maxHR = bpm;
      this.currentSession.peakHRTimestamp = reading.timestamp;
    }

    const sum = this.readings.reduce((s, r) => s + r.bpm, 0);
    this.currentSession.avgHR = Math.round(sum / this.readings.length);
    this.currentSession.readings = this.readings;

    this.onStatsUpdate?.({ ...this.currentSession });
  }

  async endSession(): Promise<SessionData | null> {
    if (this.state !== 'active' || !this.currentSession) return null;

    this.currentSession.endTime = Date.now();
    this.state = 'completed';

    // Fix infinity if no readings
    if (this.currentSession.minHR === Infinity) {
      this.currentSession.minHR = 0;
    }

    const session = { ...this.currentSession };

    // Persist to IndexedDB
    await saveSession(session);

    this.onStateChange?.(this.state);
    return session;
  }

  reset(): void {
    this.state = 'idle';
    this.currentSession = null;
    this.readings = [];
    this.onStateChange?.(this.state);
  }

  getElapsedSeconds(): number {
    if (!this.currentSession) return 0;
    const end = this.currentSession.endTime || Date.now();
    return Math.floor((end - this.currentSession.startTime) / 1000);
  }

  getReadingCount(): number {
    return this.readings.length;
  }
}
