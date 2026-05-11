#!/usr/bin/env bash
# Smoke test: every command runs locally before publishing the build.
# There is no CI — Husky pre-push runs this same chain.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ npm run typecheck"
npm run typecheck

echo "→ npm run lint"
npm run lint

echo "→ npm run test"
npm run test

echo "→ npm run build"
npm run build

echo "✓ smoke passed"
