// Owns the microphone MediaStream and the capture AudioWorkletNode.
// Connects mic → capture-processor (writes to shared ring) and mic → engine
// input so the live monitor and the mirror graph see the same signal.

import type { SharedCapture } from './shared-capture.js';

const WORKLET_URL = new URL(
  `${import.meta.env.BASE_URL}worklets/capture-processor.js`,
  window.location.origin
).href;

export interface Recorder {
  readonly micInput: AudioNode;
  readonly sampleRate: number;
  stop(): void;
}

export async function startRecorder(
  audioContext: AudioContext,
  capture: SharedCapture
): Promise<Recorder> {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  await audioContext.audioWorklet.addModule(WORKLET_URL);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });

  const source = audioContext.createMediaStreamSource(stream);
  const captureNode = new AudioWorkletNode(audioContext, 'capture-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    processorOptions: capture.options,
  });
  source.connect(captureNode);

  return {
    micInput: source,
    sampleRate: audioContext.sampleRate,
    stop(): void {
      for (const track of stream.getTracks()) track.stop();
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
      try {
        captureNode.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}
