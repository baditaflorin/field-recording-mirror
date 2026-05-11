// A fixed-size circular buffer for Float32 audio samples.
// Pure logic, fully testable without Web Audio. The AudioWorklet writes into
// an instance of this on the audio thread; the main thread reads a contiguous
// snapshot via `snapshot()` whenever it needs the "last 30 seconds".
export class Float32RingBuffer {
  private readonly buffer: Float32Array;
  private writeIndex = 0;
  private filled = false;

  constructor(public readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    }
    this.buffer = new Float32Array(capacity);
  }

  /** Append a chunk; old samples are overwritten once capacity is reached. */
  write(chunk: Float32Array): void {
    const n = chunk.length;
    if (n === 0) return;

    if (n >= this.capacity) {
      // The new chunk is bigger than the ring — keep only its tail.
      this.buffer.set(chunk.subarray(n - this.capacity), 0);
      this.writeIndex = 0;
      this.filled = true;
      return;
    }

    const end = this.writeIndex + n;
    if (end <= this.capacity) {
      this.buffer.set(chunk, this.writeIndex);
    } else {
      const firstPart = this.capacity - this.writeIndex;
      this.buffer.set(chunk.subarray(0, firstPart), this.writeIndex);
      this.buffer.set(chunk.subarray(firstPart), 0);
    }
    this.writeIndex = end % this.capacity;
    if (end >= this.capacity) this.filled = true;
  }

  /** Returns the buffer in time order (oldest first). Always a fresh copy. */
  snapshot(): Float32Array {
    const out = new Float32Array(this.capacity);
    if (!this.filled) {
      out.set(this.buffer.subarray(0, this.writeIndex), 0);
      return out.subarray(0, this.writeIndex);
    }
    const tail = this.buffer.subarray(this.writeIndex);
    const head = this.buffer.subarray(0, this.writeIndex);
    out.set(tail, 0);
    out.set(head, tail.length);
    return out;
  }

  /** How many valid samples are currently stored (0 .. capacity). */
  get length(): number {
    return this.filled ? this.capacity : this.writeIndex;
  }

  /** True once the ring has wrapped — i.e. the buffer holds a full window. */
  get isFull(): boolean {
    return this.filled;
  }

  reset(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.filled = false;
  }
}
