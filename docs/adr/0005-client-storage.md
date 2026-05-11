# ADR 0005 — Client-side storage strategy

Status: Accepted
Date: 2026-05-11

## Decision

- **OPFS** (Origin Private File System) for binary blobs: last recording (raw `Float32Array` written as a Wave file ~5MB) and cached model weights (Whisper, Pyodide packages — up to ~300MB).
- **localStorage** for tiny settings: last-used model, last-used effect intensities, "I have read the privacy note" flag.
- **No IndexedDB.** OPFS is simpler for blob storage and is exactly what Whisper/Pyodide already use for their own caches.

## Consequences

- The user can close and reopen the tab; the model weights don't redownload. The last recording persists for replay until cleared.
- "Clear stored audio" and "Clear cached models" are two separate buttons in the UI — the user can keep models (fast reload) while still wiping their recording.
- OPFS has no quota prompt up to several GB on Chromium; on Safari it tops out lower. Document expected size in `docs/privacy.md`.

## Alternatives considered

- **IndexedDB** for everything: rejected — extra ceremony for what is really just "save a buffer, load a buffer".
- **No persistence**: rejected — re-downloading a 244MB Whisper model on every page reload is hostile.
