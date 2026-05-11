# Runbook — the mirror test

Because the success criterion of this piece is "does it sound right", the canonical end-to-end check is a manual listen. Vitest covers the pure logic; this page covers the audio.

## Setup

```sh
npm install
npm run pages-preview    # builds + serves docs/ with COOP/COEP headers
```

Open `http://127.0.0.1:4173/field-recording-mirror/` in Chrome or Firefox. Wear headphones.

## The test

1. **Consent + Listen.** Tick the consent box, press **Listen**, grant microphone access. The page reloads once (COI shim warming up) — this is expected.
2. **Live monitor audible.** Tap or speak. You should hear yourself with no perceptible latency.
3. **Ring fills to 0:30 / 0:30.** The elapsed counter ticks. When it reaches 0:30, **Begin mirror** un-disables.
4. **Begin mirror.** All three modified chains start. You should hear, layered:
   - the live monitor (cyan in the visualizer)
   - the same audio slowed 5% — every transient slightly behind itself
   - the same audio pitched +1 semitone — every voice slightly lifted
   - the same audio bathed in 3.5-second reverb — the room becomes a hall
5. **Sliders respond.** Move `Pitch (semitones)` to +5: voices jump a fourth. Move `Reverb decay` to 0.5: the hall collapses to a closet. Settings persist across reloads.
6. **Refresh mirror.** Press **Begin mirror** again. The mirror swaps to the _new_ most-recent 30 seconds — confirms the ring is wrapping.
7. **Transcribe (optional).** Press **Transcribe**. First run downloads ~244 MB; second run is instant. Output appears in the panel.
8. **Analyse (optional).** Press **Analyse**. First run loads Pyodide + librosa (~50 MB). Output shows MFCC, spectral centroid, tempo.
9. **Stop.** Press **Stop**. Mic releases (the OS indicator goes off), engine tears down, page returns to gate.

## Common issues

| Symptom                                   | Likely cause                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| One-time reload after pressing **Listen** | Expected — coi-serviceworker activating.                                                                                            |
| `SharedArrayBuffer is unavailable` error  | The COI shim didn't register. Hard-reload. On Pages, ensure the URL is HTTPS.                                                       |
| Mirror sounds silent                      | Live monitor gain is at zero — open `Mirror controls`.                                                                              |
| Feedback howl                             | You're listening on speakers without headphones. The mic re-captures the mirror. Either wear headphones or set `Live monitor` to 0. |
| Mic indicator stays on after Stop         | Page held a reference somewhere; refresh.                                                                                           |

## Resource footprint

| Item                              | Size                           | Where             |
| --------------------------------- | ------------------------------ | ----------------- |
| Initial HTML + JS + CSS           | <500 KB                        | docs/             |
| Tone.js                           | ~140 KB gz                     | bundled           |
| Whisper small.en                  | ~244 MB                        | OPFS, on opt-in   |
| Pyodide + librosa + numpy + scipy | ~50 MB                         | OPFS, on opt-in   |
| Ring buffer (in-memory)           | ~5.5 MB at 48 kHz × 30 s × 4 B | SharedArrayBuffer |
