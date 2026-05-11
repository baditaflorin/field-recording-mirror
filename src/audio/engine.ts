// High-level audio engine. Owns the AudioContext, the SharedCapture ring,
// the Recorder, the MirrorGraph, and the live spectrogram tap. The UI talks
// to this, not to the individual pieces.

import type { Recorder } from './recorder.js';
import type { MirrorGraph } from './mirror-graph.js';
import type { MirrorSettings } from './transformations.js';
import { DEFAULT_MIRROR_SETTINGS, captureSampleCount } from './transformations.js';
import { createSharedCapture, type SharedCapture, type StereoSnapshot } from './shared-capture.js';
import { startRecorder } from './recorder.js';
import { createMirrorGraph } from './mirror-graph.js';
import { createSpectrogramTap, type SpectrogramTap } from './spectrogram.js';

export const CAPTURE_SECONDS = 30;

export interface EngineEvents {
  onElapsed: (seconds: number) => void;
  onLevel: (peak: number) => void;
  onMirrorStateChange: (mirroring: boolean) => void;
  onLockStateChange: (locked: boolean) => void;
  onSpectrogramColumn: (column: Float32Array) => void;
  onError: (error: Error) => void;
}

export interface Engine {
  start(settings: MirrorSettings): Promise<void>;
  stop(): Promise<void>;
  beginMirror(): void;
  endMirror(): void;
  lockBuffer(): void;
  releaseLock(): void;
  apply(settings: MirrorSettings): void;
  /** Returns the current visible snapshot — locked if locked, otherwise rolling. */
  visibleSnapshot(): StereoSnapshot | null;
  /** Always returns the current ring contents, ignoring lock state. */
  ringSnapshot(): StereoSnapshot | null;
  isRunning(): boolean;
  isMirroring(): boolean;
  isLocked(): boolean;
  sampleRate(): number;
  captureSeconds(): number;
  channels(): number;
}

export function createEngine(events: Partial<EngineEvents> = {}): Engine {
  let audioContext: AudioContext | null = null;
  let capture: SharedCapture | null = null;
  let recorder: Recorder | null = null;
  let mirror: MirrorGraph | null = null;
  let spectrogram: SpectrogramTap | null = null;
  let running = false;
  let settings = DEFAULT_MIRROR_SETTINGS;
  let lockedSnapshot: StereoSnapshot | null = null;
  let levelInterval: number | null = null;
  let spectrogramInterval: number | null = null;

  function safe<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (e) {
      events.onError?.(e instanceof Error ? e : new Error(String(e)));
      return fallback;
    }
  }

  return {
    async start(initial: MirrorSettings): Promise<void> {
      if (running) return;
      settings = initial;
      audioContext = new AudioContext();
      const sr = audioContext.sampleRate;
      capture = createSharedCapture(captureSampleCount(sr, CAPTURE_SECONDS), settings.channels);
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
      spectrogram = createSpectrogramTap(audioContext);
      recorder.micInput.connect(spectrogram.source);
      running = true;

      const captureRef = capture;
      const contextRef = audioContext;
      levelInterval = window.setInterval(() => {
        events.onElapsed?.(captureRef.elapsedSeconds(contextRef.sampleRate));
        events.onLevel?.(captureRef.peak());
      }, 80);
      const specRef = spectrogram;
      spectrogramInterval = window.setInterval(() => {
        if (!settings.spectrogram) return;
        events.onSpectrogramColumn?.(specRef.column());
      }, 60);
    },
    async stop(): Promise<void> {
      if (!running) return;
      if (levelInterval !== null) {
        window.clearInterval(levelInterval);
        levelInterval = null;
      }
      if (spectrogramInterval !== null) {
        window.clearInterval(spectrogramInterval);
        spectrogramInterval = null;
      }
      mirror?.stopMirror();
      mirror?.dispose();
      mirror = null;
      spectrogram?.dispose();
      spectrogram = null;
      recorder?.stop();
      recorder = null;
      await audioContext?.close();
      audioContext = null;
      capture = null;
      lockedSnapshot = null;
      running = false;
      events.onMirrorStateChange?.(false);
      events.onLockStateChange?.(false);
    },
    beginMirror(): void {
      if (!running || !mirror || !capture || !audioContext) return;
      const snap = this.visibleSnapshot();
      if (!snap || snap.left.length === 0) return;
      mirror.setBuffer(snap, audioContext.sampleRate);
      mirror.startMirror();
      events.onMirrorStateChange?.(true);
    },
    endMirror(): void {
      if (!mirror) return;
      mirror.stopMirror();
      events.onMirrorStateChange?.(false);
    },
    lockBuffer(): void {
      if (!capture) return;
      lockedSnapshot = capture.snapshot();
      events.onLockStateChange?.(true);
      // If we're already mirroring, refresh the buffer to use the lock.
      if (mirror?.isMirroring() && audioContext) {
        mirror.setBuffer(lockedSnapshot, audioContext.sampleRate);
      }
    },
    releaseLock(): void {
      lockedSnapshot = null;
      events.onLockStateChange?.(false);
    },
    apply(next: MirrorSettings): void {
      settings = next;
      safe(() => mirror?.apply(next), undefined);
    },
    visibleSnapshot(): StereoSnapshot | null {
      if (lockedSnapshot) return lockedSnapshot;
      return capture?.snapshot() ?? null;
    },
    ringSnapshot(): StereoSnapshot | null {
      return capture?.snapshot() ?? null;
    },
    isRunning(): boolean {
      return running;
    },
    isMirroring(): boolean {
      return mirror?.isMirroring() ?? false;
    },
    isLocked(): boolean {
      return lockedSnapshot !== null;
    },
    sampleRate(): number {
      return audioContext?.sampleRate ?? 0;
    },
    captureSeconds(): number {
      return CAPTURE_SECONDS;
    },
    channels(): number {
      return capture?.channels ?? settings.channels;
    },
  };
}
