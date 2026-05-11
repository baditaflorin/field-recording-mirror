// Sanity-check the Pages build to catch regressions before commit.
import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const docs = `${root}/docs`;

const failures = [];

function check(label, ok, detail) {
  if (!ok) failures.push(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

check('docs/index.html exists', existsSync(`${docs}/index.html`));
check('docs/404.html exists', existsSync(`${docs}/404.html`));
check('docs/version.json exists', existsSync(`${docs}/version.json`));
check('docs/icon.svg exists (vite copied public/)', existsSync(`${docs}/icon.svg`));
check(
  'docs/coi-serviceworker.js exists (vite copied public/)',
  existsSync(`${docs}/coi-serviceworker.js`)
);

if (existsSync(`${docs}/index.html`)) {
  const html = readFileSync(`${docs}/index.html`, 'utf8');
  check(
    'index.html references hashed JS bundle',
    /\/assets\/[^"']+\.js/.test(html),
    'no built bundle reference found'
  );
  check(
    'index.html registers coi-serviceworker',
    html.includes('coi-serviceworker'),
    'COOP/COEP shim must load early'
  );
}

if (existsSync(`${docs}/version.json`)) {
  const v = JSON.parse(readFileSync(`${docs}/version.json`, 'utf8'));
  check('version.json has version', typeof v.version === 'string' && v.version.length > 0);
  check('version.json has commit', typeof v.commit === 'string' && v.commit.length > 0);
}

if (failures.length > 0) {
  console.error('Pages build check failed:');
  for (const f of failures) console.error(f);
  process.exit(1);
} else {
  console.info('Pages build check passed.');
}
