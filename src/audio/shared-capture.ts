// Main-thread shim around the shared ring buffer that the capture-processor
// AudioWorklet writes into. Owns the SharedArrayBuffers and exposes a
// snapshot() that returns the "last N seconds" in time order.
//
// Layout is channel-major: channel 0 occupies the first `capacity` floats,
// channel 1 the next `capacity`. `state[2]` carries a uint16 peak level for
// the meter, written each callback by the worklet.

export interface StereoSnapshot {
  left: Float32Array;
  right: Float32Array;
}

export interface SharedCapture {
  /** Pass into the AudioWorkletNode's processorOptions. */
  readonly options: {
    sharedAudio: SharedArrayBuffer;
    sharedState: SharedArrayBuffer;
    capacity: number;
    channels: number;
  };
  readonly channels: number;
  /** Returns a fresh stereo copy, oldest sample first. */
  snapshot(): StereoSnapshot;
  /** Most recent peak (0..1), set by the worklet every render quantum. */
  peak(): number;
  /** Number of valid samples currently in the ring per channel. */
  length(): number;
  /** True once the ring has wrapped — buffer holds a full window. */
  isFull(): boolean;
  /** Approximate elapsed capture time in seconds. */
  elapsedSeconds(sampleRate: number): number;
  /** Zero the ring; the next snapshot is empty again. */
  reset(): void;
}

export function createSharedCapture(capacity: number, channels: number): SharedCapture {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
  }
  if (channels !== 1 && channels !== 2) {
    throw new RangeError(`channels must be 1 or 2, got ${channels}`);
  }
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'SharedArrayBuffer is unavailable — this page is not cross-origin-isolated. ' +
        'On GitHub Pages the coi-serviceworker shim must have registered first.'
    );
  }
  const sharedAudio = new SharedArrayBuffer(channels * capacity * Float32Array.BYTES_PER_ELEMENT);
  const sharedState = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT);
  const audio = new Float32Array(sharedAudio);
  const state = new Int32Array(sharedState);

  function copyChannel(offset: number, writeIndex: number, filled: boolean): Float32Array {
    if (!filled) {
      const out = new Float32Array(writeIndex);
      out.set(audio.subarray(offset, offset + writeIndex));
      return out;
    }
    const out = new Float32Array(capacity);
    const tail = audio.subarray(offset + writeIndex, offset + capacity);
    out.set(tail, 0);
    out.set(audio.subarray(offset, offset + writeIndex), tail.length);
    return out;
  }

  return {
    options: { sharedAudio, sharedState, capacity, channels },
    channels,
    snapshot(): StereoSnapshot {
      const writeIndex = Atomics.load(state, 0);
      const filled = Atomics.load(state, 1) === 1;
      const left = copyChannel(0, writeIndex, filled);
      const right = channels === 2 ? copyChannel(capacity, writeIndex, filled) : left;
      return { left, right };
    },
    peak(): number {
      return Atomics.load(state, 2) / 65535;
    },
    length(): number {
      const filled = Atomics.load(state, 1) === 1;
      return filled ? capacity : Atomics.load(state, 0);
    },
    isFull(): boolean {
      return Atomics.load(state, 1) === 1;
    },
    elapsedSeconds(sampleRate: number): number {
      return this.length() / sampleRate;
    },
    reset(): void {
      audio.fill(0);
      Atomics.store(state, 0, 0);
      Atomics.store(state, 1, 0);
      Atomics.store(state, 2, 0);
    },
  };
}
