// Main-thread shim around the shared ring buffer that the capture-processor
// AudioWorklet writes into. Owns the SharedArrayBuffers and exposes a
// snapshot() that returns the "last N seconds" in time order.

import { Float32RingBuffer } from './ring-buffer.js';

export interface SharedCapture {
  /** Pass into the AudioWorkletNode's processorOptions. */
  readonly options: {
    sharedAudio: SharedArrayBuffer;
    sharedState: SharedArrayBuffer;
    capacity: number;
  };
  /** Returns a fresh copy of the captured audio, oldest sample first. */
  snapshot(): Float32Array;
  /** Number of valid samples currently in the ring. */
  length(): number;
  /** True once the ring has wrapped — buffer holds a full window. */
  isFull(): boolean;
  /** Approximate elapsed capture time in seconds. */
  elapsedSeconds(sampleRate: number): number;
  /** Zero the ring; the next snapshot is empty again. */
  reset(): void;
}

export function createSharedCapture(capacity: number): SharedCapture {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'SharedArrayBuffer is unavailable — this page is not cross-origin-isolated. ' +
        'On GitHub Pages the coi-serviceworker shim must have registered first.'
    );
  }
  const sharedAudio = new SharedArrayBuffer(capacity * Float32Array.BYTES_PER_ELEMENT);
  const sharedState = new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT);
  const audio = new Float32Array(sharedAudio);
  const state = new Int32Array(sharedState);

  return {
    options: { sharedAudio, sharedState, capacity },
    snapshot(): Float32Array {
      const writeIndex = Atomics.load(state, 0);
      const filled = Atomics.load(state, 1) === 1;
      // Reuse Float32RingBuffer's snapshot logic via a one-shot copy.
      const ring = new Float32RingBuffer(capacity);
      if (filled) {
        ring.write(audio.subarray(writeIndex));
        ring.write(audio.subarray(0, writeIndex));
      } else {
        ring.write(audio.subarray(0, writeIndex));
      }
      return ring.snapshot();
    },
    length(): number {
      const filled = Atomics.load(state, 1) === 1;
      return filled ? capacity : Atomics.load(state, 0);
    },
    isFull(): boolean {
      return Atomics.load(state, 1) === 1;
    },
    elapsedSeconds(sampleRate: number): number {
      const samples = this.length();
      return samples / sampleRate;
    },
    reset(): void {
      audio.fill(0);
      Atomics.store(state, 0, 0);
      Atomics.store(state, 1, 0);
    },
  };
}
