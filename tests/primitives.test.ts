import { describe, it, expect } from 'vitest';
import { clamp, lerp } from '../src/primitives/clamp.js';
import { ok, err } from '../src/primitives/result.js';
import { formatDuration, relativeAgo } from '../src/primitives/time.js';

describe('clamp', () => {
  it('returns value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps below min', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });
  it('clamps above max', () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('returns a at t=0', () => {
    expect(lerp(2, 8, 0)).toBe(2);
  });
  it('returns b at t=1', () => {
    expect(lerp(2, 8, 1)).toBe(8);
  });
  it('interpolates midway at t=0.5', () => {
    expect(lerp(2, 8, 0.5)).toBe(5);
  });
});

describe('Result', () => {
  it('ok wraps a value', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });
  it('err wraps an error', () => {
    const r = err(new Error('boom'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('boom');
  });
});

describe('formatDuration', () => {
  it('renders seconds with leading zero', () => {
    expect(formatDuration(5)).toBe('0:05');
  });
  it('renders minutes:seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });
  it('clamps negatives to zero', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });
});

describe('relativeAgo', () => {
  const now = new Date('2026-05-11T12:00:00Z');
  it('returns seconds', () => {
    expect(relativeAgo('2026-05-11T11:59:30Z', now)).toBe('30s ago');
  });
  it('returns minutes', () => {
    expect(relativeAgo('2026-05-11T11:30:00Z', now)).toBe('30m ago');
  });
  it('returns hours', () => {
    expect(relativeAgo('2026-05-11T08:00:00Z', now)).toBe('4h ago');
  });
  it('returns days', () => {
    expect(relativeAgo('2026-05-09T12:00:00Z', now)).toBe('2d ago');
  });
  it('handles unparseable input', () => {
    expect(relativeAgo('not-a-date', now)).toBe('unknown');
  });
});
