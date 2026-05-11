import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Coverage is targeted at the domain layer — the pure logic that does not
      // depend on Web Audio, OPFS, or WASM module loading. The audio graph and
      // worklets are exercised in-browser via the smoke flow, not in jsdom.
      include: [
        'src/primitives/**/*.ts',
        'src/audio/ring-buffer.ts',
        'src/audio/transformations.ts',
      ],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
