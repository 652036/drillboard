import { getPreset } from './data.js';

const METRIC_KEYS = ['impact', 'uncertainty', 'fatigue', 'trust', 'service'];
const BAD_METRICS = new Set(['impact', 'uncertainty', 'fatigue']);
export const EXERCISE_PHASES = Object.freeze({ RESPONSE: 'response', CLOSEOUT_REVIEW: 'closeout-review', CLOSED: 'closed' });
export const COLLECTION_LIMITS = Object.freeze({ injects: 50, proposals: 60, communications: 60, decisions: 60, observations: 100, forecasts: 8 });

function assertResponsePhase(exercise, action = 'change the exercise') {
  if (exercise.status === 'closed' || exercise.phase === EXERCISE_PHASES.CLOSED) throw new Error('The exercise is closed and read-only.');
  if (exercise.phase !== EXERCISE_PHASES.RESPONSE) throw new Error(`Return to the response phase before attempting to ${action}.`);
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function assertCollectionCapacity(exercise, key, label) {
  if ((exercise[key]?.length || 0) >= COLLECTION_LIMITS[key]) throw new Error(`${label} limit reached (${COLLECTION_LIMITS[key]}). Review or reset the exercise before adding more.`);
}

export function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createExercise(presetKey = 'outage') {
  const preset = getPreset(presetKey);
  return {
    version: 2,
    presetKey,
    title: preset.name,
    subtitle: preset.subtitle,
    clockLabel: preset.clockLabel,
    role: 'coach',
    clock: 15,
    status: 'open',
    phase: EXERCISE_PHASES.RESPONSE,
    metrics: { ...preset.metrics },
    resources: preset.resources.map((resource) => ({ ...resource, allocated: 0 })),
    objectives: preset.objectives.map((objective) => ({ ...objective })),
    injects: preset.injects.map((inject) => ({ ...inject, observations: [] })),
    proposals: [],
    communications: [],
    decisions: [],
    observations: [],
    forecasts: [],
    closeout: { staged: false, rationale: '', lessons: [], closedAt: null },
    sequence: 1,
  };
}

export function formatClock(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function metricTone(key, value) {
  const riskValue = BAD_METRICS.has(key) ? value : 100 - value;
  return riskValue >= 70 ? 'critical' : riskValue >= 45 ? 'warning' : 'stable';
}

export function activeInjects(exercise) {
  return exercise.injects.filter((inject) => inject.status === 'active' && inject.createdAt <= exercise.clock);
}

export function resourceAvailability(exercise, resourceId) {
  const resource = exercise.resources.find((candidate) => candidate.id === resourceId);
  return resource ? Math.max(0, resource.total - resource.allocated) : 0;
}

export function advanceExercise(exercise, minutes) {
  assertResponsePhase(exercise, 'advance time');
  const next = structuredClone(exercise);
  const amount = clamp(Math.round(Number(minutes) || 0), 1, 240);
  const previousClock = next.clock;
  const staffingCoverage = next.resources.reduce((sum, resource) => sum + resource.allocated, 0) / Math.max(1, next.resources.reduce((sum, resource) => sum + resource.total, 0));
  const overdue = [];

  // Fixed one-minute integration makes results independent of tool step size.
  // All simultaneous inject effects are summed before a single clamp, so array order is irrelevant.
  for (let elapsed = 0; elapsed < amount; elapsed += 1) {
    const minuteStart = previousClock + elapsed;
    const minuteEnd = minuteStart + 1;
    const active = next.injects.filter((inject) => inject.status === 'active' && inject.createdAt <= minuteStart).sort((left, right) => left.id.localeCompare(right.id));
    const deltas = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0]));
    for (const inject of active) {
      const pressureScale = (0.45 + inject.severity * 0.12) / 30;
      for (const key of METRIC_KEYS) deltas[key] += Number(inject.effects?.[key] || 0) * pressureScale;
    }
    deltas.fatigue += (5 + active.length * 1.5) / 60;
    if (!active.length) {
      deltas.service += (6 + staffingCoverage * 5) / 60;
      deltas.impact -= 5 / 60;
    }
    for (const objective of next.objectives) {
      if (objective.status === 'complete' || objective.deadline <= minuteStart || objective.deadline > minuteEnd) continue;
      overdue.push(objective);
      deltas.impact += objective.priority === 'critical' ? 8 : 4;
      deltas.uncertainty += 4;
      deltas.trust -= 3;
    }
    for (const key of METRIC_KEYS) next.metrics[key] = clamp(next.metrics[key] + deltas[key]);
  }

  next.clock += amount;

  return { exercise: next, activated: next.injects.filter((inject) => inject.createdAt > previousClock && inject.createdAt <= next.clock).map((inject) => inject.id), overdue: overdue.map((objective) => objective.id) };
}

export function createInject(exercise, input) {
  assertResponsePhase(exercise, 'create an inject');
  assertCollectionCapacity(exercise, 'injects', 'Inject');
  const next = structuredClone(exercise);
  const id = `inject-${next.sequence++}`;
  const createdAt = next.clock + Math.max(0, Math.round(input.delay_minutes || 0));
  const inject = {
    id,
    title: requireText(input.title, 'Inject title'),
    description: requireText(input.description, 'Inject description'),
    category: requireText(input.category, 'Inject category'),
    severity: clamp(Math.round(input.severity), 1, 5),
    createdAt,
    deadline: createdAt + Math.max(5, Math.round(input.deadline_minutes || 30)),
    status: 'active',
    effects: normalizeEffects(input.effects),
    observations: [],
  };
  next.injects.push(inject);
  return { exercise: next, inject };
}

function normalizeEffects(effects = {}) {
  return Object.fromEntries(METRIC_KEYS.map((key) => [key, clamp(Number(effects[key] || 0), -20, 20)]));
}

export function stageProposal(exercise, input) {
  assertResponsePhase(exercise, 'stage a response');
  assertCollectionCapacity(exercise, 'proposals', 'Response proposal');
  const next = structuredClone(exercise);
  const objective = input.objective_id ? next.objectives.find((candidate) => candidate.id === input.objective_id) : null;
  const resource = input.resource_id ? next.resources.find((candidate) => candidate.id === input.resource_id) : null;
  const resourceUnits = Math.max(0, Math.round(input.resource_units || 0));
  if (input.objective_id && !objective) throw new Error(`Objective not found: ${input.objective_id}`);
  if (input.resource_id && !resource) throw new Error(`Resource not found: ${input.resource_id}`);
  if (!input.resource_id && resourceUnits) throw new Error('A resource_id is required when resource_units is greater than zero.');
  if (input.resource_id && resourceAvailability(next, input.resource_id) < resourceUnits) throw new Error('Requested resource units exceed current availability.');
  const proposal = {
    id: `proposal-${next.sequence++}`,
    title: requireText(input.title, 'Response title'),
    category: requireText(input.category, 'Response category'),
    rationale: requireText(input.rationale, 'Response rationale'),
    targetObjectiveId: input.objective_id || null,
    resourceId: input.resource_id || null,
    resourceUnits,
    effects: normalizeEffects(input.effects),
    status: 'staged',
    stagedAt: next.clock,
  };
  next.proposals.push(proposal);
  return { exercise: next, proposal };
}

export function decideProposal(exercise, proposalId, decision, note = '') {
  assertResponsePhase(exercise, 'review a response');
  const next = structuredClone(exercise);
  const proposal = next.proposals.find((candidate) => candidate.id === proposalId);
  if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
  if (proposal.status !== 'staged') throw new Error('This proposal has already been reviewed.');
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Decision must be approved or rejected.');
  if (decision === 'approved') assertCollectionCapacity(exercise, 'decisions', 'Approved decision');
  proposal.status = decision;
  proposal.reviewNote = note;
  proposal.reviewedAt = next.clock;
  if (decision === 'approved') {
    if (proposal.resourceId) {
      const resource = next.resources.find((candidate) => candidate.id === proposal.resourceId);
      if (!resource || resource.total - resource.allocated < proposal.resourceUnits) throw new Error('Resource availability changed; review the allocation again.');
      resource.allocated += proposal.resourceUnits;
    }
    for (const key of METRIC_KEYS) next.metrics[key] = clamp(next.metrics[key] + proposal.effects[key]);
    if (proposal.targetObjectiveId) {
      const objective = next.objectives.find((candidate) => candidate.id === proposal.targetObjectiveId);
      if (objective) {
        objective.progress = clamp(objective.progress + 30 + proposal.resourceUnits * 8);
        if (objective.progress >= 100) objective.status = 'complete';
      }
    }
    next.decisions.push({ id: `decision-${next.sequence++}`, proposalId, title: proposal.title, note, at: next.clock });
  }
  return { exercise: next, proposal };
}

export function stageCommunication(exercise, input) {
  assertResponsePhase(exercise, 'stage a communication');
  assertCollectionCapacity(exercise, 'communications', 'Communication');
  const next = structuredClone(exercise);
  const communication = {
    id: `comms-${next.sequence++}`,
    audience: requireText(input.audience, 'Communication audience'),
    message: requireText(input.message, 'Communication message'),
    purpose: requireText(input.purpose, 'Communication purpose'),
    status: 'staged',
    stagedAt: next.clock,
  };
  next.communications.push(communication);
  return { exercise: next, communication };
}

export function decideCommunication(exercise, communicationId, decision) {
  assertResponsePhase(exercise, 'review a communication');
  const next = structuredClone(exercise);
  const communication = next.communications.find((candidate) => candidate.id === communicationId);
  if (!communication) throw new Error(`Communication not found: ${communicationId}`);
  if (communication.status !== 'staged') throw new Error('This communication has already been reviewed.');
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Decision must be approved or rejected.');
  communication.status = decision;
  communication.reviewedAt = next.clock;
  if (decision === 'approved') {
    next.metrics.trust = clamp(next.metrics.trust + 5);
    next.metrics.uncertainty = clamp(next.metrics.uncertainty - 4);
  }
  return { exercise: next, communication };
}

export function addObservation(exercise, input) {
  assertResponsePhase(exercise, 'add an observation');
  assertCollectionCapacity(exercise, 'observations', 'Observation');
  const next = structuredClone(exercise);
  const tags = Array.isArray(input.tags) ? input.tags : [];
  if (tags.length > 8) throw new Error('An observation can have at most 8 tags.');
  const observation = {
    id: `observation-${next.sequence++}`,
    text: requireText(input.observation, 'Observation'),
    tags: tags.map((tag) => requireText(tag, 'Observation tag')),
    at: next.clock,
  };
  next.observations.push(observation);
  return { exercise: next, observation };
}

export function resolveInject(exercise, injectId, outcome) {
  assertResponsePhase(exercise, 'resolve an inject');
  const next = structuredClone(exercise);
  const inject = next.injects.find((candidate) => candidate.id === injectId);
  if (!inject) throw new Error(`Inject not found: ${injectId}`);
  if (inject.status !== 'active') throw new Error('This inject has already been resolved.');
  if (inject.createdAt > next.clock) throw new Error('A future inject cannot be resolved before it becomes active.');
  inject.status = 'resolved';
  inject.resolvedAt = next.clock;
  inject.outcome = requireText(outcome, 'Inject outcome');
  next.metrics.impact = clamp(next.metrics.impact - (4 + inject.severity));
  next.metrics.uncertainty = clamp(next.metrics.uncertainty - (3 + inject.severity));
  next.metrics.service = clamp(next.metrics.service + Math.ceil(inject.severity / 2));
  return { exercise: next, inject };
}

export function updateObjective(exercise, objectiveId, progressDelta, status, note = '') {
  assertResponsePhase(exercise, 'update an objective');
  const next = structuredClone(exercise);
  const objective = next.objectives.find((candidate) => candidate.id === objectiveId);
  if (!objective) throw new Error(`Objective not found: ${objectiveId}`);
  if (status && !['open', 'blocked', 'complete'].includes(status)) throw new Error('Objective status must be open, blocked, or complete.');
  if (!Number.isFinite(Number(progressDelta))) throw new Error('Objective progress change must be a finite number.');
  if (objective.status === 'complete' && Number(progressDelta) < 0 && !status) throw new Error('Explicitly set status to open or blocked when reducing a completed objective.');
  objective.progress = clamp(objective.progress + Number(progressDelta || 0));
  if (status) objective.status = status;
  if (objective.status === 'complete') objective.progress = 100;
  if (objective.progress >= 100) objective.status = 'complete';
  objective.lastNote = note;
  objective.updatedAt = next.clock;
  return { exercise: next, objective };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function normal(random) {
  const first = Math.max(random(), 1e-9);
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Number(sorted[index].toFixed(1));
}

export function forecastStateFingerprint(exercise) {
  const relevantState = {
    presetKey: exercise.presetKey,
    clock: exercise.clock,
    metrics: exercise.metrics,
    resources: exercise.resources.map(({ id, total, allocated }) => ({ id, total, allocated })),
    objectives: exercise.objectives.map(({ id, priority, deadline, progress, status }) => ({ id, priority, deadline, progress, status })),
    injects: exercise.injects.map(({ id, severity, createdAt, deadline, status, effects }) => ({ id, severity, createdAt, deadline, status, effects })),
    decisions: exercise.decisions.map(({ proposalId, at }) => ({ proposalId, at })),
    approvedCommunications: exercise.communications.filter((item) => item.status === 'approved').map(({ id, reviewedAt }) => ({ id, reviewedAt })),
  };
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(relevantState)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function forecastStatus(exercise, forecast) {
  if (!forecast) return null;
  const generatedAtStateFingerprint = forecast.stateFingerprint || String(forecast.runKey || '').split(':')[0] || null;
  const currentStateFingerprint = forecastStateFingerprint(exercise);
  return {
    stale: !generatedAtStateFingerprint || generatedAtStateFingerprint !== currentStateFingerprint,
    generatedAtClock: forecast.generatedAtClock,
    generatedAtStateFingerprint,
    currentStateFingerprint,
  };
}

export function forecastExercise(exercise, { horizonMinutes = 60, simulations = 800, seed = 42 } = {}) {
  if (!Number.isInteger(horizonMinutes) || horizonMinutes < 15 || horizonMinutes > 240) throw new Error('Forecast horizon must be an integer from 15 to 240 minutes.');
  if (!Number.isInteger(simulations) || simulations < 100 || simulations > 3000) throw new Error('Forecast simulations must be an integer from 100 to 3000.');
  if (!Number.isInteger(seed) || seed < 1 || seed > 999999) throw new Error('Forecast seed must be an integer from 1 to 999999.');
  const random = mulberry32(seed);
  const active = activeInjects(exercise);
  const projectedInjects = exercise.injects
    .filter((inject) => inject.status === 'active' && inject.createdAt <= exercise.clock + horizonMinutes)
    .map((inject) => ({ inject, exposure: clamp((exercise.clock + horizonMinutes - Math.max(exercise.clock, inject.createdAt)) / horizonMinutes, 0, 1) }));
  const futureInjects = projectedInjects.filter(({ inject }) => inject.createdAt > exercise.clock);
  const projectedActiveLoad = projectedInjects.reduce((sum, item) => sum + item.exposure, 0);
  const openCritical = exercise.objectives.filter((objective) => objective.status !== 'complete' && objective.priority === 'critical').length;
  const allocation = exercise.resources.reduce((sum, resource) => sum + resource.allocated, 0);
  const totalResources = exercise.resources.reduce((sum, resource) => sum + resource.total, 0);
  const coverage = totalResources ? allocation / totalResources : 0;
  const deterministicBaseline = advanceExercise(exercise, horizonMinutes).exercise;
  const outcomes = { impact: [], uncertainty: [], fatigue: [], trust: [], service: [], score: [] };
  let contained = 0;

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const uncertaintyScale = 1 + exercise.metrics.uncertainty / 160;
    const coverageScale = 1 - coverage * .25;
    const metrics = {};
    metrics.impact = clamp(deterministicBaseline.metrics.impact + normal(random) * (4 + projectedActiveLoad * 1.2) * uncertaintyScale * coverageScale);
    metrics.uncertainty = clamp(deterministicBaseline.metrics.uncertainty + normal(random) * (5 + projectedActiveLoad) * uncertaintyScale * coverageScale);
    metrics.fatigue = clamp(deterministicBaseline.metrics.fatigue + normal(random) * (3 + projectedActiveLoad * .7) * uncertaintyScale);
    metrics.trust = clamp(deterministicBaseline.metrics.trust + normal(random) * (3 + projectedActiveLoad * .5) * uncertaintyScale);
    metrics.service = clamp(deterministicBaseline.metrics.service + normal(random) * (4 + projectedActiveLoad) * uncertaintyScale * coverageScale);
    const score = scoreMetrics(metrics, deterministicBaseline.objectives);
    for (const key of METRIC_KEYS) outcomes[key].push(metrics[key]);
    outcomes.score.push(score);
    if (metrics.impact < 45 && metrics.service > 55 && metrics.uncertainty < 50) contained += 1;
  }

  const ranges = Object.fromEntries(Object.entries(outcomes).map(([key, values]) => [key, { p10: percentile(values, .1), median: percentile(values, .5), p90: percentile(values, .9) }]));
  const riskDrivers = [
    active.length ? `${active.length} active inject${active.length === 1 ? '' : 's'}` : null,
    futureInjects.length ? `${futureInjects.length} scheduled inject${futureInjects.length === 1 ? ' activates' : 's activate'} within horizon` : null,
    openCritical ? `${openCritical} open critical objective${openCritical === 1 ? '' : 's'}` : null,
    coverage < .35 ? 'Low simulated resource allocation' : null,
    exercise.metrics.uncertainty > 60 ? 'High uncertainty' : null,
    exercise.metrics.fatigue > 60 ? 'High responder fatigue' : null,
  ].filter(Boolean);
  const stateFingerprint = forecastStateFingerprint(exercise);
  return {
    horizonMinutes,
    simulations,
    seed,
    generatedAtClock: exercise.clock,
    stateFingerprint,
    runKey: `${stateFingerprint}:${horizonMinutes}:${simulations}:${seed}`,
    containmentProbability: Number((contained / simulations * 100).toFixed(1)),
    ranges,
    riskDrivers,
    assumptions: [
      'Seeded scenario simulation; identical state and inputs produce identical output.',
      'Median trajectory uses the same inject effects, exposure timing, deadlines, and fatigue rules as clock advancement.',
      'Containment means impact <45, service >55, and uncertainty <50 at the horizon.',
      'Training signal only—not a prediction or operational recommendation.',
    ],
  };
}

export function closeoutReadiness(exercise) {
  const blockers = [];
  const rationale = exercise.closeout?.rationale?.trim() || '';
  const lessons = (exercise.closeout?.lessons || []).map((lesson) => lesson.trim()).filter(Boolean);
  const stagedResponses = exercise.proposals.filter((proposal) => proposal.status === 'staged').length;
  const stagedCommunications = exercise.communications.filter((communication) => communication.status === 'staged').length;
  if (rationale.length < 20) blockers.push('Add a closeout rationale of at least 20 characters.');
  if (!lessons.length) blockers.push('Record at least one lesson learned.');
  if (stagedResponses) blockers.push(`Review ${stagedResponses} staged response${stagedResponses === 1 ? '' : 's'}.`);
  if (stagedCommunications) blockers.push(`Review ${stagedCommunications} staged communication${stagedCommunications === 1 ? '' : 's'}.`);
  return { ready: blockers.length === 0, blockers, unresolvedInjects: exercise.injects.filter((inject) => inject.status === 'active').map((inject) => inject.id), openObjectives: exercise.objectives.filter((objective) => objective.status !== 'complete').map((objective) => objective.id) };
}

export function enterCloseoutReview(exercise) {
  assertResponsePhase(exercise, 'enter closeout review');
  const readiness = closeoutReadiness(exercise);
  if (!readiness.ready) throw new Error(readiness.blockers.join(' '));
  const next = structuredClone(exercise);
  next.phase = EXERCISE_PHASES.CLOSEOUT_REVIEW;
  return { exercise: next, readiness };
}

export function resumeResponse(exercise) {
  if (exercise.status === 'closed' || exercise.phase === EXERCISE_PHASES.CLOSED) throw new Error('A closed exercise cannot be reopened.');
  if (exercise.phase !== EXERCISE_PHASES.CLOSEOUT_REVIEW) throw new Error('The exercise is not in closeout review.');
  const next = structuredClone(exercise);
  next.phase = EXERCISE_PHASES.RESPONSE;
  next.closeout.staged = false;
  return { exercise: next };
}

export function closeExercise(exercise, closedAt = new Date().toISOString()) {
  if (exercise.status === 'closed' || exercise.phase === EXERCISE_PHASES.CLOSED) throw new Error('The exercise is already closed.');
  if (exercise.phase !== EXERCISE_PHASES.CLOSEOUT_REVIEW) throw new Error('Enter closeout review before closing the exercise.');
  const readiness = closeoutReadiness(exercise);
  if (!readiness.ready) throw new Error(readiness.blockers.join(' '));
  const next = structuredClone(exercise);
  next.status = 'closed';
  next.phase = EXERCISE_PHASES.CLOSED;
  next.closeout = { ...next.closeout, staged: false, closedAt };
  return { exercise: next, readiness };
}

export function scoreMetrics(metrics, objectives = []) {
  const objectiveScore = objectives.length ? objectives.reduce((sum, objective) => sum + objective.progress, 0) / objectives.length : 50;
  return Number(clamp((100 - metrics.impact) * .24 + (100 - metrics.uncertainty) * .16 + (100 - metrics.fatigue) * .12 + metrics.trust * .16 + metrics.service * .2 + objectiveScore * .12).toFixed(1));
}

export function exerciseScore(exercise) {
  return scoreMetrics(exercise.metrics, exercise.objectives);
}

export function openRisks(exercise) {
  return {
    activeInjects: activeInjects(exercise).map((inject) => ({ id: inject.id, title: inject.title, severity: inject.severity, deadline: inject.deadline, overdue: exercise.clock > inject.deadline })),
    scheduledInjects: exercise.injects.filter((inject) => inject.status === 'active' && inject.createdAt > exercise.clock).map((inject) => ({ id: inject.id, title: inject.title, severity: inject.severity, activatesAt: inject.createdAt, deadline: inject.deadline })),
    openObjectives: exercise.objectives.filter((objective) => objective.status !== 'complete').map((objective) => ({ id: objective.id, title: objective.title, priority: objective.priority, progress: objective.progress, deadline: objective.deadline, overdue: exercise.clock > objective.deadline })),
    stagedResponses: exercise.proposals.filter((proposal) => proposal.status === 'staged').map((proposal) => ({ id: proposal.id, title: proposal.title, category: proposal.category })),
    stagedCommunications: exercise.communications.filter((item) => item.status === 'staged').map((item) => ({ id: item.id, audience: item.audience, purpose: item.purpose })),
  };
}

function markdownInline(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\`*_{}\[\]()<>#+.!|\-])/g, '\\$1');
}

export function exportAfterAction(exercise, activity = []) {
  const latestForecast = exercise.forecasts.at(-1);
  const latestForecastStatus = forecastStatus(exercise, latestForecast);
  const lines = [
    `# Drillboard after-action record: ${markdownInline(exercise.title)}`,
    '', `Status: ${markdownInline(exercise.status)}`, `Lifecycle phase: ${markdownInline(exercise.phase)}`, `Exercise clock: ${formatClock(exercise.clock)}`, `Score: ${exerciseScore(exercise)}/100`, '',
    '## Final metrics',
    ...METRIC_KEYS.map((key) => `- ${key}: ${Math.round(exercise.metrics[key])}/100`), '',
    '## Objectives',
    ...exercise.objectives.map((objective) => `- [${objective.status === 'complete' ? 'x' : ' '}] ${markdownInline(objective.title)} — ${Math.round(objective.progress)}% (${markdownInline(objective.owner)})`), '',
    '## Injects',
    ...exercise.injects.map((inject) => `- [${markdownInline(inject.id)}] ${markdownInline(inject.title)} — ${inject.status === 'active' && inject.createdAt > exercise.clock ? 'scheduled' : markdownInline(inject.status)}; severity ${inject.severity}; activates T+${formatClock(inject.createdAt)}; deadline T+${formatClock(inject.deadline)}${inject.outcome ? `; outcome: ${markdownInline(inject.outcome)}` : ''}`), '',
    '## Human-approved decisions',
    ...(exercise.decisions.length ? exercise.decisions.map((decision) => `- T+${formatClock(decision.at)} ${markdownInline(decision.title)}${decision.note ? ` — ${markdownInline(decision.note)}` : ''}`) : ['- None recorded']), '',
    '## Approved communications',
    ...(exercise.communications.filter((item) => item.status === 'approved').length ? exercise.communications.filter((item) => item.status === 'approved').map((item) => `- ${markdownInline(item.audience)}: ${markdownInline(item.message)}`) : ['- None recorded']), '',
    '## Training observations',
    ...(exercise.observations.length ? exercise.observations.map((item) => `- T+${formatClock(item.at)} ${markdownInline(item.text)}${item.tags?.length ? ` [${item.tags.map(markdownInline).join(', ')}]` : ''}`) : ['- None recorded']), '',
    '## Latest deterministic forecast',
    ...(latestForecast ? [
      `- Status: ${latestForecastStatus.stale ? 'historical — outdated because the board changed after this run' : 'current for the board state shown'}`,
      `- Generated at: T+${formatClock(latestForecastStatus.generatedAtClock)}`,
      `- Generated-state fingerprint: ${markdownInline(latestForecastStatus.generatedAtStateFingerprint)}`,
      `- Current-state fingerprint: ${markdownInline(latestForecastStatus.currentStateFingerprint)}`,
      `- Run: ${markdownInline(latestForecast.runKey)}`,
      `- Recorded containment rate: ${latestForecast.containmentProbability}% over ${latestForecast.horizonMinutes} simulated minutes`,
      '- Training signal only—not a prediction or operational recommendation.',
    ] : ['- No forecast recorded']), '',
    '## Closeout',
    markdownInline(exercise.closeout.rationale) || 'No closeout rationale recorded.',
    ...exercise.closeout.lessons.map((lesson) => `- ${markdownInline(lesson)}`), '',
    '## Activity trail',
    ...activity.slice().reverse().map((item) => `- ${markdownInline(item.time)} [${markdownInline(item.actor)}] ${markdownInline(item.label)}`), '',
    '> Training simulation only. This record is not operational guidance for a real emergency.',
  ];
  return lines.join('\n');
}
