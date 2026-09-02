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

Each tool owns its own `AbortController`. On every sync the registry fingerprints each tool's public metadata and diffs by name: tools that disappeared or changed are aborted, tools that are new or changed are registered, and unchanged tools keep their existing registration. If a sync is requested while a native `execute()` is still pending (for example a tool call that mutates state and re-renders), the registry defers the diff until that call settles, because aborting a registration mid-call cancels the call in Chrome builds before 153. Partial registration failure aborts the attempted set, reports fallback status, and remains retryable. Native `execute(input, { signal })` wrappers reject already-cancelled calls before mutation.

## Top-level document only

Drillboard registers WebMCP tools only when it is the top-level document (`window.top === window.self`). If the page is loaded inside an iframe, the registry stays in preview mode, performs no native registration, and the header status reads “Embedded frame: native tools disabled”. This prevents an embedding page from surfacing Drillboard's tools to its own agent context. The optional `_headers` file additionally sends `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` on hosts that honour it.

Native and Tool Lab execution enforce a 4,000-character serialized-result budget. Array-shaped room and risk sections are paged by whole item (`offset`/`limit`, `nextCursor`), so a page never splits a key or string and always parses as JSON; the Markdown AAR is segmented by section and character cursor. This preserves complete retrieval while preventing one tool call from reflecting an unbounded local collection. Native callbacks return a single plain object rather than duplicate MCP payload wrappers.

## Untrusted content

Descriptions, observations, rationales, inject text, and communication drafts may contain user- or agent-generated content. Tool definitions therefore set `untrustedContentHint: true`, and the UI escapes rendered text. Markdown AAR export collapses every user-controlled field to one line and escapes Markdown/HTML control characters so content cannot inject report sections. Tool descriptions instruct drafts to remain factual and avoid invented claims.

## Data and network

Exercise state stays in browser `localStorage`. The app has no analytics, remote API, account system, secrets, or third-party runtime assets. Export creates a local Markdown file. The service worker caches only same-origin static assets.

`index.html` declares a `<meta http-equiv="Content-Security-Policy">` (`default-src 'self'`, no inline scripts or styles, `object-src 'none'`) so the policy applies regardless of host. The production host, ChatGPT Sites, does not support custom response headers and therefore sends no `Origin-Agent-Cluster`, `Permissions-Policy`, or COOP headers; WebMCP does not require them on a top-level document (the browser default is `tools=self`). The `_headers` file is honoured only by hosts such as Netlify or Cloudflare Pages and intentionally omits `Cross-Origin-Embedder-Policy`.

Do not place real incident secrets, personal data, credentials, regulated records, or live emergency instructions in a Drillboard scenario.

## Reporting

Open a private security advisory in the GitHub repository when possible. Otherwise contact the repository owner without including sensitive exploit details in a public issue.
