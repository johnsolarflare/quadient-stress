import { getHRZone, getZoneColor } from '../types';

export interface WaveformState {
  dataPoints: number[];
  maxPoints: number;
  currentBPM: number;
  phaseAccumulator: number;
}

export function createWaveformState(maxPoints = 300): WaveformState {
  return {
    dataPoints: [],
    maxPoints,
    currentBPM: 0,
    phaseAccumulator: 0,
  };
}

export function addDataPoint(state: WaveformState, bpm: number): void {
  state.currentBPM = bpm;

  // Generate multiple waveform points per BPM reading for smooth scrolling
  // At 60fps with 1 reading/sec, we need ~60 points per reading
  const pointsPerReading = 4;
  const beatsPerSecond = bpm / 60;
  const phaseIncrement = (beatsPerSecond * Math.PI * 2) / pointsPerReading;

  for (let i = 0; i < pointsPerReading; i++) {
    state.phaseAccumulator += phaseIncrement;
    const ecgValue = generateECGWave(state.phaseAccumulator);
    state.dataPoints.push(ecgValue);

    if (state.dataPoints.length > state.maxPoints) {
      state.dataPoints.shift();
    }
  }
}

// Generate an ECG-like waveform from a phase value
function generateECGWave(phase: number): number {
  const t = phase % (Math.PI * 2);
  const normalized = t / (Math.PI * 2);

  // P wave (small bump)
  if (normalized < 0.1) {
    return 0.15 * Math.sin(normalized * Math.PI / 0.1);
  }
  // PR segment (flat)
  if (normalized < 0.15) {
    return 0;
  }
  // Q dip
  if (normalized < 0.18) {
    const local = (normalized - 0.15) / 0.03;
    return -0.15 * Math.sin(local * Math.PI);
  }
  // R peak (sharp spike)
  if (normalized < 0.25) {
    const local = (normalized - 0.18) / 0.07;
    return 1.0 * Math.sin(local * Math.PI);
  }
  // S dip
  if (normalized < 0.30) {
    const local = (normalized - 0.25) / 0.05;
    return -0.25 * Math.sin(local * Math.PI);
  }
  // ST segment
  if (normalized < 0.4) {
    return 0;
  }
  // T wave (broader bump)
  if (normalized < 0.55) {
    const local = (normalized - 0.4) / 0.15;
    return 0.25 * Math.sin(local * Math.PI);
  }
  // Baseline
  return 0;
}

export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  state: WaveformState,
  width: number,
  height: number
): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, width * dpr, height * dpr);

  const zone = getHRZone(state.currentBPM);
  const color = getZoneColor(zone);

  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, width * dpr, height * dpr);

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const gridSpacing = 40 * dpr;
  for (let x = 0; x < width * dpr; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height * dpr);
    ctx.stroke();
  }
  for (let y = 0; y < height * dpr; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width * dpr, y);
    ctx.stroke();
  }

  if (state.dataPoints.length < 2) return;

  const centerY = (height * dpr) / 2;
  const amplitude = (height * dpr) * 0.35;
  const pointWidth = (width * dpr) / state.maxPoints;

  // Glow effect
  ctx.shadowColor = color;
  ctx.shadowBlur = 20 * dpr;

  // Main waveform line
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  const startIndex = state.maxPoints - state.dataPoints.length;
  for (let i = 0; i < state.dataPoints.length; i++) {
    const x = (startIndex + i) * pointWidth;
    const y = centerY - state.dataPoints[i] * amplitude;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Leading dot
  if (state.dataPoints.length > 0) {
    const lastX = (startIndex + state.dataPoints.length - 1) * pointWidth;
    const lastY = centerY - state.dataPoints[state.dataPoints.length - 1] * amplitude;

    ctx.shadowBlur = 30 * dpr;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;

  // Fade-in gradient on left edge
  const fadeGrad = ctx.createLinearGradient(0, 0, 80 * dpr, 0);
  fadeGrad.addColorStop(0, '#0a0a0f');
  fadeGrad.addColorStop(1, 'rgba(10, 10, 15, 0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, 0, 80 * dpr, height * dpr);
}
