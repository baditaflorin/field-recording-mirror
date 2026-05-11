import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MIRROR_SETTINGS,
  clampSettings,
  semitonesToRatio,
  captureSampleCount,
  rms,
  type MirrorSettings,
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
      freezeGrainSize: 10,
      freezeSemitones: -99,
      freezeGain: 2,
      captureMode: 'rolling',
      channels: 2,
      spectrogram: true,
    });
    expect(out.liveGain).toBe(1);
    expect(out.slowRate).toBe(0.5);
    expect(out.slowGain).toBe(0);
    expect(out.pitchSemitones).toBe(12);
    expect(out.pitchGain).toBe(1);
    expect(out.reverbWet).toBe(0);
    expect(out.reverbDecay).toBe(8);
    expect(out.reverbGain).toBe(1);
    expect(out.freezeGrainSize).toBe(2);
    expect(out.freezeSemitones).toBe(-12);
    expect(out.freezeGain).toBe(1);
  });

  it('normalises captureMode to a valid literal', () => {
    const out = clampSettings({
      ...DEFAULT_MIRROR_SETTINGS,
      captureMode: 'weird' as unknown as MirrorSettings['captureMode'],
    });
    expect(out.captureMode).toBe('rolling');
    expect(clampSettings({ ...DEFAULT_MIRROR_SETTINGS, captureMode: 'locked' }).captureMode).toBe(
      'locked'
    );
  });

  it('normalises channels to 1 or 2', () => {
    expect(
      clampSettings({
        ...DEFAULT_MIRROR_SETTINGS,
        channels: 4 as unknown as MirrorSettings['channels'],
      }).channels
    ).toBe(2);
    expect(
      clampSettings({
        ...DEFAULT_MIRROR_SETTINGS,
        channels: 1,
      }).channels
    ).toBe(1);
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
