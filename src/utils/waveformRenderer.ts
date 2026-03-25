import { getHRZone, getZoneColor } from '../types';

export interface WaveformState {
  dataPoints: number[];
  maxPoints: number;
  currentBPM: number;
  phaseAccumulator: number;
  // Per-beat variation
  beatAmplitudeScale: number;
  // Flash on R-peak
  msSinceLastPeak: number;
  pointsSincePeak: number;
  // Baseline wander
  wanderPhase: number;
}

export function createWaveformState(maxPoints = 300): WaveformState {
  return {
    dataPoints: [],
    maxPoints,
    currentBPM: 0,
    phaseAccumulator: 0,
    beatAmplitudeScale: 1.0,
    msSinceLastPeak: 9999,
    pointsSincePeak: 9999,
    wanderPhase: 0,
  };
}

export function addDataPoints(state: WaveformState, bpm: number, deltaMs: number): void {
  state.currentBPM = bpm;
  const effectiveBPM = bpm > 0 ? bpm : 70;

  // Fixed scroll: 90 pts/sec → one full canvas width in ~3.3s
  const SCROLL_PPS = 90;
  const pointsToAdd = Math.round((SCROLL_PPS * deltaMs) / 1000);

  const beatsPerSec = effectiveBPM / 60;
  const totalPhase = beatsPerSec * 2 * Math.PI * (deltaMs / 1000);
  const phasePerPoint = pointsToAdd > 0 ? totalPhase / pointsToAdd : 0;

  // Advance wander (one cycle every ~25 seconds)
  state.wanderPhase += deltaMs * 0.00025;
  state.msSinceLastPeak += deltaMs;

  for (let i = 0; i < pointsToAdd; i++) {
    const prevNorm = ((state.phaseAccumulator % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
    state.phaseAccumulator += phasePerPoint;
    const newNorm = ((state.phaseAccumulator % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);

    // Detect R-peak crossing (phase ≈ 0.225 in normalised cycle)
    const crossedPeak = (prevNorm < 0.225 && newNorm >= 0.225) ||
                        (prevNorm > 0.9 && newNorm < 0.1); // wrap-around safety
    if (crossedPeak) {
      state.msSinceLastPeak = 0;
      state.pointsSincePeak = 0;
      // Slight beat-to-beat amplitude variation ±12%
      state.beatAmplitudeScale = 0.88 + Math.random() * 0.24;
    }

    // Subtle baseline wander
    const wander = Math.sin(state.wanderPhase) * 0.025;
    const value = generateECGWave(state.phaseAccumulator) * state.beatAmplitudeScale + wander;

    state.dataPoints.push(value);
    if (state.pointsSincePeak < 99999) state.pointsSincePeak++;
    if (state.dataPoints.length > state.maxPoints) {
      state.dataPoints.shift();
    }
  }
}

export function addDataPoint(state: WaveformState, bpm: number): void {
  addDataPoints(state, bpm, 250);
}

// Sharp ECG morphology: P → Q → R-spike → S → T
function generateECGWave(phase: number): number {
  const t = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const n = t / (Math.PI * 2);

  // P wave
  if (n < 0.10) return 0.12 * Math.sin((n / 0.10) * Math.PI);
  if (n < 0.16) return 0;
  // Q dip
  if (n < 0.19) return -0.20 * Math.sin(((n - 0.16) / 0.03) * Math.PI);
  // R peak — sharp triangle
  if (n < 0.28) {
    const center = 0.225;
    const halfW = 0.055;
    return 1.0 * Math.max(0, 1 - Math.abs(n - center) / halfW);
  }
  // S dip
  if (n < 0.33) return -0.30 * Math.sin(((n - 0.28) / 0.05) * Math.PI);
  if (n < 0.42) return 0;
  // T wave
  if (n < 0.60) return 0.28 * Math.sin(((n - 0.42) / 0.18) * Math.PI);
  return 0;
}

export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  state: WaveformState,
  width: number,
  height: number
): void {
  const dpr = window.devicePixelRatio || 1;
  const W = width * dpr;
  const H = height * dpr;

  ctx.clearRect(0, 0, W, H);

  const zone = getHRZone(state.currentBPM);
  const color = getZoneColor(zone);

  // Background — q-Graphite panel keeps waveform dramatic on the light UI
  ctx.fillStyle = '#374151';
  ctx.fillRect(0, 0, W, H);

  // Very subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  const gs = 40 * dpr;
  for (let x = gs; x < W; x += gs) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = gs; y < H; y += gs) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  if (state.dataPoints.length < 2) return;

  const centerY = H / 2;
  const amplitude = H * 0.40;
  const pointWidth = W / state.maxPoints;
  const startIndex = state.maxPoints - state.dataPoints.length;

  // Smooth gradient: history fades in gradually over the full trail width
  const trailStart = startIndex * pointWidth;
  const tipX = (startIndex + state.dataPoints.length - 1) * pointWidth;

  const lineGrad = ctx.createLinearGradient(trailStart, 0, tipX, 0);
  lineGrad.addColorStop(0,    'rgba(0,0,0,0)');
  lineGrad.addColorStop(0.08, color + '33');
  lineGrad.addColorStop(0.25, color + '88');
  lineGrad.addColorStop(0.50, color + 'CC');
  lineGrad.addColorStop(1.0,  color);

  const glowGrad = ctx.createLinearGradient(trailStart, 0, tipX, 0);
  glowGrad.addColorStop(0,    'rgba(0,0,0,0)');
  glowGrad.addColorStop(0.10, color + '15');
  glowGrad.addColorStop(0.35, color + '40');
  glowGrad.addColorStop(1.0,  color + '70');

  // Build path helper
  const buildPath = () => {
    ctx.beginPath();
    for (let i = 0; i < state.dataPoints.length; i++) {
      const x = (startIndex + i) * pointWidth;
      const y = centerY - state.dataPoints[i] * amplitude;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  };

  // Wide soft glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16 * dpr;
  ctx.strokeStyle = glowGrad;
  ctx.lineWidth = 9 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  buildPath();
  ctx.stroke();
  ctx.restore();

  // Crisp line — miter preserves peak angles
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 3 * dpr;
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2 * dpr;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 20;
  ctx.lineCap = 'butt';
  buildPath();
  ctx.stroke();
  ctx.restore();
}
