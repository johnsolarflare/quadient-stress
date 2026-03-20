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
    this.currentBPM = 70;
    this.targetBPM = 70;
    this.mode = 'autoplay';
    this.paused = false;

    this.onConnectionChange?.('connected');
    this.onBatteryUpdate?.(85);

    this.keyHandler = this.handleKeyboard.bind(this);
    window.addEventListener('keydown', this.keyHandler);

    this.intervalId = window.setInterval(() => {
      if (this.paused) return;

      if (this.mode === 'autoplay') {
        this.updateAutoplayTarget();
      }

      // Smooth interpolation toward target
      const diff = this.targetBPM - this.currentBPM;
      this.currentBPM += diff * 0.15;

      // Add realistic noise
      const noise = (Math.random() - 0.5) * 6;
      const bpm = Math.round(Math.max(45, Math.min(200, this.currentBPM + noise)));

      const reading: HRReading = {
        bpm,
        timestamp: Date.now(),
      };

      this.onReading?.(reading);
    }, 1000);
  }

  private updateAutoplayTarget(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const cycleDuration = 180; // 3-minute cycle
    const phase = elapsed % cycleDuration;

    if (phase < 30) {
      // Baseline: calm resting
      this.targetBPM = 68 + Math.sin(elapsed * 0.1) * 3;
    } else if (phase < 60) {
      // Anticipation: gradual rise
      const progress = (phase - 30) / 30;
      this.targetBPM = 70 + progress * 25;
    } else if (phase < 120) {
      // Stress onset: rising with spikes
      const progress = (phase - 60) / 60;
      this.targetBPM = 95 + progress * 45;
      // Random spikes
      if (Math.random() < 0.1) {
        this.targetBPM += 15;
      }
    } else if (phase < 150) {
      // Peak stress
      this.targetBPM = 145 + Math.sin(elapsed * 0.5) * 15;
      if (Math.random() < 0.15) {
        this.targetBPM += 20;
      }
    } else {
      // Recovery
      const progress = (phase - 150) / 30;
      this.targetBPM = 155 - progress * 75;
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
