// Emits docs/version.json with build metadata so the app can show "built X ago".
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));

function gitOrFallback(cmd, fallback) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

const commit = gitOrFallback('git rev-parse --short HEAD', 'local');
const builtAt =
  commit === 'local'
    ? new Date().toISOString()
    : gitOrFallback(`git show -s --format=%cI ${commit}`, new Date().toISOString());

const out = {
  name: pkg.name,
  version: pkg.version,
  commit,
  builtAt,
  homepage: pkg.homepage,
};

const docsDir = `${root}/docs`;
mkdirSync(docsDir, { recursive: true });
writeFileSync(`${docsDir}/version.json`, JSON.stringify(out, null, 2) + '\n');
