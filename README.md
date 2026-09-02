# Drillboard

**A human–agent tabletop exercise room built for WebMCP.**

Drillboard gives an incident-training lead and a browser agent the same live room: scenario clock, objectives, scheduled and active injects, finite resources, bounded response proposals, communication drafts, seeded forecasts, an activity trail, and an after-action record.

> The agent can coach or facilitate. Drillboard exposes no approval or close tool; consequential decisions remain explicit, visible user gates.

[![CI](https://github.com/652036/drillboard/actions/workflows/ci.yml/badge.svg)](https://github.com/652036/drillboard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-66e2d5.svg)](LICENSE)

## How judges can verify native WebMCP (60 seconds)

1. **Open** <https://drillboard.st2p8g4tkf.chatgpt.site/> in a WebMCP-capable browser: the ChatGPT built-in browser, or Chrome 150+ (Chrome 149 previews also work) with `chrome://flags/#enable-webmcp-testing` enabled and the browser restarted. The app reads `document.modelContext ?? navigator.modelContext`.
2. **Check the header pill.** It should read **Native WebMCP · 9 tools** (Coach, response phase). "Tool Lab fallback" means the browser exposed no model context; "Embedded frame" means the page is inside an iframe.
3. **Paste these prompts** into the browser agent, one at a time (they are the same ones in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)):

   > Read this Drillboard room. Run a 60-minute forecast with 800 paths and seed 42. Then stage a response titled 'Route retry traffic', category `containment`, for objective `contain`, using two `sre` units. Use simulated effects `{impact:-8, uncertainty:-5, fatigue:3, trust:2, service:7}` and explain that it reduces retry amplification. Do not claim it is approved.

   Switch the visible **Agent role** control to **Facilitator** (pill shows **13 tools**), then:

   > Create a severity-3 inject called 'Processor failover delayed', category `vendor`, activating in 20 minutes with a 40-minute response window. Use effects `{impact:5, uncertainty:4, fatigue:2, trust:-2, service:-6}`. Then advance the exercise clock 30 minutes and summarize the visible changes.

   Approve the staged response on the board, then:

   > Stage a closeout rationale that names unresolved items and one lesson about resource review. Do not close or change phase.

4. **Watch the tool count change** as you act: Coach **9** → Facilitator up to **13** (12 once every inject is resolved) → after you click **Enter closeout review**, **4** read-only tools. Every tool call updates the same board you are looking at; nothing is approved, published, or closed without your click.
5. **No WebMCP browser?** Click **Tool Lab** in the header. It lists the identical live schemas and runs them through the same validator, or use the console bridge: `window.__drillboardWebMCP.listTools()`.

## Why WebMCP is essential

A tabletop exercise is a stateful collaboration, not a one-shot answer. Without WebMCP, an agent must repeatedly infer a dense board and actuate controls. Drillboard instead registers narrow tools against the page’s current state. A tool call updates the same state the person sees, and the resulting proposal, forecast, inject, observation, or activity event is immediately visible.

- The top-level page uses the current `document.modelContext.registerTool()` producer API (falling back to `navigator.modelContext` for Chrome 149 previews).
- Every input is a bounded JSON Schema with `additionalProperties: false`; native and Tool Lab executions share the same runtime validation.
- Each tool has its own `AbortSignal`; on role, phase, ID, or schema changes only the tools that actually changed are aborted and re-registered, and the diff is deferred while a native `execute()` is still in flight.
- Tools register only in the top-level document; a framed copy stays in preview mode.
- Coach and Facilitator expose different capabilities selected by a visible human control.
- Current objective, resource, and inject IDs become schema enums, reducing stale-ID calls.
- Read-only annotations and untrusted-content hints use the current WebMCP surface.
- Native callbacks return one ordinary object—never duplicated `content`/`structuredContent` wrappers—and every serialized output is held under a 4,000-character budget.
- Array-shaped room and risk sections are paged by whole item (`offset`/`limit`, `nextCursor` is `null` on the last page), so a page is always a valid JSON array and no key or string is split. The Markdown AAR is segmented by section and character `cursor`. Complete state remains retrievable without oversized calls.
- The built-in Tool Lab is a transparent fallback when native WebMCP is unavailable.

## Lifecycle and tool surface

The visible lifecycle is `response → closeout review → closed`.

- **Response:** Coach exposes 9 tools. Facilitator exposes up to 13, depending on whether an active inject can be resolved.
- **Closeout review:** a person may enter only after reviewing staged responses and communications and recording a rationale plus a lesson. Mutation tools are unregistered; 4 read-only tools remain.
- **Closed:** the room is terminal and read-only. Reset is the only way to begin a new drill.

Always registered:

| Tool | Purpose |
| --- | --- |
| `drillboard_read_room` | Read the compact summary, forecast, or closeout object, or page whole items from objectives, resources, injects, proposals, communications, review_queue, observations, decisions, activity |
| `drillboard_list_open_risks` | Page open risks as whole items tagged by kind (active/scheduled inject, objective, response, communication) |
| `drillboard_export_after_action` | Read a Markdown AAR section—or the complete record—in character-cursor segments, without closing |
| `drillboard_focus_view` | Bring a visible board section into the user’s viewport |

Registered during response:

| Tool | Purpose |
| --- | --- |
| `drillboard_run_forecast` | Publish a seeded, reproducible stress test |
| `drillboard_stage_response` | Prepare bounded effects and allocations for informed human approval |
| `drillboard_stage_communication` | Draft a factual update for human review |
| `drillboard_add_observation` | Add a visible, exportable training observation |
| `drillboard_stage_closeout` | Prepare rationale and lessons without changing phase |

Facilitator mode additionally registers `drillboard_create_inject`, `drillboard_advance_clock`, `drillboard_update_objective`, and—when applicable—`drillboard_resolve_inject`.

There is deliberately no agent-facing approve, publish, enter-review, resume, finalize, undo, or close tool. A browser agent may have separate generic UI automation capabilities outside this site’s WebMCP contract; Drillboard keeps its site tools and visible product gates explicit.

## Deterministic simulation, not fake prediction

Clock advancement and forecasting share the same simulation rules: activation-relative inject deadlines, partial exposure for delayed injects, bounded metric effects, objective deadlines, resource state, and fatigue. Forecast variance is seeded and reports P10/median/P90 for every metric and score. Its run key fingerprints the forecast-relevant board state plus horizon, path count, and seed. The visible board, `drillboard_read_room`, and AAR expose the generation clock and both generated/current fingerprints; after a relevant board mutation, the retained result is explicitly marked historical and stale.

The result is a reproducible training stress test—not an operational forecast. Each output states its assumptions and containment definition.

## Scenarios and audience

Included fictional scenarios cover a checkout outage, a ransomware drill for a logistics operator, and heat/transport pressure at a crowded festival. The immediate audience is incident-training leads, reliability and security teams, continuity planners, and event-safety facilitators who currently coordinate exercises through slide decks and scattered notes.

## Run and inspect locally

Requires Node.js 22 or newer (the test script relies on Node's built-in test-file globbing). There are no runtime dependencies.

```bash
git clone https://github.com/652036/drillboard.git
cd drillboard
npm ci
npm run dev
```

Open `http://127.0.0.1:4174`. For native Chrome testing, enable WebMCP in a compatible Chrome build and use a real HTTP origin. The app registers tools from the top-level document, not an iframe.

The fallback inspector exposes the same definitions and runtime validation:

```js
window.__drillboardWebMCP.listTools();
await window.__drillboardWebMCP.executeTool('drillboard_read_room', {});
window.__drillboardWebMCP.status();
```

## Verify and build

```bash
npm run verify
npm run build
```

The automated tests (55, run with `node --test`) cover the simulation engine, forecast freshness, state fingerprinting, delayed/future injects, deterministic forecasts, lifecycle gates, terminal closure, staged-versus-approved decisions, collection limits, stored-state shape validation, raw closeout draft text, metric rounding, transactional persistence rollback, scheduled-risk visibility, Markdown-safe AAR export, item-based paging and text segmentation, schemas, native validation, cancellation, per-tool registration diffing, in-flight sync deferral, embedded-frame refusal, retry after API/registration failure, AbortSignal unregistration, and UI source contracts (CSP, inline forms, live region, service worker). The static verifier checks top-level WebMCP contracts, the embedded-frame guard, UI anchors, optional deploy headers, PWA metadata, and the absence of agent approval/close tools.

## Deployment

Production WebMCP URL: <https://drillboard.st2p8g4tkf.chatgpt.site/>

The Devpost submission uses this HTTPS production deployment so judges can test native WebMCP directly.

**Response headers.** ChatGPT Sites does not support custom response headers, so production does not send `Origin-Agent-Cluster`, `Permissions-Policy`, COOP, or similar headers. None are required: WebMCP is available on the top-level document with the browser default `Permissions-Policy: tools=self`, and the app additionally refuses to register tools when framed. The repository's `_headers` file is only for hosts that read it (Netlify, Cloudflare Pages) and adds `X-Frame-Options: DENY` and `frame-ancestors 'none'` there. `index.html` ships its own `<meta http-equiv="Content-Security-Policy">` so the CSP applies on every host.

GitHub Pages is not currently enabled for this repository. If it is enabled with GitHub Actions as the source, `.github/workflows/pages.yml` verifies, builds, and publishes `dist/` on every push to `main`.

## Challenge material

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)
- [`docs/DEVPOST_SUBMISSION.md`](docs/DEVPOST_SUBMISSION.md)
- [`SECURITY.md`](SECURITY.md)

Before submission, add a public demo-video URL. The demo must be under three minutes, include audio, show the working native WebMCP flow, and be publicly accessible on YouTube.

## License

MIT
