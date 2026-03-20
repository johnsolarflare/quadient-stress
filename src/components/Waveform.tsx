import { useRef, useEffect, useCallback } from 'react';
import { createWaveformState, addDataPoint, renderWaveform } from '../utils/waveformRenderer';
import type { WaveformState } from '../utils/waveformRenderer';

interface WaveformProps {
  bpm: number;
  isActive: boolean;
}

export function Waveform({ bpm, isActive }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<WaveformState>(createWaveformState(300));
  const animFrameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  const animate = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Add new data points at a steady rate (roughly 4 per frame at 60fps → ~240/sec visual smoothness)
    const elapsed = timestamp - lastTickRef.current;
    if (elapsed > 250) {
      // Every 250ms, push new data points based on current BPM
      addDataPoint(stateRef.current, bpm);
      lastTickRef.current = timestamp;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    renderWaveform(ctx, stateRef.current, rect.width, rect.height);

    animFrameRef.current = requestAnimationFrame(animate);
  }, [bpm]);

  useEffect(() => {
    if (isActive) {
      lastTickRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isActive, animate]);

  // Reset waveform state when session starts
  useEffect(() => {
    if (isActive && bpm === 0) {
      stateRef.current = createWaveformState(300);
    }
  }, [isActive, bpm]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        borderRadius: '12px',
      }}
    />
  );
}
