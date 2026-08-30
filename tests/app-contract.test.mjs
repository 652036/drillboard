import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('visible forecast and read-room surfaces expose freshness metadata', () => {
  assert.match(app, /forecastStatus\(state\.exercise,forecast\)/);
  assert.match(app, /Outdated forecast — board changed/);
  for (const field of ['generatedAtClock', 'generatedAtStateFingerprint', 'currentStateFingerprint', 'stale']) assert.match(app, new RegExp(field));
});

test('closeout UI disables finalization when review readiness becomes invalid', () => {
  assert.match(app, /elements\.closeoutButton\.disabled=closed\|\|!readiness\.ready/);
  assert.match(app, /Closeout review blocked:/);
  assert.match(app, /elements\.closeoutCheck\.disabled=closed\|\|!reviewing\|\|!readiness\.ready/);
});

test('native registration failures and transactional persistence are wired into the UI', () => {
  assert.match(html, /id="webmcp-error"[^>]*role="status"/);
  assert.match(app, /status\.lastError/);
  assert.match(app, /Native WebMCP registration failed:/);
  assert.match(app, /commitState\(state/);
});
