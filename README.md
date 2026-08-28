# Drillboard

**A human–agent tabletop exercise simulator built for WebMCP.**

Drillboard turns incident training into a shared browser room. A person and agent can see the same scenario clock, objectives, injects, resources, risk queue, response proposals, communication drafts, deterministic forecast, decision trail, and after-action record.

> The agent can coach or facilitate. The human still decides.

[![CI](https://github.com/652036/drillboard/actions/workflows/ci.yml/badge.svg)](https://github.com/652036/drillboard/actions/workflows/ci.yml)
[![Deploy](https://github.com/652036/drillboard/actions/workflows/pages.yml/badge.svg)](https://github.com/652036/drillboard/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-66e2d5.svg)](LICENSE)

## Why this is a WebMCP app

A tabletop exercise is a stateful collaboration, not a one-shot answer. WebMCP lets the agent operate on the same live board the person is inspecting instead of reconstructing it from a screenshot.

- Typed tools expose scenario state, IDs, deadlines, and bounded effects.
- Coach and facilitator roles dynamically register different capabilities.
- Forecasts, injects, proposals, and activity immediately become visible.
- Agent responses and communications are always staged for human review.
- Only visible human controls approve decisions, publish communications, and close the exercise.
- Closing an exercise unregisters mutation tools.

## Role-scoped tools

Always available:

| Tool | Purpose |
| --- | --- |
| `drillboard_read_room` | Read the full exercise room and human-control boundary |
| `drillboard_list_open_risks` | List active injects, open objectives, and staged reviews |
| `drillboard_export_after_action` | Return a Markdown AAR without closing the drill |
| `drillboard_focus_view` | Bring a board section into the human viewport |

Available while the exercise is open:

| Tool | Purpose |
| --- | --- |
| `drillboard_run_forecast` | Publish a deterministic Monte Carlo stress test |
| `drillboard_stage_response` | Prepare a response for human approval |
| `drillboard_stage_communication` | Draft an update for human approval |
| `drillboard_add_observation` | Add a factual training observation |
| `drillboard_stage_closeout` | Prepare rationale and lessons for the human closeout gate |
| `drillboard_undo_last_change` | Undo the latest reversible mutation |

Facilitator mode additionally exposes:

| Tool | Purpose |
| --- | --- |
| `drillboard_create_inject` | Add a fictional scenario development |
| `drillboard_advance_clock` | Advance simulated time and apply pressure |
| `drillboard_update_objective` | Update exercise objective progress/status |
| `drillboard_resolve_inject` | Record a simulated inject outcome |

There is deliberately no approve, publish, commit, finalize, or close tool.

## Scenarios

- Checkout outage during a high-traffic launch
- Ransomware drill for a logistics operator
- Heat and transport pressure at a crowded festival

Every scenario is fictional. Drillboard is a training demonstration, not operational guidance for a live emergency.

## Run locally

```bash
git clone https://github.com/652036/drillboard.git
cd drillboard
npm ci
npm run dev
```

Open `http://127.0.0.1:4174`.

The app uses `document.modelContext`, feature-detects the legacy API location, and provides a built-in Tool Lab when native WebMCP is unavailable.

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

Tests cover time pressure, staged-vs-approved decisions, bounded injects, deterministic forecasting, risk aggregation, AAR export, schemas, dynamic role registration, UI anchors, and the no-agent-approval/no-agent-close invariants.

## Architecture and challenge material

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)
- [`docs/DEVPOST_SUBMISSION.md`](docs/DEVPOST_SUBMISSION.md)
- [`SECURITY.md`](SECURITY.md)

## Deployment

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** once. The included workflow then verifies and publishes each push to `main`.

Expected URL: `https://652036.github.io/drillboard/`

## License

MIT
