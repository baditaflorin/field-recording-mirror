// Live spectrogram tap. Hooks an AnalyserNode onto the live mic input,
// pulls byte frequency data each frame, and exposes a column of values
// the visualizer scrolls leftward to draw a falling-bin heatmap.
//
// Mapping: linear frequency bins from the FFT are remapped to a perceptual
// log scale, then averaged into a column of NUM_ROWS values (top = high,
// bottom = low). The visualizer turns each value into a hue/alpha.

export interface SpectrogramTap {
  readonly source: AudioNode;
  /** Pull one column of NUM_ROWS values in [0..1]. Allocates each call. */
  column(): Float32Array;
  dispose(): void;
}

export const SPECTROGRAM_ROWS = 64;

export function createSpectrogramTap(audioContext: AudioContext): SpectrogramTap {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.6;
  const bins = new Uint8Array(analyser.frequencyBinCount);

  // Pre-compute the log-spaced bin boundaries once so column() is allocation-
  // cheap and stable across calls.
  const minHz = 60;
  const maxHz = Math.min(audioContext.sampleRate / 2, 12_000);
  const hzPerBin = audioContext.sampleRate / analyser.fftSize;
  const minBin = Math.max(1, Math.floor(minHz / hzPerBin));
  const maxBin = Math.min(analyser.frequencyBinCount - 1, Math.floor(maxHz / hzPerBin));
  const logMin = Math.log(minBin);
  const logMax = Math.log(maxBin);
  const rowEdges = new Int32Array(SPECTROGRAM_ROWS + 1);
  for (let r = 0; r <= SPECTROGRAM_ROWS; r++) {
    const t = r / SPECTROGRAM_ROWS;
    rowEdges[r] = Math.round(Math.exp(logMin + t * (logMax - logMin)));
  }

  return {
    source: analyser,
    column(): Float32Array {
      analyser.getByteFrequencyData(bins);
      const out = new Float32Array(SPECTROGRAM_ROWS);
      for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
        const lo = rowEdges[r] ?? minBin;
        const hi = Math.max(lo + 1, rowEdges[r + 1] ?? lo + 1);
        let max = 0;
        for (let b = lo; b < hi; b++) {
          const v = bins[b] ?? 0;
          if (v > max) max = v;
        }
        // Reverse so row 0 (top of canvas) is the highest frequency.
        out[SPECTROGRAM_ROWS - 1 - r] = max / 255;
      }
      return out;
    },
    dispose(): void {
      try {
        analyser.disconnect();
      } catch {
        /* not connected */
      }
    },
  };
}
