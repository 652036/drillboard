import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

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

test('closeout textareas are not rewritten while focused and draft input does not reset checkbox or undo history', () => {
  assert.match(app, /document\.activeElement!==textarea/);
  assert.match(app, /lessonsText/);
  assert.match(app, /renderedCloseoutPhase!==state\.exercise\.phase/);
  const draftSync = app.slice(app.indexOf('function syncCloseoutDraft'), app.indexOf('function saveCloseoutInput'));
  assert.doesNotMatch(draftSync, /draft\.history=\[\]/);
  assert.doesNotMatch(draftSync, /elements\.closeoutLessons\.value=/);
  assert.doesNotMatch(draftSync, /throw new Error/);
});

test('decision notes and inject outcomes use labelled inline forms instead of window.prompt/confirm/alert', () => {
  assert.doesNotMatch(app, /\bprompt\(/);
  assert.doesNotMatch(app, /\bconfirm\(/);
  assert.doesNotMatch(app, /\balert\(/);
  assert.match(app, /data-decision-form/);
  assert.match(app, /<label for="\$\{inputId\}">/);
  assert.match(app, /event\.key==='Escape'/);
  assert.match(app, /data-cancel-decision/);
  assert.match(app, /type="submit"/);
});

test('tool descriptions are positive, explain enums, carry defaults, and only hint untrusted content where it exists', () => {
  const definitionsSource = app.slice(app.indexOf('function definitions()'), app.indexOf('async function syncTools'));
  for (const negative of ['cannot approve', 'cannot enter review', 'does not publish', 'Available only in', 'Facilitator mode only', 'cannot finalize']) assert.doesNotMatch(definitionsSource, new RegExp(negative), `negative phrasing: ${negative}`);
  assert.match(definitionsSource, /Stage a response proposal that appears in the visible review queue/);
  for (const key of ['horizon_minutes', 'simulations', 'seed']) assert.match(definitionsSource, new RegExp(`${key}:\\{[^}]*default:\\d+`), `${key} needs a default`);
  assert.match(app, /±5 minor, ±10 material, ±15 or more severe/);
  assert.match(definitionsSource, /name:'drillboard_focus_view'[^\n]*annotations:readOnlyFixedOutput/);
  assert.match(app, /const readOnlyFixedOutput=\{readOnlyHint:true\};/);
  for (const guide of ['roomSectionGuide', 'riskKindGuide', 'aarSectionGuide', 'viewGuide']) assert.match(definitionsSource, new RegExp(`enumGuide\\(${guide}\\)`));
});

test('accessibility: unique button names, focus restoration, one short live region, readable sizes, reduced-motion scrolling', () => {
  for (const attribute of ['data-approve-proposal', 'data-reject-proposal', 'data-resolve-inject', 'data-progress-objective', 'data-approve-comms', 'data-reject-comms']) {
    assert.match(app, new RegExp(`${attribute}="\\$\\{[^}]+\\}" aria-label="[^"]*\\$\\{escapeHtml\\(`), `${attribute} buttons need a unique aria-label`);
  }
  assert.match(app, /const focused=focusSelector\(document\.activeElement\)/);
  assert.match(app, /restoreFocus\(focused\)/);
  assert.match(html, /<p id="live-status" class="visually-hidden" role="status" aria-live="polite"><\/p>/);
  for (const id of ['proposal-list', 'forecast-panel', 'closeout-status', 'tool-output']) {
    const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))[0];
    assert.doesNotMatch(tag, /aria-live/, `${id} must not be a live region`);
  }
  assert.doesNotMatch(app, /scrollIntoView\(\{behavior:'smooth'/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  const tiny = [...css.matchAll(/font-size:\s*\.(\d+)rem/g)].map((match) => Number(`0.${match[1]}`)).filter((size) => size < 0.75);
  assert.deepEqual(tiny, [], `font sizes below 0.75rem: ${tiny.join(', ')}`);
});

test('CSP meta is present and no inline style attributes or event handlers are emitted', () => {
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'">/);
  assert.doesNotMatch(html, /frame-ancestors/, 'frame-ancestors is ignored in a meta tag; it belongs in _headers');
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /\son[a-z]+="/);
  assert.doesNotMatch(app, /style="/);
  assert.doesNotMatch(app, /\son[a-z]+="/);
  assert.match(app, /style\.setProperty\('width'/);
});

test('stored state is shape-checked on load and the first render is guarded with a visible reset notice', () => {
  assert.match(app, /isValidExerciseShape\(parsed\.exercise\)/);
  assert.match(app, /Array\.isArray\(parsed\.activity\)/);
  assert.match(app, /function boot\(\)\{\s*try\{render\(\);\}/);
  assert.match(app, /The stored exercise was reset because it could not be displayed/);
  assert.match(app, /announce\('Stored exercise was reset\.'\)/);
  assert.match(app, /\nboot\(\);\s*$/);
});

test('theme lives in its own storage key and reset/scenario switches use an inline confirmation', () => {
  assert.match(app, /const THEME_KEY = 'drillboard\.theme';/);
  assert.match(app, /localStorage\.setItem\(THEME_KEY,theme\)/);
  assert.doesNotMatch(app, /draft\.theme/);
  assert.doesNotMatch(app, /theme:'dark' \}/);
  assert.match(html, /<div id="reset-confirm" class="inline-confirm" role="group" aria-labelledby="reset-confirm-text" hidden>/);
  assert.match(app, /function hasUnexportedWork\(\)/);
  assert.match(app, /elements\.preset\.addEventListener\('change',\(\)=>requestReset\(elements\.preset\.value\)\)/);
  assert.match(app, /elements\.reset\.addEventListener\('click',\(\)=>requestReset\(\)\)/);
  assert.match(app, /exportedFingerprint/);
});

test('service worker clones before caching, serves code network-first, and caches only ok index navigations under v4', () => {
  assert.match(sw, /const CACHE = 'drillboard-v4';/);
  assert.match(sw, /const copy = response\.clone\(\);\s*\n\s*return caches\.open/);
  assert.doesNotMatch(sw, /cache\.put\([^)]*response\.clone\(\)/, 'clone must happen before caches.open resolves');
  assert.match(sw, /isCodeAsset\(url\) \? networkFirst/);
  assert.match(sw, /isIndexRequest\(url\) \? networkFirst\(event\.request, '\.\/index\.html'\)/);
  assert.match(sw, /if \(response\.ok\) store/);
  for (const module of ['app', 'data', 'engine', 'paging', 'state', 'webmcp']) assert.match(sw, new RegExp(`'\\./src/${module}\\.js'`));
});

test('escapeHtml covers single quotes and persisted undo history is truncated below the in-memory cap', () => {
  assert.match(app, /"'":'&#39;'/);
  assert.match(app, /const PERSISTED_HISTORY = 12;/);
  assert.match(app, /const MAX_HISTORY = 36;/);
  assert.match(app, /function persist\(nextState=state\)\{[^\n]*history:\(nextState\.history\|\|\[\]\)\.slice\(-PERSISTED_HISTORY\)/);
});

test('persist is never passed directly as an event listener (event object would overwrite storage)', () => {
  assert.doesNotMatch(app, /addEventListener\(\s*['"][^'"]+['"]\s*,\s*persist\s*\)/);
  assert.doesNotMatch(app, /addEventListener\(\s*['"]beforeunload['"]/);
});
