import { describe, it, expect } from 'vitest';
import { Float32RingBuffer } from '../src/audio/ring-buffer.js';

describe('Float32RingBuffer', () => {
  it('rejects non-positive capacities', () => {
    expect(() => new Float32RingBuffer(0)).toThrow(RangeError);
    expect(() => new Float32RingBuffer(-1)).toThrow(RangeError);
    expect(() => new Float32RingBuffer(1.5)).toThrow(RangeError);
  });

  it('returns only written samples before wrap', () => {
    const ring = new Float32RingBuffer(8);
    ring.write(new Float32Array([1, 2, 3]));
    const snap = ring.snapshot();
    expect(Array.from(snap)).toEqual([1, 2, 3]);
    expect(ring.length).toBe(3);
    expect(ring.isFull).toBe(false);
  });

  it('returns time-ordered window after wrap', () => {
    const ring = new Float32RingBuffer(4);
    ring.write(new Float32Array([1, 2, 3, 4, 5, 6]));
    expect(ring.isFull).toBe(true);
    expect(Array.from(ring.snapshot())).toEqual([3, 4, 5, 6]);
  });

  it('handles a chunk larger than capacity', () => {
    const ring = new Float32RingBuffer(3);
    ring.write(new Float32Array([1, 2, 3, 4, 5, 6, 7]));
    expect(Array.from(ring.snapshot())).toEqual([5, 6, 7]);
    expect(ring.isFull).toBe(true);
  });

  it('handles multiple wraps cleanly', () => {
    const ring = new Float32RingBuffer(3);
    ring.write(new Float32Array([1, 2]));
    ring.write(new Float32Array([3, 4]));
    ring.write(new Float32Array([5, 6, 7]));
    expect(Array.from(ring.snapshot())).toEqual([5, 6, 7]);
  });

  it('reset() empties the ring', () => {
    const ring = new Float32RingBuffer(3);
    ring.write(new Float32Array([1, 2, 3, 4]));
    ring.reset();
    expect(ring.length).toBe(0);
    expect(ring.isFull).toBe(false);
    expect(ring.snapshot().length).toBe(0);
  });

  it('ignores empty writes', () => {
    const ring = new Float32RingBuffer(4);
    ring.write(new Float32Array(0));
    expect(ring.length).toBe(0);
  });
});
