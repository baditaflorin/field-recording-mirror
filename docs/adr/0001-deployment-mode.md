# ADR 0001 — Deployment mode: pure GitHub Pages (Mode A)

Status: Accepted
Date: 2026-05-11

## Context

Field Recording Mirror is a browser instrument: the user grants microphone access, the page records 30 seconds, and plays the recording back through three modified chains (slowed 5%, pitched +1 semitone, reverbed) layered over the live feed. The whole experience is local-to-the-room — there is no "share" or "save to cloud" gesture in v1.

Any server in the loop would weaken the privacy premise that makes the piece work. Environmental audio is intimate. The user is more likely to lean into the experience if they can see, in the network tab, that nothing leaves the tab.

## Decision

Deploy as a fully static site on GitHub Pages — Mode A from the meta-prompt. The site is built by `npm run build` into `docs/`. Pages serves `docs/` from `main`. No backend, no accounts, no analytics, no runtime API.

WASM modules (Pyodide for librosa, ONNX Runtime Web for Whisper) and model weights are fetched from public CDNs (jsdelivr, HuggingFace) but the audio they process never leaves the device.

## Consequences

- Audio cannot leak because there is no server to receive it. The repo is auditable for this property — search for `fetch(`, `WebSocket`, `WebRTC` and verify the destinations.
- GitHub Pages cannot set custom response headers, so the cross-origin-isolated context needed for `SharedArrayBuffer` (Pyodide threading, whisper.cpp threading) has to come from the `coi-serviceworker` shim. See ADR 0006.
- Recordings persist only as long as the user's OPFS allows. There is no cross-device or cross-tab sync.
- Cost is zero. Ops surface is zero. Attack surface is the smallest possible.

## When to reconsider

If a future version needs synchronised multi-user state (e.g. two people in different cities each contributing to a shared 30-second mirror), revisit and write a new ADR. v1 explicitly does not.

## Alternatives considered

- **Mode B (Pages + pre-built data)**: rejected — there is no data to pre-build. The whole input is the user's microphone, captured fresh each session.
- **Mode C (Pages + backend)**: rejected — adds infrastructure to support a feature (cross-device anything) that v1 doesn't have.
