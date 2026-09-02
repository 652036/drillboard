# Devpost submission draft

## Project name

Drillboard

## Tagline

A live incident-exercise room where people decide and browser agents coach or facilitate through state-aware WebMCP tools.

## Submission links

- **Production WebMCP URL:** https://drillboard.st2p8g4tkf.chatgpt.site/
- **Public source:** https://github.com/652036/drillboard
- **Demo video:** TODO(video): replace with the public YouTube URL before submission — audio required, under three minutes. Do not submit with this placeholder.

## Inspiration

Teams learn incident leadership through tabletop exercises, but many exercises still run from one facilitator’s slide deck while decisions scatter across chat and notes. A browser agent can help surface risk and keep a scenario moving, yet giving it an opaque “run the incident” prompt collapses facilitation and judgment into the same actor.

WebMCP enables a more useful product: the person and agent share one live room, while the page exposes exactly which actions are available in the current role and lifecycle phase.

## What it does

Drillboard is a browser-native tabletop simulator for reliability, cyber, continuity, and event-safety training. It tracks a fictional clock, pressure metrics, scheduled and active injects, objectives, finite resources, response proposals, communication drafts, training observations, deterministic forecasts, decisions, lifecycle phase, and a Markdown after-action record.

The person selects the agent role:

- **Coach** reads the room, finds risks, runs forecasts, and stages bounded responses, communications, observations, and closeout material.
- **Facilitator** additionally creates fictional injects, advances simulated time, updates objectives, and resolves active developments.

The site exposes no WebMCP tool for approval, publication, lifecycle transition, undo, or closure. Those operations are explicit visible user gates. Response cards show projected metric, objective, and resource effects before approval. A separate closeout-review phase removes every mutation tool before final confirmation.

## How WebMCP changes the experience

Without WebMCP, an agent must repeatedly parse a dense board and actuate many controls. Drillboard’s top-level page registers narrow tools with `document.modelContext.registerTool()`. Tool calls use current IDs and immediately update the same state visible to the person.

The implementation goes beyond a static list:

- Coach has 9 response tools; Facilitator has up to 13.
- Objective, resource, and active-inject IDs become live schema enums.
- Changing role, phase, or IDs re-registers only the tools whose public metadata changed; each tool owns its own `AbortController`, and the diff waits for any in-flight `execute()` to settle.
- Closeout review and closed phases retain only 4 read-only tools.
- Native and fallback executions use identical schema validation because preview browsers may not enforce schemas before callback invocation.
- Registration retries after late API availability or a transient failure, and is skipped entirely when the page is framed.
- Tool callbacks receive cancellation state through `options.signal`.
- Native callbacks return one ordinary verifiable object, with no duplicated MCP wrapper.
- Tool descriptions state what each tool does and where the result appears on the board, enumerate every `section`/`kind`/`view` value, carry defaults, and give an effect-magnitude guide (±5 minor, ±10 material, ±15+ severe).
- Every result is limited to a 4,000-character serialized budget; room and risk tools page whole items (`offset`/`limit`/`nextCursor`) so an LLM never receives half a JSON key, and the AAR tool segments Markdown by section and cursor.

## How it was built

Drillboard is a zero-runtime-dependency static app:

- `src/engine.js` contains pure simulation, scoring, lifecycle, forecast, and export functions.
- `src/app.js` owns visible state, persistence, informed review cards, and live tool definitions.
- `src/paging.js` enforces bounded output, item-based JSON pages, and reconstructable Markdown segments.
- `src/webmcp.js` owns registration, AbortSignal unregistration, metadata fingerprinting, serialized sync, retry, validation, cancellation, and Tool Lab fallback.
- A versioned PWA shell supports offline revisits without pinning clients to stale navigation.
- CI runs syntax/static invariants, automated tests, and the production build.
- Hosting is ChatGPT Sites, which sends no custom response headers; WebMCP works on the top-level document with the default `tools=self` policy, `index.html` carries its own CSP meta tag, and the registry refuses to register tools when framed. The `_headers` file is only for Netlify/Cloudflare-style hosts.

Forecasting is intentionally a training stress test, not fake operational intelligence. It advances a deterministic copy through the same inject timing, effects, deadlines, and fatigue rules as the clock engine, then applies seeded variance. It reports P10/median/P90 for every metric and score, states the containment definition and limitations, and generates a run key from a fingerprint of forecast-relevant state plus inputs. Generation clock and generated/current fingerprints are visible to the person and tools; later state changes relabel the stored result as historical rather than current.

## Challenges

The hardest problem was keeping the agent useful without making its site tools both proposer and decision-maker. The staged/approved split, informed-effect previews, visible role selector, and closeout-review lifecycle make that boundary concrete.

Native compatibility also required defensive work. Tool schemas are descriptive contracts, but current preview behavior may not reject invalid input. Drillboard therefore validates inside the native execute wrapper as well. The registry fingerprints full metadata rather than names alone, so changing a live ID enum actually re-registers the tool. Failed or late native registration can retry instead of getting stuck behind a stale signature.

A third challenge was simulation consistency. Delayed injects must affect only the interval after activation, deadlines must begin at activation, and forecasts must use each inject’s effect vector rather than severity alone. Sharing the advancement baseline solved those mismatches and kept seeded runs reproducible.

## Accomplishments

- A coherent three-scenario product rather than a tool-registration proof of concept
- A visible 9 → 13 → 4 tool lifecycle across Coach, Facilitator, and closeout review
- Informed human response review with live resource-conflict detection
- Scheduled-inject visibility and exposure-weighted clock advancement
- State-fingerprinted deterministic forecasts with complete uncertainty ranges
- Terminal, human-entered closeout with unresolved-state preservation
- Observable/exportable agent observations and a complete AAR
- Automated coverage for engine invariants and native WebMCP lifecycle behavior

## Potential impact

The first audience is incident-training leads, SRE and security teams, continuity planners, and event-safety facilitators. Their recurring problem is not a lack of AI-generated advice; it is keeping participants aligned on time, evidence, constraints, ownership, and review during a fast exercise. Drillboard makes the agent an accountable participant in that shared state while leaving consequential judgment visible.

The concept can extend to custom scenario libraries, multiplayer roles, rubric-based evaluation, replay, and organization-specific runbooks. The underlying pattern—dynamic tools following a visible human-owned workflow—also applies beyond incident training.

## Creativity and ambition

Most agent demos automate a fixed task. Drillboard instead treats the tool surface itself as part of the simulation: a human role choice expands capabilities; active IDs reshape schemas; a human lifecycle transition removes mutations; and the agent’s outputs become shared exercise artifacts rather than hidden chat answers. The product demonstrates WebMCP as a live collaboration boundary, not merely faster clicking.

## Testing

Run (Node.js 22 or newer):

```bash
npm ci
npm run verify
npm run build
```

`npm run verify` runs the static verifier plus 55 automated tests across five files (`engine`, `paging`, `state`, `webmcp`, `app-contract`). They cover deterministic advancement and forecast reproducibility/freshness, future inject effects, partial exposure, activation-relative deadlines, score calibration, state fingerprints, proposal staging and approval, resource guards, bounded collections, transactional storage rollback, communication decisions, scheduled-risk visibility, lifecycle blockers including review-time invalidation, terminal closure, raw closeout draft text with an 8-lesson cap, stored-state shape validation, metric rounding, Markdown-safe AAR export, item-based paging (whole items, budget shrink, empty/out-of-range offsets), text segmentation, nested schema bounds, native validation, cancellation, per-tool registration diffing, in-flight sync deferral, embedded-frame refusal, AbortSignal cleanup, late API availability, registration retry, and UI contracts (no `prompt`/`confirm`, CSP meta without inline styles, labelled inline forms, focus restoration, a single live region, service-worker clone-before-cache).

For native acceptance, open the production URL in a WebMCP-capable browser, verify the **Native WebMCP** pill, then follow `docs/DEMO_SCRIPT.md`. The 9 → 13 → 4 count change and visible board mutations are the primary acceptance path.

## What is next

Custom scenario builders, multi-participant roles, facilitator-only information, timed inject libraries, evaluation rubrics, replay, redacted exports, and organization-specific runbook references.

## Final manual checklist

- [ ] Confirm the production URL above opens without authentication
- [ ] Run the native acceptance flow on that production origin
- [ ] Record the 2:35 script with audible narration
- [ ] Upload publicly to YouTube and replace the `TODO(video)` placeholder above and in Devpost
- [ ] Confirm the repository is public and MIT `LICENSE` is visible
- [ ] Submit before **September 3, 2026 at 1:00 PM PDT**
