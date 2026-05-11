# ADR 0013 — Testing strategy

Status: Accepted
Date: 2026-05-11

## Decision

- **Unit (Vitest + jsdom)**: pure logic only — `primitives/`, `audio/ring-buffer.ts`, `audio/transformations.ts`. ≥80% line coverage on the included modules.
- **Smoke (`scripts/smoke.sh`)**: `typecheck + lint + test + build + check-pages-build`. Runs in the Husky pre-push hook. Must pass before push.
- **Manual browser test** (the "mirror test"): documented in `docs/runbook.md`. Steps: serve the build, grant mic, count 30 s, confirm the slow/pitch/reverb chains all become audible. This is the canonical end-to-end check because the audio path is what matters and no jsdom test can validate it.

## Not in v1

- **Playwright e2e**: would need a fake `getUserMedia` stream and a way to assert audio output; the engineering cost is high and the value low for a 1-author piece. The manual mirror test is sufficient.
- **Coverage on audio/worklet code**: worklets run in an AudioWorklet realm that jsdom doesn't simulate. We cover the pure logic they wrap (ring buffer math, transformation math) and leave the worklet glue to the manual test.

## Consequences

- Unit tests run in <2 s. Pre-push is fast enough to never feel oppressive.
- Audio regressions are caught by ear, not by CI. That's appropriate for an art piece — the success criterion is "does it sound right", which a test cannot answer.
