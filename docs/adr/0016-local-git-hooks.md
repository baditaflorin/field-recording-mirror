# ADR 0016 — Local git hooks (no GitHub Actions)

Status: Accepted
Date: 2026-05-11

## Context

The user's GitHub account has an Actions billing lock, and across the Codex projects the convention is local Husky hooks instead of CI. See memory: `feedback_local_build_only`.

## Decision

- **Husky** (`.husky/`) manages the hooks. `npm run install-hooks` (alias for `husky`) wires them.
- **pre-commit**: `npm run lint && npm run typecheck && npm run test`. Fast (<5 s), catches the dumb failures.
- **commit-msg**: validates Conventional Commits prefix (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ops:`).
- **pre-push**: `npm run smoke` — full chain including `npm run build` and `scripts/check-pages-build.mjs`. This is the gate: nothing pushed without a buildable site.

## Consequences

- A push of source code without a corresponding `docs/` rebuild is impossible by accident.
- No remote CI bill. No YAML to debug.
- New contributors must `npm run install-hooks` once after clone — documented in `README.md` and `CONTRIBUTING.md`.
