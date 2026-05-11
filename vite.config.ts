import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function readGitMetadata(): { commit: string; builtAt: string } {
  try {
    const opts = {
      encoding: 'utf8' as const,
      stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'],
    };
    const log = execSync('git log -n 30 --format=%h%x00%s', opts).trim();
    if (!log) return { commit: 'local', builtAt: new Date().toISOString() };
    const sourceLine = log.split('\n').find((line) => !line.endsWith('chore: publish pages build'));
    const commit =
      sourceLine?.split('\0')[0] ?? execSync('git rev-parse --short HEAD', opts).trim();
    const builtAt = execSync(`git show -s --format=%cI ${commit}`, opts).trim();
    return { commit, builtAt };
  } catch {
    return { commit: 'local', builtAt: new Date().toISOString() };
  }
}

const base = process.env.VITE_APP_BASE ?? '/field-recording-mirror/';
const gitMetadata = readGitMetadata();
const builtAt = process.env.VITE_BUILT_AT ?? gitMetadata.builtAt;
const commit = process.env.VITE_GIT_COMMIT ?? gitMetadata.commit;
const version = process.env.VITE_APP_VERSION ?? pkg.version;

export default defineConfig({
  base,
  build: {
    outDir: 'docs',
    emptyOutDir: false,
    sourcemap: true,
    assetsDir: 'assets',
    target: 'es2022',
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_COMMIT__: JSON.stringify(commit),
    __BUILT_AT__: JSON.stringify(builtAt),
    __REPOSITORY_URL__: JSON.stringify('https://github.com/baditaflorin/field-recording-mirror'),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // COOP/COEP locally so SharedArrayBuffer works in dev. On Pages the same
    // headers are injected by src/coi-serviceworker.js — see ADR 0006.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
});
