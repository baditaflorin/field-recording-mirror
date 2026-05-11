// AudioWorkletProcessor that captures up to two channels of microphone audio
// into a shared ring buffer. The main thread allocates two SharedArrayBuffers
// and sends them via processorOptions; we write through the same memory.
//
// Channel layout in `sharedAudio` (Float32Array):
//   channel 0 occupies [0 .. capacity)
//   channel 1 occupies [capacity .. 2*capacity)  (when channels === 2)
//   one shared writeIndex advances per frame
//
// `sharedState` (Int32Array):
//   [0] = next write index (mod capacity)
//   [1] = filled flag (0 = not yet wrapped, 1 = ring has held a full window)
//   [2] = level-meter sample, fixed-point uint16 (peak abs * 65535)

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { sharedAudio, sharedState, capacity, channels } = options.processorOptions;
    this.audio = new Float32Array(sharedAudio);
    this.state = new Int32Array(sharedState);
    this.capacity = capacity;
    this.channels = channels;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    if (!ch0) return true;
    const ch1 = input[1] ?? ch0; // mono source → duplicate
    const frames = ch0.length;
    if (frames === 0) return true;

    let writeIndex = Atomics.load(this.state, 0);
    const ch1Offset = this.capacity;
    let peak = 0;

    if (this.channels === 1) {
      for (let i = 0; i < frames; i++) {
        const v = (ch0[i] + ch1[i]) * 0.5;
        this.audio[writeIndex] = v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        writeIndex++;
        if (writeIndex >= this.capacity) {
          writeIndex = 0;
          Atomics.store(this.state, 1, 1);
        }
      }
    } else {
      for (let i = 0; i < frames; i++) {
        const l = ch0[i];
        const r = ch1[i];
        this.audio[writeIndex] = l;
        this.audio[ch1Offset + writeIndex] = r;
        const a = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
        if (a > peak) peak = a;
        writeIndex++;
        if (writeIndex >= this.capacity) {
          writeIndex = 0;
          Atomics.store(this.state, 1, 1);
        }
      }
    }
    Atomics.store(this.state, 0, writeIndex);
    Atomics.store(this.state, 2, Math.min(65535, Math.round(peak * 65535)));
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
