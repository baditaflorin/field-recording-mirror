import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MIRROR_SETTINGS,
  clampSettings,
  semitonesToRatio,
  captureSampleCount,
  rms,
} from '../src/audio/transformations.js';

describe('clampSettings', () => {
  it('clamps every field to its declared range', () => {
    const out = clampSettings({
      liveGain: 2,
      slowRate: 0.2,
      slowGain: -1,
      pitchSemitones: 99,
      pitchGain: 2,
      reverbWet: -0.5,
      reverbDecay: 50,
      reverbGain: 5,
    });
    expect(out).toEqual({
      liveGain: 1,
      slowRate: 0.5,
      slowGain: 0,
      pitchSemitones: 12,
      pitchGain: 1,
      reverbWet: 0,
      reverbDecay: 8,
      reverbGain: 1,
    });
  });

  it('round-trips defaults', () => {
    expect(clampSettings(DEFAULT_MIRROR_SETTINGS)).toEqual(DEFAULT_MIRROR_SETTINGS);
  });
});

describe('semitonesToRatio', () => {
  it('returns 1 for 0 semitones', () => {
    expect(semitonesToRatio(0)).toBeCloseTo(1, 10);
  });
  it('returns 2 for 12 semitones (octave)', () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2, 10);
  });
  it('returns 0.5 for -12 semitones', () => {
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5, 10);
  });
});

describe('captureSampleCount', () => {
  it('multiplies sample rate by seconds', () => {
    expect(captureSampleCount(48000, 30)).toBe(1_440_000);
  });
  it('defaults to 30s', () => {
    expect(captureSampleCount(44100)).toBe(1_323_000);
  });
});

describe('rms', () => {
  it('returns 0 for empty input', () => {
    expect(rms(new Float32Array(0))).toBe(0);
  });
  it('returns the amplitude of a constant signal', () => {
    expect(rms(new Float32Array([0.5, 0.5, 0.5]))).toBeCloseTo(0.5, 5);
  });
  it('is symmetric around zero', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 5);
  });
});
