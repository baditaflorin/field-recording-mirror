// Pure-math helpers and the settings shape for the mirror chains.
// Defaults match the piece's spec: slowed 5%, pitched +1 semitone, reverbed,
// plus an opt-in granular freeze chain that sustains a tiny slice indefinitely.

import { clamp } from '../primitives/clamp.js';

export type CaptureMode = 'rolling' | 'locked';

export interface MirrorSettings {
  /** Live mic level, 0..1. Default 0.6. */
  liveGain: number;
  /** Slow chain playback rate, 0.5..1.0. Default 0.95 (slowed 5%). */
  slowRate: number;
  slowGain: number;
  /** Pitch chain shift in semitones, -12..+12. Default +1. */
  pitchSemitones: number;
  pitchGain: number;
  /** Reverb chain wet mix, 0..1. Default 0.55. Decay seconds, 0.5..8. */
  reverbWet: number;
  reverbDecay: number;
  reverbGain: number;
  /** Granular freeze chain: grain size (s), playback speed (semitones), gain. */
  freezeGrainSize: number;
  freezeSemitones: number;
  freezeGain: number;
  /** Capture: rolling ring, or one-shot locked snapshot. */
  captureMode: CaptureMode;
  /** Channels: 1 (mono) or 2 (stereo). */
  channels: 1 | 2;
  /** Whether to draw the rolling spectrogram behind the waveform. */
  spectrogram: boolean;
}

export const DEFAULT_MIRROR_SETTINGS: MirrorSettings = {
  liveGain: 0.6,
  slowRate: 0.95,
  slowGain: 0.55,
  pitchSemitones: 1,
  pitchGain: 0.55,
  reverbWet: 0.55,
  reverbDecay: 3.5,
  reverbGain: 0.5,
  freezeGrainSize: 0.2,
  freezeSemitones: 0,
  freezeGain: 0,
  captureMode: 'rolling',
  channels: 2,
  spectrogram: true,
};

export function clampSettings(s: MirrorSettings): MirrorSettings {
  const captureMode: CaptureMode = s.captureMode === 'locked' ? 'locked' : 'rolling';
  const channels: 1 | 2 = s.channels === 1 ? 1 : 2;
  return {
    liveGain: clamp(s.liveGain, 0, 1),
    slowRate: clamp(s.slowRate, 0.5, 1),
    slowGain: clamp(s.slowGain, 0, 1),
    pitchSemitones: clamp(s.pitchSemitones, -12, 12),
    pitchGain: clamp(s.pitchGain, 0, 1),
    reverbWet: clamp(s.reverbWet, 0, 1),
    reverbDecay: clamp(s.reverbDecay, 0.5, 8),
    reverbGain: clamp(s.reverbGain, 0, 1),
    freezeGrainSize: clamp(s.freezeGrainSize, 0.05, 2),
    freezeSemitones: clamp(s.freezeSemitones, -12, 12),
    freezeGain: clamp(s.freezeGain, 0, 1),
    captureMode,
    channels,
    spectrogram: s.spectrogram === true,
  };
}

/** Semitone offset → frequency ratio (12-TET). */
export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Capture window length: 30 seconds of mono Float32 at the given sample rate. */
export function captureSampleCount(sampleRate: number, seconds = 30): number {
  return Math.round(sampleRate * seconds);
}

/** RMS of a Float32 buffer, for the meter. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const v of samples) {
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}
