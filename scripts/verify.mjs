import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const requiredIds = ['main', 'preset-select', 'role-select', 'exercise-clock', 'exercise-score', 'metric-impact', 'objective-list', 'inject-list', 'resource-list', 'proposal-list', 'forecast-panel', 'communication-list', 'closeout-check', 'closeout-review-button', 'resume-response-button', 'closeout-button', 'tool-dialog', 'reset-confirm', 'live-status'];

async function walk(path) {
  return (await readdir(path, { withFileTypes: true })).flatMap((entry) => (entry.isDirectory() ? [] : [join(path, entry.name)]));
}

const jsFiles = [...await walk(join(root, 'src')), ...await walk(join(root, 'scripts')), ...await walk(join(root, 'tests'))].filter((path) => ['.js', '.mjs'].includes(extname(path)));
for (const file of jsFiles) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`Syntax error in ${file}\n${check.stderr}`);
}

const html = await readFile(join(root, 'index.html'), 'utf8');
for (const id of requiredIds) if (!html.includes(`id="${id}"`)) throw new Error(`Missing required id: ${id}`);
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate ids: ${[...new Set(duplicates)].join(', ')}`);
for (const external of [...html.matchAll(/(?:src|href)="(https?:\/\/[^\"]+)"/g)]) if (!external[1].includes('github.com/652036/drillboard')) throw new Error(`Unexpected remote asset: ${external[1]}`);
if (/<iframe\b/i.test(html)) throw new Error('Top-level WebMCP app must not depend on iframe tool discovery.');

const app = await readFile(join(root, 'src/app.js'), 'utf8');
const webmcp = await readFile(join(root, 'src/webmcp.js'), 'utf8');
if (/name:\s*['"]drillboard_(close|approve|commit|finalize)/.test(app)) throw new Error('Agent approval/close tool violates the visible user-control boundary.');
if (!app.includes("bridgeName:'__drillboardWebMCP'")) throw new Error('Preview bridge is missing.');
if (!app.includes("state.exercise.role==='facilitator'")) throw new Error('Dynamic role-based registration is missing.');
if (!app.includes('EXERCISE_PHASES.CLOSEOUT_REVIEW')) throw new Error('Closeout-review lifecycle phase is missing.');
for (const contract of ['document?.modelContext', 'registerTool', 'AbortController', 'validateSchema(definition.inputSchema']) if (!webmcp.includes(contract)) throw new Error(`WebMCP compatibility contract missing: ${contract}`);
if (!webmcp.includes('globalThis.top !== globalThis.self')) throw new Error('Embedded-frame guard is missing from the WebMCP registry.');

// `_headers` is only consumed by hosts such as Netlify or Cloudflare Pages; ChatGPT Sites ignores it.
const headers = await readFile(join(root, '_headers'), 'utf8');
for (const header of ['Origin-Agent-Cluster', 'Permissions-Policy', 'X-Frame-Options: DENY', "frame-ancestors 'none'"]) if (!headers.includes(header)) throw new Error(`Optional deploy header missing from _headers: ${header}`);
if (headers.includes('Cross-Origin-Embedder-Policy')) throw new Error('_headers must not set Cross-Origin-Embedder-Policy; it adds risk without benefit for this app.');

const hosting = JSON.parse(await readFile(join(root, '.openai/hosting.json'), 'utf8'));
if (hosting.static?.directory !== 'dist') throw new Error('Static hosting output must be dist.');
const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
if (!manifest.name || !manifest.icons?.length) throw new Error('PWA manifest is incomplete.');

console.log(`Syntax checked ${jsFiles.length} JavaScript files.`);
console.log(`Verified ${requiredIds.length} UI anchors, top-level WebMCP lifecycle, embedded-frame guard, native schema validation, optional deploy headers, PWA metadata, and explicit visible user gates.`);
