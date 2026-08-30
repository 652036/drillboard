# Drillboard

**A human–agent tabletop exercise room built for WebMCP.**

Drillboard gives an incident-training lead and a browser agent the same live room: scenario clock, objectives, scheduled and active injects, finite resources, bounded response proposals, communication drafts, seeded forecasts, an activity trail, and an after-action record.

> The agent can coach or facilitate. Drillboard exposes no approval or close tool; consequential decisions remain explicit, visible user gates.

[![CI](https://github.com/652036/drillboard/actions/workflows/ci.yml/badge.svg)](https://github.com/652036/drillboard/actions/workflows/ci.yml)
[![Deploy](https://github.com/652036/drillboard/actions/workflows/pages.yml/badge.svg)](https://github.com/652036/drillboard/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-66e2d5.svg)](LICENSE)

## Why WebMCP is essential

A tabletop exercise is a stateful collaboration, not a one-shot answer. Without WebMCP, an agent must repeatedly infer a dense board and actuate controls. Drillboard instead registers narrow tools against the page’s current state. A tool call updates the same state the person sees, and the resulting proposal, forecast, inject, observation, or activity event is immediately visible.

- The top-level page uses the current `document.modelContext.registerTool()` producer API.
- Every input is a bounded JSON Schema with `additionalProperties: false`; native and Tool Lab executions share the same runtime validation.
- Registrations use an `AbortSignal`, honor execution cancellation, and are replaced when role, phase, IDs, or schemas change.
- Coach and Facilitator expose different capabilities selected by a visible human control.
- Current objective, resource, and inject IDs become schema enums, reducing stale-ID calls.
- Read-only annotations and untrusted-content hints use the current WebMCP surface.
- Native callbacks return one ordinary object—never duplicated `content`/`structuredContent` wrappers—and every serialized output is held under a 1,500-character budget.
- Large room, risk, and AAR views use `section`/`cursor` segments with `nextCursor`, so complete state remains retrievable without oversized calls.
- The built-in Tool Lab is a transparent fallback when native WebMCP is unavailable.

## Lifecycle and tool surface

The visible lifecycle is `response → closeout review → closed`.

- **Response:** Coach exposes 9 tools. Facilitator exposes up to 13, depending on whether an active inject can be resolved.
- **Closeout review:** a person may enter only after reviewing staged responses and communications and recording a rationale plus a lesson. Mutation tools are unregistered; 4 read-only tools remain.
- **Closed:** the room is terminal and read-only. Reset is the only way to begin a new drill.

Always registered:

| Tool | Purpose |
| --- | --- |
| `drillboard_read_room` | Read a compact summary or cursor-segmented room section |
| `drillboard_list_open_risks` | Page bounded JSON across active/scheduled injects, objectives, and reviews |
| `drillboard_export_after_action` | Page a Markdown section—or the complete AAR—without closing |
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

The automated tests cover the simulation engine, forecast freshness, state fingerprinting, delayed/future injects, deterministic forecasts, lifecycle gates, terminal closure, staged-versus-approved decisions, collection limits, transactional persistence rollback, scheduled-risk visibility, Markdown-safe AAR export, schemas, native validation, cancellation, dynamic re-registration, retry after API/registration failure, and AbortSignal unregistration. The static verifier checks top-level WebMCP contracts, UI anchors, PWA metadata, and the absence of agent approval/close tools.

## Deployment

Production WebMCP URL: <https://drillboard.st2p8g4tkf.chatgpt.site/>

The Devpost submission should use this verified HTTPS production deployment so judges can test native WebMCP directly.

GitHub Pages remains useful as a UI and Tool Lab preview: `https://652036.github.io/drillboard/`. It does not preserve the project-defined `_headers`, so use the production URL above unless native registration on Pages is independently verified. The Pages workflow still verifies and publishes every push to `main` once Pages is enabled with GitHub Actions as the source.

## Challenge material

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)
- [`docs/DEVPOST_SUBMISSION.md`](docs/DEVPOST_SUBMISSION.md)
- [`SECURITY.md`](SECURITY.md)

Before submission, add a public demo-video URL. The demo must be under three minutes, include audio, show the working native WebMCP flow, and be publicly accessible on YouTube.

## License

MIT
