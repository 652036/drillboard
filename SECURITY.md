# Security and safety model

Drillboard is a local-first training simulation. Its scenarios, metrics, forecasts, and recommendations are fictional exercise artifacts, not operational guidance for a live emergency.

## Site-tool finalization boundary

The WebMCP surface may read the room, run forecasts, add observations, create facilitator injects, advance simulated time, update scenario state, and stage response, communication, or closeout material. It exposes no tool for approval, publication, lifecycle transition, undo, finalization, or closure.

Response effects are applied only through the visible review buttons. Entering closeout review and terminal closure require visible controls, readiness checks, and explicit user confirmation. This is a capability boundary for Drillboard’s site tools; a general browser/computer-use agent may have separate UI automation outside the WebMCP contract, so the application does not claim it can identify who physically clicked a control.

## Least capability by role and phase

- Coach response mode registers analysis and staging tools.
- Human-selected Facilitator response mode additionally registers fictional inject, clock, objective, and active-inject resolution tools.
- Closeout review and closed phases unregister all mutation tools and retain four read-only tools.
- Closed state is terminal; Reset creates a new exercise instead of reopening the old one.

The current role and phase are visible page state. Tool callbacks also recheck response phase, and facilitator callbacks recheck the live role, protecting the short interval while old native registrations are being aborted.

## Input and state integrity

- Every input schema is a closed object with `additionalProperties: false`.
- Strings, arrays, numeric effects, time steps, severity, simulation counts, and seeds are bounded.
- Current objective, resource, and active-inject IDs are exposed as live enums.
- Native callbacks validate again at execution because preview browser implementations may not enforce the declared schema.
- Resource availability is checked when staging and again at approval; conflicting cards disable approval.
- Future or already-resolved injects cannot be resolved.
- Complete objectives require an explicit reopen status before progress can be reduced.
- Forecast output is seeded, state-fingerprinted, and labeled as a training signal rather than a prediction; retained output is marked stale after forecast-relevant state changes.
- High-growth exercise collections are capped, and clone-first persistence leaves live state unchanged when browser storage fails.

## Registration integrity and cancellation

Registrations use `AbortController`; role, phase, and schema changes abort the previous set. Full public metadata is fingerprinted so dynamic ID changes trigger re-registration. Partial registration failure aborts the attempted set, reports fallback status, and remains retryable. Native `execute(input, { signal })` wrappers reject already-cancelled calls before mutation.

Native and Tool Lab execution enforce a 1,500-character serialized-result budget. Large state and AAR reads are segmented by explicit section and character cursor, preserving complete retrieval while preventing one tool call from reflecting an unbounded local collection. Native callbacks return a single plain object rather than duplicate MCP payload wrappers.

## Untrusted content

Descriptions, observations, rationales, inject text, and communication drafts may contain user- or agent-generated content. Tool definitions therefore set `untrustedContentHint: true`, and the UI escapes rendered text. Markdown AAR export collapses every user-controlled field to one line and escapes Markdown/HTML control characters so content cannot inject report sections. Tool descriptions instruct drafts to remain factual and avoid invented claims.

## Data and network

Exercise state stays in browser `localStorage`. The app has no analytics, remote API, account system, secrets, or third-party runtime assets. Export creates a local Markdown file. The service worker caches only same-origin static assets.

Do not place real incident secrets, personal data, credentials, regulated records, or live emergency instructions in a Drillboard scenario.

## Reporting

Open a private security advisory in the GitHub repository when possible. Otherwise contact the repository owner without including sensitive exploit details in a public issue.
