# field-recording-mirror

A private browser instrument that records 30 seconds of now and replays it as a subtly altered sonic mirror.

[![pages](https://img.shields.io/badge/pages-live-9eecff)](https://baditaflorin.github.io/field-recording-mirror/)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Live: https://baditaflorin.github.io/field-recording-mirror/

## What it is

You give the page your microphone. It records 30 seconds of your environment, then plays the recording back through three slightly different versions of itself, layered over the live feed:

- **Slowed 5%** — the room, but a half-step out of sync with itself
- **Pitched +1 semitone** — the room, but lifted
- **Reverbed** — the room, but bigger

You stand in two slightly different versions of now, simultaneously.

## Privacy

Audio never leaves your device. The whole instrument is a static site on GitHub Pages — no server, no upload, no telemetry. Recordings live in your browser's OPFS storage until you clear them. See `docs/privacy.md`.

## Quickstart

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/field-recording-mirror/, allow microphone access, wait 30 seconds, listen.

## Build for Pages

```sh
npm run build         # builds into docs/
npm run pages-preview # serve docs/ exactly as Pages would
```

## Architecture

- **Web Audio** AudioWorklet graph carries the live signal path and the three modified playback chains.
- **Pyodide** (real CPython in WASM) does spectral / librosa-style analysis off the audio thread.
- **Whisper** (`@xenova/transformers`, ONNX Runtime Web) transcribes opt-in, on demand, in a worker.
- **OPFS** stores the last recording and downloaded model weights for instant reload.
- **`coi-serviceworker`** shim injects COOP/COEP so SharedArrayBuffer works on GitHub Pages.

See `docs/architecture.md` and `docs/adr/` for the full picture.

## Why this exists

It's hard to describe; impossible to forget. The piece doesn't fit on a server — environmental audio is intimate, and the experience is about _now_, not about a clip you saved. So the whole thing runs in your tab, on your machine, and stops the moment you close it.

## License

MIT — see `LICENSE`.
