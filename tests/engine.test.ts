// Regression test for a `stop()` reentrancy race: the audio graph
// (recorder/mirror-graph/spectrogram) is mocked out so the test can run in
// jsdom without a real Web Audio implementation, but a fake `AudioContext`
// reproduces the one bit of platform behaviour the bug depends on — per
// spec, `AudioContext.close()` synchronously flips the context's control
// state to "closed" and a second `close()` call on an already-closed
// context rejects with InvalidStateError.
//
// Before the fix, `engine.stop()` only set its internal `running` flag to
// false *after* `await audioContext.close()`, so a second `stop()` call
// fired while the first was still tearing down (e.g. a fast double-click on
// the Stop button) would race past the `if (!running) return` guard and
// call `close()` a second time on the same context, causing an unhandled
// rejection.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const startRecorderMock = vi.fn((_ctx: unknown, capture: { channels: number }) =>
  Promise.resolve({
    micInput: { connect: vi.fn() },
    sampleRate: 48000,
    channels: capture.channels,
    stop: vi.fn(),
  })
);

function makeMirrorGraphMock() {
  return {
    connectLive: vi.fn(),
    setBuffer: vi.fn(),
    startMirror: vi.fn(),
    stopMirror: vi.fn(),
    apply: vi.fn(),
    isMirroring: vi.fn(() => false),
    dispose: vi.fn(),
  };
}
const createMirrorGraphMock = vi.fn(() => makeMirrorGraphMock());

function makeSpectrogramTapMock() {
  return {
    source: { connect: vi.fn() },
    column: vi.fn(() => new Float32Array(1)),
    dispose: vi.fn(),
  };
}
const createSpectrogramTapMock = vi.fn(() => makeSpectrogramTapMock());

vi.mock('../src/audio/recorder.js', () => ({ startRecorder: startRecorderMock }));
vi.mock('../src/audio/mirror-graph.js', () => ({ createMirrorGraph: createMirrorGraphMock }));
vi.mock('../src/audio/spectrogram.js', () => ({ createSpectrogramTap: createSpectrogramTapMock }));

const { createEngine } = await import('../src/audio/engine.js');
const { DEFAULT_MIRROR_SETTINGS } = await import('../src/audio/transformations.js');

class FakeAudioContext {
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  state: 'running' | 'closed' = 'running';
  closeCalls = 0;

  createGain(): { gain: { value: number; setTargetAtTime: () => void }; connect: () => void } {
    return { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn() };
  }

  close(): Promise<void> {
    // Mirrors the Web Audio spec: [[control thread state]] flips to
    // "closed" synchronously, before the returned promise settles. A
    // second call on an already-closed context rejects.
    if (this.state === 'closed') {
      return Promise.reject(new Error('InvalidStateError: AudioContext is already closed'));
    }
    this.state = 'closed';
    this.closeCalls++;
    return Promise.resolve();
  }
}

describe('engine stop() reentrancy', () => {
  let fakeCtx: FakeAudioContext;

  beforeEach(() => {
    startRecorderMock.mockClear();
    createMirrorGraphMock.mockClear();
    createSpectrogramTapMock.mockClear();
    fakeCtx = new FakeAudioContext();
    // A plain function that returns an object is usable with `new` (the
    // returned object becomes the construction result), unlike an arrow
    // function or `vi.fn(() => …)`.
    (globalThis as unknown as { AudioContext: unknown }).AudioContext =
      function AudioContextCtor() {
        return fakeCtx;
      };
  });

  afterEach(() => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
  });

  it('closes the AudioContext exactly once even when stop() is invoked concurrently', async () => {
    const engine = createEngine();
    await engine.start(DEFAULT_MIRROR_SETTINGS);
    expect(engine.isRunning()).toBe(true);

    // Simulate a fast double-click on "Stop": two overlapping calls before
    // either has finished tearing down.
    const results = await Promise.allSettled([engine.stop(), engine.stop()]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(fakeCtx.closeCalls).toBe(1);
    expect(engine.isRunning()).toBe(false);
  });

  it('is a no-op to call stop() again once fully stopped', async () => {
    const engine = createEngine();
    await engine.start(DEFAULT_MIRROR_SETTINGS);
    await engine.stop();
    expect(fakeCtx.closeCalls).toBe(1);

    await expect(engine.stop()).resolves.toBeUndefined();
    expect(fakeCtx.closeCalls).toBe(1);
  });

  it('supports several start/stop cycles without leaking AudioContext instances', async () => {
    const engine = createEngine();
    const contexts: FakeAudioContext[] = [];
    (globalThis as unknown as { AudioContext: unknown }).AudioContext =
      function AudioContextCtor() {
        const ctx = new FakeAudioContext();
        contexts.push(ctx);
        return ctx;
      };

    for (let i = 0; i < 5; i++) {
      await engine.start(DEFAULT_MIRROR_SETTINGS);
      await engine.stop();
    }

    expect(contexts).toHaveLength(5);
    expect(contexts.every((ctx) => ctx.closeCalls === 1)).toBe(true);
    expect(engine.isRunning()).toBe(false);
  });
});
