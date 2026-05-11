// GitHub Pages 404 fallback that mirrors index.html so deep links don't 404.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const indexPath = `${root}/docs/index.html`;
const indexHtml = readFileSync(indexPath, 'utf8');
writeFileSync(`${root}/docs/404.html`, indexHtml);
