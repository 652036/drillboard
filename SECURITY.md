# Safety and trust boundaries

Drillboard is a fictional training simulator. It is not an incident-management system, emergency service, medical tool, security control, or source of operational guidance.

## Human decision boundary

WebMCP tools may read the room, run forecasts, create facilitator injects, advance simulated time, update scenario state, and stage response or communication proposals. They cannot approve response proposals, publish communications, allocate an official decision, or close the exercise. Those actions exist only as visible human controls.

When a person closes an exercise, all mutation tools are unregistered. Read, focus, and export tools remain available.

## Role-scoped tools

The human-visible agent role changes the active tool set. Coach mode cannot create injects or advance time. Facilitator mode can manipulate the fictional scenario but still cannot approve participant decisions.

## Data

State is stored only in browser `localStorage`. There are no accounts, analytics, model keys, remote databases, or third-party scripts. Do not enter real incident secrets, personal data, credentials, or regulated information.

## Forecasts

Forecasts are seeded educational simulations with deliberately simple assumptions. Probabilities are not predictive claims and must not be used for real-world safety, security, financial, medical, or operational decisions.
