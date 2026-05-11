// Minimal static server for previewing the Pages build locally with COOP/COEP
// headers set (so the SharedArrayBuffer / WASM path works just like Pages
// + the coi-serviceworker shim do in production).
import { createReadStream, statSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const dir = resolve(process.cwd(), process.argv[2] ?? 'docs');
const base = '/field-recording-mirror';
const port = Number(process.env.PORT ?? 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

createServer((req, res) => {
  let url = req.url ?? '/';
  if (url.startsWith(base)) url = url.slice(base.length) || '/';
  let path = join(dir, decodeURIComponent(url.split('?')[0]));
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('content-type', types[extname(path)] ?? 'application/octet-stream');
  createReadStream(path).pipe(res);
}).listen(port, () => {
  console.info(`Static preview at http://127.0.0.1:${port}${base}/`);
});
