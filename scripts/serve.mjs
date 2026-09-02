import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const port = Number(process.env.PORT || 4174);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8' };
// Mirrors index.html's CSP meta plus the frame-ancestors directive that only a header can carry. Keep in sync with _headers.
const securityHeaders = {
  'Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Permissions-Policy': 'tools=(self)',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    let relative = normalize(pathname).replace(/^([/\\])+/, '');
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    const path = join(root, relative);
    if (!path.startsWith(root)) throw new Error('Forbidden');
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', ...securityHeaders });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Drillboard running at http://127.0.0.1:${port}`));
