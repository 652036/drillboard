# Drillboard architecture

## One room, two interfaces

The visible command board and the WebMCP tool surface share the same exercise state and pure simulation engine. Injects, objectives, resources, response proposals, communication drafts, forecasts, decisions, activity, and closeout are observable in both interfaces.

## Role-scoped registration

A person selects **Coach** or **Facilitator** in the page. `src/app.js` builds a role-specific set of tool definitions. `src/webmcp.js` aborts the previous registrations and registers the new set with `document.modelContext`. Coach mode can analyze and stage work. Facilitator mode additionally exposes inject, clock, objective, and resolution tools.

The role is page state, not a hidden prompt convention. The agent can inspect its active tools and the person can see which role is selected.

## Simulation engine

`src/engine.js` is deterministic and side-effect free. Advancing time applies bounded inject pressure, overdue-objective penalties, resource coverage, and fatigue. Human-approved proposals apply explicit metric effects and simulated allocations. A seeded Monte Carlo forecast perturbs the current trajectory and reports containment probability and P10/median/P90 metric ranges.

## Human-control boundary

Agent response and communication tools only create `staged` objects. Approval functions are called exclusively from visible buttons. No WebMCP tool contains close, approve, commit, or finalize semantics. Closeout can be staged by an agent and accepted only through the human gate. Once closed, mutation tools are removed.
