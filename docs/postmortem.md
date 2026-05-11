# Postmortem — field-recording-mirror v0.1.0

Date: 2026-05-11
Author: Florin Badita (with Claude Opus 4.7)

## What was built

A pure-static GitHub Pages site that records 30 seconds of microphone audio into a `SharedArrayBuffer` ring, then plays it back through three layered chains over the live feed: slowed 5%, pitched +1 semitone, and bathed in reverb. Two opt-in side panels run real Whisper (`@xenova/transformers`) and real Python + librosa (Pyodide) — entirely in the browser, in dedicated workers, lazy-loaded on click.

Live at `https://baditaflorin.github.io/field-recording-mirror/`. Source at `https://github.com/baditaflorin/field-recording-mirror`.

## Was the mode (A) correct in hindsight?

Yes, unambiguously. The piece has no server-shaped need at all:

- The input is the user's microphone — it cannot come from anywhere else.
- The output is audio in the user's room — it cannot go anywhere else.
- The transformations (rate change, pitch shift, reverb, transcription, spectral analysis) all have mature browser implementations.

The only thing that _looked_ server-ish was "real Python + librosa", but Pyodide collapsed that. The only thing that looked like an Actions job was the build, but Husky + local `npm run smoke` handles it.

Mode B would have been pointless (no data to pre-build). Mode C would have introduced ops cost for zero functional benefit.

## What worked

- **Tone.js for the audio graph.** `PitchShift` and `Reverb` are granular/convolution implementations on AudioWorklets. Writing a phase vocoder from scratch would have eaten the entire budget and produced a worse result.
- **`SharedArrayBuffer` ring + AudioWorklet capture.** Reads on the main thread are zero-copy, the visualizer runs at 60 fps without dropping audio frames.
- **`coi-serviceworker` shim.** Solved GitHub Pages's "no custom headers" problem in eight lines of HTML (one `<script>` tag) and let us keep the static-site deployment.
- **Worker isolation.** Pyodide and Whisper run in completely independent workers, lazy-loaded on first click. The mirror works in seconds; the analytical panels come online when they come online, without ever blocking audio.
- **Existing Codex conventions.** Reusing `audience-field-sculpture`'s vite/eslint/husky/scripts saved hours and means the chain (smoke → build → push) was familiar from minute one.

## What didn't / what surprised me

- **`Float32Array<ArrayBufferLike>` vs `<ArrayBuffer>` typing in TS 5.7.** Now that typed arrays are generic over their backing buffer, snapshots that originate in a `SharedArrayBuffer` ring don't satisfy `AudioBuffer.copyToChannel`'s signature even though they would at runtime. Worked around by copying into a fresh `ArrayBuffer` before each `setBuffer` call. Cheap, but the type error was the kind of thing that would have eaten ten minutes if I hadn't seen it before.
- **`@xenova/transformers` pulls `onnxruntime-web` which pulls `sharp` which has 4 critical CVEs.** They're transitive, sharp is only used at build time in some configurations, but the warning will haunt every `npm install`. Worth tracking in `docs/security.md` if this grows.
- **The pre-push hook re-runs `npm run build`, which regenerates `docs/`** with new asset hashes (because `version.json`'s `builtAt` changes). So the _pushed_ `docs/` is one rebuild ahead of the _committed_ `docs/`. Solved by always doing a publish commit after pre-push, but it's an awkward dance — the next iteration should make the build deterministic enough that re-running it is a no-op when sources are unchanged.
- **Vite logged a warning about the `<script src="./coi-serviceworker.js">` non-module tag.** Intentional — the shim must register before any module loads — but the warning suggests there's a cleaner way (probably `vite-plugin-inject-preload` or similar). Not worth chasing in v1.

## Tech debt accepted

- The `host.querySelector('.stage')!` non-null assertion in `view.ts` is a lint warning. The element is created on the line above; the assertion is correct but unidiomatic.
- The pitch shifter's gain stage (`pitchGain`) is fished out of the PitchShift node's `output` slot via `as unknown as Tone.Gain`. Tone.js's types don't expose the trailing Gain that PitchShift internally chains; the cast is safe because the runtime shape is stable, but it's a wart.
- `Tone.PitchShift` is granular and introduces audible artifacts on transient-heavy material (claps, hi-hats). For most environmental audio it's fine. A phase vocoder would be smoother but is well outside v1's scope.
- Linear resampler in the Whisper worker. Good enough for speech intelligibility at 48 kHz → 16 kHz, but a proper polyphase resampler would be cleaner.
- No e2e test. The success criterion is "does it sound right" — see ADR 0013. Future browser-automation work could fake `getUserMedia` with a `MediaStreamAudioDestinationNode`, but the cost/value didn't pencil out for v1.

## What I'd do next, ranked by value

1. **Hold-to-record mode.** Right now the ring just rolls; the mirror always reflects "the last 30 seconds". A momentary mode — press to capture a moment, mirror loops it indefinitely — would be useful for installation contexts.
2. **Live spectral overlay.** Pyodide is already loaded; render the librosa mel-spectrogram as a translucent layer behind the waveform. Gives the user a visual handle on what the mirror is doing.
3. **Multiple simultaneous transformations.** Right now the three chains are fixed (slow / pitch / reverb). Letting the user route any combination to any chain (and add a fourth: granular freeze) opens the instrument up considerably.
4. **PWA install.** Service worker is already there for COOP/COEP — extending it to cache the JS shell would make this work offline after first visit. Real "instrument in your pocket" affordance.
5. **Stereo capture.** The ring is mono. Stereo doubles memory but gives the mirror a sense of space (panned reverb tails).

## Time spent

Single session, roughly 90 minutes from `mkdir` to live URL. Scaffolding 25%, audio engine 30%, UI 15%, workers 10%, fixes/lint/tests 15%, docs/commits/push 5%. Reusing conventions from `audience-field-sculpture` saved an estimated 45+ minutes — would have been ~2.5h from scratch.

## Honest note

The single most consequential decision was deleting the "200 KB initial JS budget" hedge from the architecture. The piece's value comes from running real Whisper and real librosa in the browser — anything less is a demo. Once we committed to the WASM payload (held to opt-in, lazy on click), every downstream choice fell into place: Pyodide over meyda, transformers.js over a JS imitation, COI shim over single-threaded fallback, Tone.js over hand-rolled DSP. The user's "fuck the budget" instinct was correct; the meta-prompt's 200 KB line is a heuristic for shell weight, not for the working modules behind a click.
