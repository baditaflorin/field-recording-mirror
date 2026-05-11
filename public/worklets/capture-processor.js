// AudioWorkletProcessor that copies incoming mic samples into a shared ring
// buffer. The main thread allocates two SharedArrayBuffers and sends them via
// processorOptions; we write through the same memory.
//
// Layout of `sharedState` (Int32Array):
//   [0] = next write index (mod capacity)
//   [1] = filled flag (0 = not yet wrapped, 1 = ring has held a full window)

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { sharedAudio, sharedState, capacity } = options.processorOptions;
    this.audio = new Float32Array(sharedAudio);
    this.state = new Int32Array(sharedState);
    this.capacity = capacity;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channelCount = input.length;
    const ch0 = input[0];
    if (!ch0) return true;
    const frames = ch0.length;
    if (frames === 0) return true;

    let writeIndex = Atomics.load(this.state, 0);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < channelCount; c++) {
        sum += input[c][i] ?? 0;
      }
      this.audio[writeIndex] = sum / channelCount;
      writeIndex++;
      if (writeIndex >= this.capacity) {
        writeIndex = 0;
        Atomics.store(this.state, 1, 1);
      }
    }
    Atomics.store(this.state, 0, writeIndex);
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
