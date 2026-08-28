# Devpost submission draft

## Inspiration

Teams learn incident leadership through tabletop exercises, but most exercise tools are either slide decks controlled by one facilitator or fully automated simulations that hide the reasoning. WebMCP enables a more interesting format: a person and agent share one live command board, while role boundaries remain explicit.

## What it does

Drillboard is a browser-native tabletop simulator for operational, cyber, and event-safety exercises. It tracks a fictional scenario clock, pressure metrics, objectives, injects, resources, staged response proposals, communication drafts, decisions, forecasts, and an after-action record.

The person chooses the agent role. In Coach mode, the agent can inspect the room, find risks, run forecasts, and stage responses. In Facilitator mode, it can additionally create injects, advance simulated time, update objectives, and resolve scenario developments. The agent can never approve a response, publish a communication, or close the exercise.

## How WebMCP changes the experience

Without WebMCP, an agent must infer the board from screenshots and manipulate many cards. Drillboard exposes typed, state-aware operations such as `drillboard_read_room`, `drillboard_stage_response`, `drillboard_create_inject`, and `drillboard_run_forecast`. Role changes dynamically unregister and register tools, so capability is part of the visible application state rather than a prompt-only instruction.

## How it was built

The project is a zero-dependency static app. The pure simulation engine handles bounded metric effects, resource allocation, deadlines, deterministic forecasts, scoring, and Markdown AAR export. The UI, local persistence, WebMCP registry, fallback Tool Lab, PWA shell, tests, CI, and GitHub Pages workflow are included.

## Challenges

The hardest part was making the agent useful without allowing it to silently become both exercise controller and decision-maker. The staged/approved split and role-scoped registration solve that. Another challenge was avoiding fake precision: forecasts are reproducible educational stress tests, clearly labeled as simulation rather than prediction.

## What is next

Future versions could support custom scenario builders, multiplayer roles, facilitator-only views, timed inject libraries, rubric-based evaluation, replay, organization-specific runbooks, and redacted export for training archives.
