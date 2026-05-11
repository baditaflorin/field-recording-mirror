# ADR 0003 — Frontend framework and build tooling

Status: Accepted
Date: 2026-05-11

## Decision

- **TypeScript (strict)** — every flag in `tsconfig.app.json` set; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` on.
- **Vite 6** as build tool, dev server, and worker bundler. `worker: { format: 'es' }` so worker imports resolve naturally.
- **No UI framework.** The UI is a permission gate, a record/play button, three sliders, and a canvas visualizer. A vanilla `view(state): DOM` function is simpler than React/Vue here and ships less JavaScript.
- **Tone.js** for the audio graph. It gives us a battle-tested PitchShift (granular, AudioWorklet-based) and Reverb (ConvolverNode with generated IRs) without writing our own DSP.
- **ESLint + Prettier** with the same rule set used across other Codex projects (see `eslint.config.js`).
- **Vitest + jsdom** for unit tests of pure logic.

## Consequences

- First-load JS is small (the visible shell is plain TS + a button). Tone.js is imported eagerly because it's needed the moment the user clicks "Listen"; lazier loading would just stall the first interaction.
- No JSX, no virtual DOM diffing — render is direct `element.textContent =` / `classList.toggle` against persistent nodes.

## Alternatives considered

- **React/Preact**: rejected — the UI is too small to justify a framework, and the audio engine wants to push state to the DOM at 60fps without going through a reconciler.
- **Hand-rolled phase vocoder for pitch shift**: rejected — Tone.PitchShift is granular, well-tested, and gives an artistically acceptable result. Writing DSP is not where v1's time should go.
