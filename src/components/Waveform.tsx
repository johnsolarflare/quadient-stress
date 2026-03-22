import { useRef, useEffect, useCallback } from 'react';
import { createWaveformState, addDataPoints, renderWaveform } from '../utils/waveformRenderer';
import type { WaveformState } from '../utils/waveformRenderer';

interface WaveformProps {
  bpm: number;
  isActive: boolean;
}

export function Waveform({ bpm, isActive }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<WaveformState>(createWaveformState(300));
  const animFrameRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(0);
  const bpmRef = useRef(bpm);

  // Keep bpmRef in sync so the animation loop always sees the latest value
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const animate = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const deltaMs = lastTimestampRef.current
      ? Math.min(timestamp - lastTimestampRef.current, 100) // cap at 100ms to avoid jumps
      : 16;
    lastTimestampRef.current = timestamp;

    addDataPoints(stateRef.current, bpmRef.current, deltaMs);

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Only resize when necessary to avoid layout thrash
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }

    renderWaveform(ctx, stateRef.current, rect.width, rect.height);
    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (isActive) {
      lastTimestampRef.current = 0;
      animFrameRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isActive, animate]);

  useEffect(() => {
    if (isActive && bpm === 0) {
      stateRef.current = createWaveformState(300);
    }
  }, [isActive, bpm]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', borderRadius: '12px' }}
    />
  );
}
