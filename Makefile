# Single source of truth for the development workflow.
# Targets are thin wrappers around `npm` scripts so the user can use either.

.PHONY: help install install-hooks dev build test test-watch lint fmt typecheck \
        smoke pages-preview audit clean

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

install-hooks: ## Wire Husky git hooks (.husky/)
	npm run install-hooks

dev: ## Vite dev server with COOP/COEP headers
	npm run dev

build: ## Build into docs/ for GitHub Pages
	npm run build

test: ## Vitest with coverage
	npm run test

test-watch: ## Vitest in watch mode
	npm run test:watch

lint: ## ESLint + Prettier check
	npm run lint

fmt: ## Prettier --write
	npm run fmt

typecheck: ## tsc -b
	npm run typecheck

smoke: ## Full chain: typecheck + lint + test + build + pages-build-check
	npm run smoke

pages-preview: ## Serve docs/ exactly as GitHub Pages would
	npm run pages-preview

audit: ## npm audit (high+)
	npm run audit

clean: ## Remove node_modules + coverage + Vite build artifacts in docs/
	rm -rf node_modules coverage docs/assets docs/index.html docs/404.html docs/version.json docs/icon.svg dist-types
