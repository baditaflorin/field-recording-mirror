# ADR 0017 — v0.2 extensions: stereo, locked capture, granular freeze, spectrogram, PWA

Status: Accepted
Date: 2026-05-11

## Context

The v0.1 postmortem identified five next-step items (`docs/postmortem.md`):
hold-to-record, live spectral overlay, more chains / granular freeze, PWA install, and stereo capture. This ADR records the v0.2 decisions for all five.

## Decisions

### Stereo capture

`SharedArrayBuffer` audio is now channel-major: channel 0 occupies the first
`capacity` Float32 slots, channel 1 the next `capacity`. `SharedCapture.snapshot()` returns `{ left, right }`. Mono mode is still supported (channels = 1; both `left` and `right` are the same array) and is user-selectable on the permission gate. Memory cost: ~11 MB SAB at 48 kHz stereo, was ~5.5 MB at mono. Worth it.

### Locked / rolling capture mode

A radio on the gate selects `rolling` (the v0.1 default — mirror always reflects the last 30 s) or `locked`. In locked mode, **Lock moment** snapshots the ring and pins it; the mirror plays that buffer indefinitely. **Release lock** clears the pin. While locked the ring keeps rolling underneath so the user can lock a fresh moment at any time.

### Granular freeze (4th chain)

`Tone.GrainPlayer` added alongside the existing slow/pitch/reverb chains. Settings: `freezeGrainSize` (0.05..2 s), `freezeSemitones` (-12..+12), `freezeGain` (0..1, default 0 so it's silent unless asked for). Useful for sustaining a single moment over the live feed indefinitely.

### Live spectral overlay

An `AnalyserNode` is tapped off the mic input. Every ~60 ms we pull `getByteFrequencyData` and remap the FFT bins to 64 log-spaced rows (60 Hz–12 kHz). The visualizer scrolls a column of HSL-tinted rectangles leftward behind the waveform. Allocation is one Float32Array per column; the worklet thread is not involved.

### PWA

- `public/manifest.webmanifest` with name, theme colour, SVG icon (with `purpose: any maskable`).
- `<link rel="manifest">` and `<link rel="apple-touch-icon">` in `index.html`.
- The COI service worker now precaches `index.html`, `manifest.webmanifest`, `icon.svg`, and the capture worklet on `install`, then serves same-origin GETs cache-first with a network refresh in the background. Subsequent visits load the shell instantly and work fully offline once the mirror is going (Whisper/Pyodide model fetches still need network on first use).
- The page listens for `beforeinstallprompt` and shows an **Install as app** button on browsers that support it.

## Consequences

- Storage shape change: `last-recording.f32` is now stereo-interleaved. Old mono files from v0.1 will be ignored; the worst case is the user re-presses **Begin mirror**.
- The COI service worker is now both a header-rewriter _and_ a precache. If we ever need to invalidate the shell we bump `SHELL_CACHE` and old entries are deleted on activate.
- The granular freeze chain's WASM grain engine adds ~30 KB to the bundle but is part of Tone.js which was already imported.
- Spectrogram is opt-out (a checkbox in the controls row) for users who find it distracting or want to lower CPU on phones.

## When to reconsider

- If the SAB stereo footprint becomes a problem on memory-constrained devices, fall back to mono with a more aggressive resampling step.
- If the COI shim ever needs to be replaced (e.g. GitHub adds support for `_headers`), the precache logic can live on its own.
