# Demo script — target 2:35

The distinguishing story is a browser agent changing roles inside one live exercise room, with the WebMCP tool surface changing as the scenario moves through its lifecycle. Keep forecast details short; spend the saved time on dynamic registration, visible state, and the closeout transition.

## Before recording

- Use `https://drillboard.st2p8g4tkf.chatgpt.site/` in a native WebMCP-capable browser.
- Confirm the header pill says **Native WebMCP**, not Tool Lab fallback.
- Reset to **Checkout outage**, **Coach**, response phase, with no stored proposals. If the board has unexported changes, Reset shows an inline confirmation; choose **Discard and reset**.
- Keep browser zoom around 80–90% so the tool count, board changes, and human controls fit on screen.
- Record audible narration. Export at 1080p and keep the public YouTube video under three minutes.

## Shot list and narration

### 0:00–0:18 — The problem and shared room

Show the command board and native status pill.

> “Incident exercises usually live in a facilitator’s slides while an AI sees fragments. Drillboard gives the person and browser agent the same live room: clock, pressure, objectives, finite resources, injects, and review queues.”

Point to **Coach** and the **9 tools** status.

### 0:18–0:48 — Coach reads and stages, without deciding

Ask the browser agent:

> “Read this Drillboard room. Run a 60-minute forecast with 800 paths and seed 42. Then stage a response titled ‘Route retry traffic’, category `containment`, for objective `contain`, using two `sre` units. Use simulated effects `{impact:-8, uncertainty:-5, fatigue:3, trust:2, service:7}` and explain that it reduces retry amplification. Do not claim it is approved.”

Let the agent call `drillboard_read_room`, `drillboard_run_forecast`, and `drillboard_stage_response`.

> “These are direct typed calls against current page state—not screenshot inference. The forecast and proposal appear on the same board immediately.”

### 0:48–1:12 — Informed human approval

Show the proposal’s approval preview: metric before/after values, objective progress, and SRE availability.

> “The site exposes no approval tool. The response remains staged and applies nothing until a person reviews these exact effects.”

Click **Approve response**; an inline note field opens on the card (no browser dialog). Keep or edit the note, press **Confirm approval**, and show metrics, objective progress, resource allocation, and activity trail update together.

### 1:12–1:47 — Human-selected Facilitator role changes capabilities

Switch the visible role to **Facilitator**; show the tool count rise from 9 to 13.

Ask:

> “Create a severity-3 inject called ‘Processor failover delayed’, category `vendor`, activating in 20 minutes with a 40-minute response window. Use effects `{impact:5, uncertainty:4, fatigue:2, trust:-2, service:-6}`. Then advance the exercise clock 30 minutes and summarize the visible changes.”

> “The role switch really unregisters and registers tools. The delayed inject first exists as scheduled state, then activates partway through the 30-minute step. Pressure is applied only for its actual exposure time.”

Show the clock, active inject, risk queue, metrics, and activity trail.

### 1:47–2:15 — Closeout is a lifecycle transition, not an agent command

Ask the agent:

> “Stage a closeout rationale that names unresolved items and one lesson about resource review. Do not close or change phase.”

Show the staged closeout and the visible **Enter closeout review** button.

> “The WebMCP surface can prepare the record, but it exposes no enter-review tool. Staged responses or communications would block the visible user gate.”

Click **Enter closeout review**. Show the role control disabled, mutation buttons gone, and tool count fall to **4 read-only tools**.

### 2:15–2:35 — Finish on impact and safety

Show the confirmation and AAR export control without lingering.

> “A person can resume response or explicitly confirm final closure. The after-action record preserves decisions, forecasts, observations, unresolved injects, and the activity trail. Drillboard turns a static tabletop into a transparent human–agent training room—while consequential judgment stays visible.”

End on the full board plus project name.

## Recording acceptance checklist

- Native WebMCP status is visible.
- The 9 → 13 → 4 tool-count lifecycle is visible.
- At least one real tool call visibly changes board state.
- The proposal is shown staged before the human approval click.
- The delayed inject and partial time exposure are visible.
- No narration claims the website can prevent a generic browser agent from clicking UI; say the **site exposes no approval/close tool**.
- Final runtime is under 3:00 and the public YouTube URL is added to Devpost.
