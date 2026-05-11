# ADR 0006 — WASM modules: Pyodide, transformers.js (Whisper), and the COI shim

Status: Accepted
Date: 2026-05-11

## Context

The piece's premise — "stand in two slightly different versions of now" — is pure audio. But the user prompt explicitly named **Whisper + librosa + Web Audio** as the stack. Whisper gives the room a literal voice (transcription); librosa-style analysis gives the mirror a way to react to spectral content (e.g. emphasising onsets in the reverb send). Both are opt-in, lazy-loaded side panels — the core mirror works without them.

We are not shipping JS imitations of librosa. We are running **real CPython with real librosa** in the browser, via Pyodide. Same for Whisper — real `whisper.cpp`-derived ONNX inference, not a tiny demo model.

## Decision

### Pyodide (Python + librosa)

- Package: `pyodide@0.27.x` loaded from the official jsdelivr CDN.
- Hosted in a dedicated Worker (`src/workers/pyodide.worker.ts`).
- On worker startup: `loadPyodide()`, then `await pyodide.loadPackagesFromImports("import numpy, scipy, librosa")`.
- Communication via `postMessage` with structured-cloned `Float32Array`s of the 30-second buffer. Returns MFCCs, spectral centroid, onset strength as `Float32Array` / `number[]`.

### Whisper (`@xenova/transformers`)

- Package: `@xenova/transformers@^2` loaded from jsdelivr via dynamic `import()` on first transcribe click.
- Default model: `Xenova/whisper-small.en` (~244MB, INT8 quantized). Picker lets the user swap to `base.en` (~74MB) or `medium.en` (~769MB).
- Runs in `src/workers/whisper.worker.ts`. Receives a `Float32Array` at 16 kHz, returns a string + per-chunk timings.
- Model weights cached automatically by transformers.js in OPFS-backed IndexedDB.

### Cross-origin isolation (the GitHub Pages problem)

`SharedArrayBuffer` — required for the Pyodide threaded build and for ONNX Runtime Web's multi-threaded execution provider — requires the page to be cross-origin-isolated, which requires the response to carry:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages does not let us set those headers. The fix is `coi-serviceworker.js` (vendored at `public/coi-serviceworker.js`, MIT-licensed, from `github.com/gzuidhof/coi-serviceworker`). It registers a service worker that intercepts `fetch` and rewrites response headers to add COOP/COEP. On first load it triggers one reload to enter the isolated context, then everything works.

The same headers are set by `vite.config.ts`'s dev server and by `scripts/serve-static.mjs` so dev and production behave identically.

## Consequences

- First mirror playback works in seconds; transcription / spectral analysis comes online after the relevant WASM finishes downloading (cached on subsequent visits).
- Initial Pages load triggers one extra reload via the COI shim — annoying but unavoidable. We show a quick "preparing isolated context…" splash to make the reload look intentional.
- Total download for a fully-warmed cache: ~6MB Pyodide core + ~244MB Whisper-small. The user is told this and can opt for the smaller `base.en` (~74MB) instead.

## Alternatives considered

- **meyda.js instead of Pyodide librosa**: rejected — defeats the artistic premise that real Python is running in the browser. (See memory: `feedback_no_budget_caps`.)
- **whisper.cpp WASM directly**: would also work, but `@xenova/transformers` is a more ergonomic JS API and handles model loading + caching for us.
- **No COI shim, fall back to single-threaded Pyodide**: ~2× slower for librosa feature extraction. The COI shim is free and keeps us on the fast path.
