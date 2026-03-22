import type { HRReading, ConnectionState, DataSourceInterface } from '../types';

type DummyMode = 'autoplay' | 'keyboard';

export class DummyDataService implements DataSourceInterface {
  private intervalId: number | null = null;
  private startTime = 0;
  private targetBPM = 70;
  private currentBPM = 70;
  private mode: DummyMode = 'autoplay';
  private keyboardOverrideTimeout: number | null = null;
  private paused = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  onReading: ((reading: HRReading) => void) | null = null;
  onConnectionChange: ((state: ConnectionState) => void) | null = null;
  onBatteryUpdate: ((level: number) => void) | null = null;

  start(): void {
    // Clean up any existing state first (safe to call multiple times)
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }

    this.startTime = Date.now();
    this.currentBPM = 67;
    this.targetBPM = 67;
    this.mode = 'autoplay';
    this.paused = false;

    this.onConnectionChange?.('connected');
    this.onBatteryUpdate?.(85);

    this.keyHandler = this.handleKeyboard.bind(this);
    window.addEventListener('keydown', this.keyHandler);

    // 250ms interval — 4 readings/sec for smooth BPM tracking
    this.intervalId = window.setInterval(() => {
      if (this.paused) return;

      if (this.mode === 'autoplay') {
        this.updateAutoplayTarget();
      }

      // Smooth interpolation — 0.04/tick @ 250ms ≈ same feel as 0.15/tick @ 1000ms
      const diff = this.targetBPM - this.currentBPM;
      this.currentBPM += diff * 0.04;

      // Realistic HRV noise: ±2–3 BPM (Polar H10 at rest/mild stress)
      const noise = (Math.random() - 0.5) * 5;
      const bpm = Math.round(Math.max(45, Math.min(200, this.currentBPM + noise)));

      const reading: HRReading = {
        bpm,
        timestamp: Date.now(),
      };

      this.onReading?.(reading);
    }, 250);
  }

  private updateAutoplayTarget(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const cycleDuration = 180; // 3-minute cycle
    const phase = elapsed % cycleDuration;

    if (phase < 25) {
      // Settled at rest — COMPOSED (65–70 BPM)
      this.targetBPM = 67 + Math.sin(elapsed * 0.08) * 2;
    } else if (phase < 55) {
      // Task begins — anticipation rise into AWARE (68–80 BPM)
      const progress = (phase - 25) / 30;
      this.targetBPM = 68 + progress * 14 + Math.sin(elapsed * 0.15) * 2;
    } else if (phase < 110) {
      // Time pressure building — TENSE zone (80–93 BPM), occasional micro-spikes
      const progress = (phase - 55) / 55;
      this.targetBPM = 82 + progress * 11 + Math.sin(elapsed * 0.2) * 3;
      if (Math.random() < 0.03) this.targetBPM += 6; // brief startle
    } else if (phase < 145) {
      // Peak cognitive load — STRESSED (93–106 BPM)
      this.targetBPM = 93 + Math.sin(elapsed * 0.3) * 7 + 6;
      if (Math.random() < 0.02) this.targetBPM += 8; // stress spike
    } else {
      // Recovery — gradual descent back to COMPOSED
      const progress = (phase - 145) / 35;
      this.targetBPM = 105 - progress * 37 + Math.sin(elapsed * 0.1) * 2;
    }
  }

  private handleKeyboard(e: KeyboardEvent): void {
    // Don't capture keys when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.targetBPM = Math.min(200, this.targetBPM + 5);
        this.switchToKeyboardMode();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.targetBPM = Math.max(45, this.targetBPM - 5);
        this.switchToKeyboardMode();
        break;
      case ' ':
        e.preventDefault();
        this.paused = !this.paused;
        break;
      case 'r':
      case 'R':
        this.targetBPM = 70;
        this.switchToKeyboardMode();
        break;
      case 'x':
      case 'X':
        // Sudden spike (remapped from S to avoid conflict with secret W/S operator keys)
        this.targetBPM = Math.min(200, this.currentBPM + 40);
        this.switchToKeyboardMode();
        break;
    }
  }

  private switchToKeyboardMode(): void {
    this.mode = 'keyboard';
    if (this.keyboardOverrideTimeout) {
      clearTimeout(this.keyboardOverrideTimeout);
    }
    this.keyboardOverrideTimeout = window.setTimeout(() => {
      this.mode = 'autoplay';
      this.startTime = Date.now(); // Reset cycle
      this.keyboardOverrideTimeout = null;
    }, 5000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.keyboardOverrideTimeout) {
      clearTimeout(this.keyboardOverrideTimeout);
    }
    this.onConnectionChange?.('disconnected');
  }
}
