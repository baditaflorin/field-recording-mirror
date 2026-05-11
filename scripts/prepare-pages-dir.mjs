// Clears Vite build artifacts from docs/ before each build while preserving
// hand-authored docs (ADRs, postmortem, architecture, privacy). docs/ is BOTH
// the Pages publishing source and the location for project documentation.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const docsDir = new URL('../docs/', import.meta.url);
const docsPath = docsDir.pathname;

const removableFiles = ['index.html', '404.html', 'version.json', 'icon.svg'];

for (const file of removableFiles) {
  const target = join(docsPath, file);
  if (existsSync(target)) rmSync(target, { force: true });
}

for (const dir of ['assets', 'workers', 'worklets']) {
  const target = join(docsPath, dir);
  if (existsSync(target) && statSync(target).isDirectory()) {
    rmSync(target, { recursive: true, force: true });
  }
}

if (existsSync(docsPath)) {
  for (const entry of readdirSync(docsPath)) {
    if (entry.endsWith('.js.map') || entry.endsWith('.css.map')) {
      rmSync(join(docsPath, entry), { force: true });
    }
  }
}
