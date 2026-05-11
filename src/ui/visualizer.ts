// Paints two overlapping waveforms on a canvas: the live mic (cyan) and the
// latest 30-second snapshot (pink). The "two slightly different versions of
// now" reading is the whole point — keep the visualization honest.

export interface Visualizer {
  render(live: Float32Array, mirror: Float32Array | null): void;
  resize(): void;
  dispose(): void;
}

export function createVisualizer(canvas: HTMLCanvasElement): Visualizer {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let width = 0;
  let height = 0;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    width = canvas.width;
    height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawWave(samples: Float32Array, colour: string, alpha: number): void {
    if (samples.length === 0) return;
    ctx.beginPath();
    ctx.strokeStyle = colour;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.2;
    const step = Math.max(1, Math.floor(samples.length / width));
    const half = height / 2;
    for (let x = 0; x < width; x++) {
      const start = x * step;
      let peak = 0;
      for (let i = 0; i < step; i++) {
        const v = samples[start + i] ?? 0;
        if (Math.abs(v) > Math.abs(peak)) peak = v;
      }
      const y = half - peak * half * 0.9;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  return {
    render(live, mirror): void {
      if (width === 0) resize();
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(158, 236, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      if (mirror) drawWave(mirror, '#ff9ec4', 0.85);
      drawWave(live, '#9eecff', 0.95);
    },
    resize,
    dispose(): void {
      /* nothing to clean up; canvas lives in DOM */
    },
  };
}
