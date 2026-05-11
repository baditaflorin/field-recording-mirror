// Paints, in order from back to front:
//   1. Scrolling spectrogram (mel-ish bins, leftward scroll) — when enabled
//   2. Mirror waveform (pink, dimmer) — the snapshot the engine is looping
//   3. Live waveform (cyan, brighter) — the most recent ~40 ms tail
// Stereo: left channel on top, right on bottom, mirrored around the centre.

import { SPECTROGRAM_ROWS } from '../audio/spectrogram.js';
import type { StereoSnapshot } from '../audio/shared-capture.js';

export interface Visualizer {
  pushSpectrogramColumn(column: Float32Array): void;
  setSpectrogramEnabled(enabled: boolean): void;
  render(live: StereoSnapshot | null, mirror: StereoSnapshot | null): void;
  resize(): void;
  dispose(): void;
}

export function createVisualizer(canvas: HTMLCanvasElement): Visualizer {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let width = 0;
  let height = 0;
  let spectrogramCols: Float32Array[] = [];
  let spectrogramEnabled = true;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    width = canvas.width;
    height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawSpectrogram(): void {
    if (!spectrogramEnabled || spectrogramCols.length === 0) return;
    const cols = Math.min(spectrogramCols.length, width);
    const colWidth = width / cols;
    const rowHeight = height / SPECTROGRAM_ROWS;
    for (let c = 0; c < cols; c++) {
      const col = spectrogramCols[spectrogramCols.length - cols + c];
      if (!col) continue;
      const x = c * colWidth;
      for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
        const v = col[r] ?? 0;
        if (v <= 0.05) continue;
        const alpha = Math.min(0.55, v * 0.7);
        // Hue sweeps from accent (cyan ~190) at the top to accent-2 (pink ~330)
        // at the bottom, so it reads as "warm low → cool high" inverted.
        const hue = 190 + (1 - r / SPECTROGRAM_ROWS) * 140;
        ctx.fillStyle = `hsla(${hue.toFixed(0)}, 80%, 60%, ${alpha.toFixed(3)})`;
        ctx.fillRect(x, r * rowHeight, colWidth + 0.5, rowHeight + 0.5);
      }
    }
  }

  function drawStereoWave(
    snap: StereoSnapshot,
    colour: string,
    alpha: number,
    lineWidth: number
  ): void {
    const halfHeight = height / 2;
    drawChannel(snap.left, 0, halfHeight, colour, alpha, lineWidth);
    drawChannel(snap.right, halfHeight, halfHeight, colour, alpha, lineWidth);
  }

  function drawChannel(
    samples: Float32Array,
    yTop: number,
    h: number,
    colour: string,
    alpha: number,
    lineWidth: number
  ): void {
    if (samples.length === 0) return;
    ctx.beginPath();
    ctx.strokeStyle = colour;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth;
    const step = Math.max(1, Math.floor(samples.length / width));
    const mid = yTop + h / 2;
    const amp = h * 0.45;
    for (let x = 0; x < width; x++) {
      const start = x * step;
      let peak = 0;
      const end = Math.min(samples.length, start + step);
      for (let i = start; i < end; i++) {
        const v = samples[i] ?? 0;
        if (Math.abs(v) > Math.abs(peak)) peak = v;
      }
      const y = mid - peak * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  return {
    pushSpectrogramColumn(column): void {
      spectrogramCols.push(column);
      if (spectrogramCols.length > 600) {
        spectrogramCols = spectrogramCols.slice(-400);
      }
    },
    setSpectrogramEnabled(enabled): void {
      spectrogramEnabled = enabled;
      if (!enabled) spectrogramCols = [];
    },
    render(live, mirror): void {
      if (width === 0) resize();
      ctx.clearRect(0, 0, width, height);
      drawSpectrogram();

      // Mid-axis lines for left and right channel.
      ctx.strokeStyle = 'rgba(158, 236, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 4);
      ctx.lineTo(width, height / 4);
      ctx.moveTo(0, (height * 3) / 4);
      ctx.lineTo(width, (height * 3) / 4);
      ctx.stroke();

      if (mirror) drawStereoWave(mirror, '#ff9ec4', 0.7, 1);
      if (live) drawStereoWave(live, '#9eecff', 0.95, 1.2);
    },
    resize,
    dispose(): void {
      spectrogramCols = [];
    },
  };
}
