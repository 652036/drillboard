import { getPreset } from './data.js';

const METRIC_KEYS = ['impact', 'uncertainty', 'fatigue', 'trust', 'service'];
const BAD_METRICS = new Set(['impact', 'uncertainty', 'fatigue']);

export function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createExercise(presetKey = 'outage') {
  const preset = getPreset(presetKey);
  return {
    version: 1,
    presetKey,
    title: preset.name,
    subtitle: preset.subtitle,
    clockLabel: preset.clockLabel,
    role: 'coach',
    clock: 15,
    status: 'open',
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
  const next = structuredClone(exercise);
  const amount = clamp(Number(minutes) || 0, 1, 180);
  const previousClock = next.clock;
  next.clock += amount;
  const pressureScale = amount / 30;
  const active = activeInjects(next);

  for (const inject of active) {
    for (const key of METRIC_KEYS) {
      const delta = Number(inject.effects?.[key] || 0) * pressureScale * (0.45 + inject.severity * 0.12);
      next.metrics[key] = clamp(next.metrics[key] + delta);
    }
  }

  const overdue = next.objectives.filter((objective) => objective.status !== 'complete' && objective.deadline > previousClock && objective.deadline <= next.clock);
  for (const objective of overdue) {
    next.metrics.impact = clamp(next.metrics.impact + (objective.priority === 'critical' ? 8 : 4));
    next.metrics.uncertainty = clamp(next.metrics.uncertainty + 4);
    next.metrics.trust = clamp(next.metrics.trust - 3);
  }

  const staffingCoverage = next.resources.reduce((sum, resource) => sum + resource.allocated, 0) / Math.max(1, next.resources.reduce((sum, resource) => sum + resource.total, 0));
  next.metrics.fatigue = clamp(next.metrics.fatigue + amount / 60 * (5 + active.length * 1.5));
  if (active.length === 0) {
    next.metrics.service = clamp(next.metrics.service + amount / 60 * (6 + staffingCoverage * 5));
    next.metrics.impact = clamp(next.metrics.impact - amount / 60 * 5);
  }

  return { exercise: next, activated: next.injects.filter((inject) => inject.createdAt > previousClock && inject.createdAt <= next.clock).map((inject) => inject.id), overdue: overdue.map((objective) => objective.id) };
}

export function createInject(exercise, input) {
  const next = structuredClone(exercise);
  const id = `inject-${next.sequence++}`;
  const inject = {
    id,
    title: input.title,
    description: input.description,
    category: input.category,
    severity: clamp(Math.round(input.severity), 1, 5),
    createdAt: next.clock + Math.max(0, Math.round(input.delay_minutes || 0)),
    deadline: next.clock + Math.max(5, Math.round(input.deadline_minutes || 30)),
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
  const next = structuredClone(exercise);
  if (input.resource_id && resourceAvailability(next, input.resource_id) < (input.resource_units || 0)) throw new Error('Requested resource units exceed current availability.');
  const proposal = {
    id: `proposal-${next.sequence++}`,
    title: input.title,
    category: input.category,
    rationale: input.rationale,
    targetObjectiveId: input.objective_id || null,
    resourceId: input.resource_id || null,
    resourceUnits: Math.max(0, Math.round(input.resource_units || 0)),
    effects: normalizeEffects(input.effects),
    status: 'staged',
    stagedAt: next.clock,
  };
  next.proposals.push(proposal);
  return { exercise: next, proposal };
}

export function decideProposal(exercise, proposalId, decision, note = '') {
  const next = structuredClone(exercise);
  const proposal = next.proposals.find((candidate) => candidate.id === proposalId);
  if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
  if (proposal.status !== 'staged') throw new Error('This proposal has already been reviewed.');
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Decision must be approved or rejected.');
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
  const next = structuredClone(exercise);
  const communication = {
    id: `comms-${next.sequence++}`,
    audience: input.audience,
    message: input.message,
    purpose: input.purpose,
    status: 'staged',
    stagedAt: next.clock,
  };
  next.communications.push(communication);
  return { exercise: next, communication };
}

export function decideCommunication(exercise, communicationId, decision) {
  const next = structuredClone(exercise);
  const communication = next.communications.find((candidate) => candidate.id === communicationId);
  if (!communication) throw new Error(`Communication not found: ${communicationId}`);
  if (communication.status !== 'staged') throw new Error('This communication has already been reviewed.');
  communication.status = decision;
  communication.reviewedAt = next.clock;
  if (decision === 'approved') {
    next.metrics.trust = clamp(next.metrics.trust + 5);
    next.metrics.uncertainty = clamp(next.metrics.uncertainty - 4);
  }
  return { exercise: next, communication };
}

export function resolveInject(exercise, injectId, outcome) {
  const next = structuredClone(exercise);
  const inject = next.injects.find((candidate) => candidate.id === injectId);
  if (!inject) throw new Error(`Inject not found: ${injectId}`);
  inject.status = 'resolved';
  inject.resolvedAt = next.clock;
  inject.outcome = outcome;
  next.metrics.impact = clamp(next.metrics.impact - (4 + inject.severity));
  next.metrics.uncertainty = clamp(next.metrics.uncertainty - (3 + inject.severity));
  next.metrics.service = clamp(next.metrics.service + Math.ceil(inject.severity / 2));
  return { exercise: next, inject };
}

export function updateObjective(exercise, objectiveId, progressDelta, status, note = '') {
  const next = structuredClone(exercise);
  const objective = next.objectives.find((candidate) => candidate.id === objectiveId);
  if (!objective) throw new Error(`Objective not found: ${objectiveId}`);
  objective.progress = clamp(objective.progress + Number(progressDelta || 0));
  if (status) objective.status = status;
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

export function forecastExercise(exercise, { horizonMinutes = 60, simulations = 800, seed = 42 } = {}) {
  const random = mulberry32(seed);
  const active = activeInjects(exercise);
  const openCritical = exercise.objectives.filter((objective) => objective.status !== 'complete' && objective.priority === 'critical').length;
  const allocation = exercise.resources.reduce((sum, resource) => sum + resource.allocated, 0);
  const totalResources = exercise.resources.reduce((sum, resource) => sum + resource.total, 0);
  const coverage = totalResources ? allocation / totalResources : 0;
  const outcomes = { impact: [], uncertainty: [], fatigue: [], trust: [], service: [], score: [] };
  let contained = 0;

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const horizonScale = horizonMinutes / 60;
    const pressure = active.reduce((sum, inject) => sum + inject.severity, 0) * 2.4 + openCritical * 5;
    const response = coverage * 20 + exercise.decisions.length * 2.5;
    const metrics = {};
    metrics.impact = clamp(exercise.metrics.impact + (pressure - response) * horizonScale + normal(random) * (7 + exercise.metrics.uncertainty / 18));
    metrics.uncertainty = clamp(exercise.metrics.uncertainty + (active.length * 5 - response * .45) * horizonScale + normal(random) * 8);
    metrics.fatigue = clamp(exercise.metrics.fatigue + (8 + active.length * 3 - coverage * 5) * horizonScale + normal(random) * 5);
    metrics.trust = clamp(exercise.metrics.trust + (exercise.communications.filter((item) => item.status === 'approved').length * 4 - metrics.impact / 18) * horizonScale + normal(random) * 4);
    metrics.service = clamp(exercise.metrics.service + (response - pressure * .7) * horizonScale + normal(random) * 7);
    const score = scoreMetrics(metrics, exercise.objectives);
    for (const key of METRIC_KEYS) outcomes[key].push(metrics[key]);
    outcomes.score.push(score);
    if (metrics.impact < 45 && metrics.service > 55 && metrics.uncertainty < 50) contained += 1;
  }

  const ranges = Object.fromEntries(Object.entries(outcomes).map(([key, values]) => [key, { p10: percentile(values, .1), median: percentile(values, .5), p90: percentile(values, .9) }]));
  const riskDrivers = [
    active.length ? `${active.length} active inject${active.length === 1 ? '' : 's'}` : null,
    openCritical ? `${openCritical} open critical objective${openCritical === 1 ? '' : 's'}` : null,
    coverage < .35 ? 'Low simulated resource allocation' : null,
    exercise.metrics.uncertainty > 60 ? 'High uncertainty' : null,
    exercise.metrics.fatigue > 60 ? 'High responder fatigue' : null,
  ].filter(Boolean);
  return { horizonMinutes, simulations, seed, containmentProbability: Number((contained / simulations * 100).toFixed(1)), ranges, riskDrivers };
}

export function scoreMetrics(metrics, objectives = []) {
  const objectiveScore = objectives.length ? objectives.reduce((sum, objective) => sum + objective.progress, 0) / objectives.length : 50;
  return Number(clamp(100 - metrics.impact * .24 - metrics.uncertainty * .16 - metrics.fatigue * .12 + metrics.trust * .16 + metrics.service * .2 + objectiveScore * .2).toFixed(1));
}

export function exerciseScore(exercise) {
  return scoreMetrics(exercise.metrics, exercise.objectives);
}

export function openRisks(exercise) {
  return {
    activeInjects: activeInjects(exercise).map((inject) => ({ id: inject.id, title: inject.title, severity: inject.severity, deadline: inject.deadline, overdue: exercise.clock > inject.deadline })),
    openObjectives: exercise.objectives.filter((objective) => objective.status !== 'complete').map((objective) => ({ id: objective.id, title: objective.title, priority: objective.priority, progress: objective.progress, deadline: objective.deadline, overdue: exercise.clock > objective.deadline })),
    stagedResponses: exercise.proposals.filter((proposal) => proposal.status === 'staged').map((proposal) => ({ id: proposal.id, title: proposal.title, category: proposal.category })),
    stagedCommunications: exercise.communications.filter((item) => item.status === 'staged').map((item) => ({ id: item.id, audience: item.audience, purpose: item.purpose })),
  };
}

export function exportAfterAction(exercise, activity = []) {
  const lines = [
    `# Drillboard after-action record: ${exercise.title}`,
    '', `Status: ${exercise.status}`, `Exercise clock: ${formatClock(exercise.clock)}`, `Score: ${exerciseScore(exercise)}/100`, '',
    '## Final metrics',
    ...METRIC_KEYS.map((key) => `- ${key}: ${Math.round(exercise.metrics[key])}/100`), '',
    '## Objectives',
    ...exercise.objectives.map((objective) => `- [${objective.status === 'complete' ? 'x' : ' '}] ${objective.title} — ${Math.round(objective.progress)}% (${objective.owner})`), '',
    '## Injects',
    ...exercise.injects.map((inject) => `- ${inject.title} — ${inject.status}; severity ${inject.severity}${inject.outcome ? `; outcome: ${inject.outcome}` : ''}`), '',
    '## Human-approved decisions',
    ...(exercise.decisions.length ? exercise.decisions.map((decision) => `- T+${formatClock(decision.at)} ${decision.title}${decision.note ? ` — ${decision.note}` : ''}`) : ['- None recorded']), '',
    '## Approved communications',
    ...(exercise.communications.filter((item) => item.status === 'approved').length ? exercise.communications.filter((item) => item.status === 'approved').map((item) => `- ${item.audience}: ${item.message}`) : ['- None recorded']), '',
    '## Closeout',
    exercise.closeout.rationale || 'No closeout rationale recorded.',
    ...exercise.closeout.lessons.map((lesson) => `- ${lesson}`), '',
    '## Activity trail',
    ...activity.slice().reverse().map((item) => `- ${item.time} [${item.actor}] ${item.label}`), '',
    '> Training simulation only. This record is not operational guidance for a real emergency.',
  ];
  return lines.join('\n');
}
