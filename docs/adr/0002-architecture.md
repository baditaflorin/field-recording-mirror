# ADR 0002 — Architecture overview and module boundaries

Status: Accepted
Date: 2026-05-11

## Context

The instrument needs a real-time audio path (mic → live monitor + three modified playback chains) running at audio-thread priority, plus two non-real-time analysis paths (Whisper transcription, Pyodide librosa-style feature extraction) that must not block audio.

## Decision

Layered architecture, top-down:

```
src/
├── main.ts             entry, mounts UI
├── app.ts              wires UI to audio engine + workers
├── primitives/         pure functions, no side effects (clamp, result, time)
├── audio/              Web Audio graph; uses Tone.js for pitch shift + reverb
│   ├── ring-buffer.ts  30s circular buffer (pure logic, unit-tested)
│   ├── recorder.ts     wraps getUserMedia, fills ring buffer
│   ├── mirror-graph.ts builds the Tone.js graph: live + slow + pitch + reverb
│   ├── transformations.ts pure helpers for slow / semitone math
│   └── worklets/       AudioWorkletProcessors (capture, meter)
├── workers/
│   ├── whisper.worker.ts  loads @xenova/transformers in a worker
│   └── pyodide.worker.ts  loads pyodide + librosa in a worker
├── storage/
│   └── opfs.ts         Origin Private File System for recordings + models
├── ui/
│   ├── view.ts         pure render: state → DOM
│   ├── controls.ts     button + slider event wiring
│   └── visualizer.ts   live + mirror waveform/spectrum canvas
└── types/              shared interface definitions
```

### Threading model

- **Audio thread**: AudioWorklet processors only. Owns the ring buffer (via `SharedArrayBuffer`).
- **Main thread**: Tone.js orchestration, UI rendering, OPFS reads/writes.
- **Worker A (Whisper)**: `@xenova/transformers` loaded lazily on first "Transcribe" click. Receives 30s `Float32Array` clones, returns text.
- **Worker B (Pyodide)**: lazy on first "Analyse" click. Receives clones of the 30s buffer, returns spectral features.

Workers never touch the live audio graph; they receive Float32Array snapshots and return JSON. The audio thread is therefore unblocked.

### Dependency direction

`ui → app → audio + workers + storage → primitives`. No cycles. Workers depend only on `primitives` and their respective WASM runtimes.

## Consequences

- Audio quality is decoupled from the speed of WASM module loading. The user can mirror their environment in seconds even before Pyodide finishes downloading.
- The pure logic layer (ring buffer, transformations, primitives) is unit-testable in jsdom without any browser audio APIs.
- Workers are reloadable: a transient WASM error in the Pyodide worker does not crash the mirror.

## Alternatives considered

- **Everything on the audio thread**: rejected — Pyodide initialization alone is hundreds of ms; cannot run on the audio callback.
- **Single multipurpose worker**: rejected — Whisper and Pyodide have very different lifecycles (Whisper warms a model once; Pyodide reloads packages); splitting them keeps each isolated.
