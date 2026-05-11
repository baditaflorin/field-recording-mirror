# ADR 0010 — GitHub Pages publishing strategy

Status: Accepted
Date: 2026-05-11

## Decision

- **Source**: GitHub Pages serves from `main` branch, `/docs` directory.
- **Build output**: `npm run build` emits into `docs/` via Vite's `build.outDir`. `emptyOutDir: false` so hand-authored `docs/adr/`, `docs/architecture.md`, `docs/postmortem.md`, `docs/privacy.md` are preserved; `scripts/prepare-pages-dir.mjs` clears only the known build artifacts (`index.html`, `404.html`, `version.json`, `icon.svg`, `assets/`) before each build.
- **Base path**: `/field-recording-mirror/` (set in `vite.config.ts`, overridable via `VITE_APP_BASE` for custom domains).
- **SPA shim**: `scripts/copy-404.mjs` mirrors `index.html` to `docs/404.html` so deep links don't 404 if the app gains client-side routing later. v1 has none, but the file is cheap insurance.
- **Cache busting**: Vite's hashed asset filenames (e.g. `assets/index-Bf3a92.js`) plus `docs/version.json` for runtime introspection.
- **Custom domain**: none in v1. The site lives at `https://baditaflorin.github.io/field-recording-mirror/`.
- **Publish step**: built artifacts are committed under `chore: publish pages build` after each meaningful change. There is no GitHub Action; the pre-push hook runs `npm run smoke` which includes `npm run build`, so a push of source code without a matching build is impossible by accident.

## Consequences

- The repo's commit history alternates between feature commits (clean source diffs) and publish commits (mostly hashed asset churn). This is the expected pattern across other Codex projects.
- Anyone clones the repo and gets a working static site in `docs/` without running the build.
- Custom domain swap is a one-line change to `VITE_APP_BASE` + a `CNAME` file in `public/`.

## Alternatives considered

- **`gh-pages` branch**: rejected — splits source and published artifact across branches, makes the `git log` harder to read, and requires a separate publish step beyond `git push`.
- **GitHub Actions to build**: rejected — the user's account has an Actions billing lock, and the local Husky pre-push hook is already the source of truth for "code is buildable". See memory: `feedback_local_build_only`.
