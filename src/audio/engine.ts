// High-level audio engine. Owns the AudioContext, the SharedCapture ring,
// the Recorder, and the MirrorGraph. The UI talks to this, not to the
// individual pieces.

import type { Recorder } from './recorder.js';
import type { MirrorGraph } from './mirror-graph.js';
import type { MirrorSettings } from './transformations.js';
import { DEFAULT_MIRROR_SETTINGS, captureSampleCount, rms } from './transformations.js';
import { createSharedCapture, type SharedCapture } from './shared-capture.js';
import { startRecorder } from './recorder.js';
import { createMirrorGraph } from './mirror-graph.js';

export const CAPTURE_SECONDS = 30;

export interface EngineEvents {
  onElapsed: (seconds: number) => void;
  onLevel: (rmsLevel: number) => void;
  onMirrorStateChange: (mirroring: boolean) => void;
  onError: (error: Error) => void;
}

export interface Engine {
  start(): Promise<void>;
  stop(): Promise<void>;
  beginMirror(): void;
  endMirror(): void;
  apply(settings: MirrorSettings): void;
  snapshot(): Float32Array | null;
  isRunning(): boolean;
  isMirroring(): boolean;
  sampleRate(): number;
  captureSeconds(): number;
}

export function createEngine(events: Partial<EngineEvents> = {}): Engine {
  let audioContext: AudioContext | null = null;
  let capture: SharedCapture | null = null;
  let recorder: Recorder | null = null;
  let mirror: MirrorGraph | null = null;
  let running = false;
  let settings = DEFAULT_MIRROR_SETTINGS;
  let levelInterval: number | null = null;

  function safe<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (e) {
      events.onError?.(e instanceof Error ? e : new Error(String(e)));
      return fallback;
    }
  }

  return {
    async start(): Promise<void> {
      if (running) return;
      audioContext = new AudioContext();
      const sr = audioContext.sampleRate;
      capture = createSharedCapture(captureSampleCount(sr, CAPTURE_SECONDS));
      try {
        recorder = await startRecorder(audioContext, capture);
      } catch (e) {
        await audioContext.close();
        audioContext = null;
        capture = null;
        throw e;
      }
      mirror = createMirrorGraph(audioContext);
      mirror.connectLive(recorder.micInput);
      mirror.apply(settings);
      running = true;

      levelInterval = window.setInterval(() => {
        if (!capture || !audioContext) return;
        events.onElapsed?.(capture.elapsedSeconds(audioContext.sampleRate));
        const samples = capture.snapshot();
        // Use only the last ~50ms for the meter so it tracks "now".
        const window = samples.length > 2400 ? samples.subarray(samples.length - 2400) : samples;
        events.onLevel?.(rms(window));
      }, 100);
    },
    async stop(): Promise<void> {
      if (!running) return;
      if (levelInterval !== null) {
        window.clearInterval(levelInterval);
        levelInterval = null;
      }
      mirror?.stopMirror();
      mirror?.dispose();
      mirror = null;
      recorder?.stop();
      recorder = null;
      await audioContext?.close();
      audioContext = null;
      capture = null;
      running = false;
      events.onMirrorStateChange?.(false);
    },
    beginMirror(): void {
      if (!running || !mirror || !capture || !audioContext) return;
      const samples = capture.snapshot();
      if (samples.length === 0) return;
      mirror.setBuffer(samples, audioContext.sampleRate);
      mirror.startMirror();
      events.onMirrorStateChange?.(true);
    },
    endMirror(): void {
      if (!mirror) return;
      mirror.stopMirror();
      events.onMirrorStateChange?.(false);
    },
    apply(next: MirrorSettings): void {
      settings = next;
      safe(() => mirror?.apply(next), undefined);
    },
    snapshot(): Float32Array | null {
      return capture?.snapshot() ?? null;
    },
    isRunning(): boolean {
      return running;
    },
    isMirroring(): boolean {
      return mirror?.isMirroring() ?? false;
    },
    sampleRate(): number {
      return audioContext?.sampleRate ?? 0;
    },
    captureSeconds(): number {
      return CAPTURE_SECONDS;
    },
  };
}
