# Contributing

This repo is a single-author art project. PRs and issues are welcome but may sit.

## Local setup

```sh
npm install
npm run install-hooks   # wires Husky pre-commit / commit-msg / pre-push
npm run dev
```

## Conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ops:`).
- One concern per file; small files; explicit dependency injection.
- ADRs for significant decisions — see `docs/adr/`.
- No GitHub Actions — checks run locally via Husky hooks (`npm run smoke` is the full chain).
- No secrets in the frontend, ever.

## Running the chain

```sh
npm run fmt        # autoformat
npm run lint       # eslint + prettier --check
npm run typecheck  # tsc -b
npm run test       # vitest with coverage
npm run smoke      # all of the above + build + Pages-build check
```

`npm run smoke` must pass before `git push`.
