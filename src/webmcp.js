import { assertToolOutputBudget } from './paging.js';

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function validateSchema(schema, input, path = 'input') {
  const errors = [];
  if (!schema) return errors;
  if (schema.type === 'object') {
    if (!isObject(input)) return [`${path} must be an object`];
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) if (!(required in input)) errors.push(`${path}.${required} is required`);
    if (schema.additionalProperties === false) for (const key of Object.keys(input)) if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
    for (const [key, value] of Object.entries(input)) if (properties[key]) errors.push(...validateSchema(properties[key], value, `${path}.${key}`));
  } else if (schema.type === 'array') {
    if (!Array.isArray(input)) return [`${path} must be an array`];
    if (schema.minItems != null && input.length < schema.minItems) errors.push(`${path} must have at least ${schema.minItems} items`);
    if (schema.maxItems != null && input.length > schema.maxItems) errors.push(`${path} must have at most ${schema.maxItems} items`);
    input.forEach((item, index) => errors.push(...validateSchema(schema.items, item, `${path}[${index}]`)));
  } else if (schema.type === 'string') {
    if (typeof input !== 'string') return [`${path} must be a string`];
    if (schema.minLength != null && input.length < schema.minLength) errors.push(`${path} must have at least ${schema.minLength} characters`);
    if (schema.maxLength != null && input.length > schema.maxLength) errors.push(`${path} must have at most ${schema.maxLength} characters`);
    if (schema.enum && !schema.enum.includes(input)) errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof input !== 'number' || !Number.isFinite(input)) return [`${path} must be a number`];
    if (schema.type === 'integer' && !Number.isInteger(input)) errors.push(`${path} must be an integer`);
    if (schema.minimum != null && input < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum != null && input > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`);
  } else if (schema.type === 'boolean' && typeof input !== 'boolean') errors.push(`${path} must be a boolean`);
  return errors;
}
function publicDefinition({ name, title, description, inputSchema, annotations }) {
  return { name, title, description, inputSchema, annotations };
}

function toolSignature(definition) {
  return JSON.stringify(publicDefinition(definition));
}

// Chrome 150+ exposes document.modelContext; Chrome 149 previews exposed navigator.modelContext.
function defaultContext() {
  return globalThis.document?.modelContext ?? globalThis.navigator?.modelContext ?? null;
}

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

export const EMBEDDED_FRAME_REASON = 'Embedded frame: native tools disabled';

function defaultEmbedded() {
  try {
    return globalThis.top !== globalThis.self;
  } catch {
    return true;
  }
}

export function createWebMCPRegistry({ bridgeName = '__webMCP', onStatus = () => {}, contextProvider = defaultContext, bridgeTarget = globalThis.window, embedded = defaultEmbedded } = {}) {
  let definitions = [];
  // name -> { controller, signature }; each tool owns its AbortController so unrelated tools survive a diff.
  const registrations = new Map();
  let registeredContext = null;
  let mode = 'preview';
  let lastError = null;
  let syncQueue = Promise.resolve();
  let inFlight = 0;
  let deferredDefinitions = null;

  function abortRegistrations() {
    for (const entry of registrations.values()) entry.controller.abort();
    registrations.clear();
    registeredContext = null;
  }

  function scheduleDeferredSync() {
    if (inFlight > 0 || !deferredDefinitions) return;
    const next = deferredDefinitions;
    deferredDefinitions = null;
    // Wait one macrotask so the browser observes the resolved execute() promise before any abort() runs.
    syncQueue = syncQueue.then(nextMacrotask, nextMacrotask).then(() => syncNow(next));
  }

  async function executeDefinition(definition, input = {}, options = {}) {
    if (options.signal?.aborted) throw new DOMException('Tool execution was cancelled.', 'AbortError');
    const errors = validateSchema(definition.inputSchema, input);
    if (errors.length) throw new Error(errors.join('; '));
    inFlight += 1;
    try {
      return assertToolOutputBudget(await definition.execute(input, options));
    } finally {
      inFlight -= 1;
      scheduleDeferredSync();
    }
  }

  function executeByName(name, input = {}, options = {}) {
    const tool = definitions.find((candidate) => candidate.name === name);
    if (!tool) return Promise.reject(new Error(`Unknown tool: ${name}`));
    return executeDefinition(tool, input, options);
  }

  async function syncNow(next) {
    definitions = next;
    if (inFlight > 0) {
      // Aborting a registration while its execute() is pending cancels that call in Chrome < 153; finish first.
      deferredDefinitions = next;
      onStatus(status());
      return;
    }
    const context = contextProvider();
    // Only the top-level document registers tools; a framed copy could otherwise expose them to an embedding page's agent.
    if (embedded() || !context?.registerTool) {
      abortRegistrations();
      mode = 'preview';
      lastError = null;
      onStatus(status());
      return;
    }
    if (registeredContext && registeredContext !== context) abortRegistrations();

    const nextByName = new Map(next.map((definition) => [definition.name, definition]));
    for (const [name, entry] of registrations) {
      const candidate = nextByName.get(name);
      if (candidate && toolSignature(candidate) === entry.signature) continue;
      entry.controller.abort();
      registrations.delete(name);
    }
    try {
      for (const definition of next) {
        if (registrations.has(definition.name)) continue;
        const controller = new AbortController();
        await context.registerTool({
          ...publicDefinition(definition),
          execute: (input, options = {}) => executeByName(definition.name, input, options),
        }, { signal: controller.signal });
        registrations.set(definition.name, { controller, signature: toolSignature(definition) });
      }
      registeredContext = context;
      mode = 'native';
      lastError = null;
    } catch (error) {
      // A half-registered surface is misleading; drop everything so the next sync retries the full set.
      abortRegistrations();
      mode = 'preview';
      lastError = error instanceof Error ? error.message : String(error);
    }
    onStatus(status());
  }

  function sync(next) {
    const requested = [...next];
    syncQueue = syncQueue.then(() => syncNow(requested), () => syncNow(requested));
    return syncQueue;
  }

  function idle() { return syncQueue; }
  function listTools() { return definitions.map(publicDefinition); }
  function executeTool(name, input = {}, options = {}) { return executeByName(name, input, options); }
  function status() {
    const context = contextProvider();
    const documentContext = globalThis.document?.modelContext;
    const navigatorContext = globalThis.navigator?.modelContext;
    const isEmbedded = embedded();
    return {
      mode,
      toolCount: definitions.length,
      registeredToolCount: mode === 'native' ? registrations.size : 0,
      inFlight,
      pendingSync: deferredDefinitions !== null,
      lastError,
      embedded: isEmbedded,
      reason: isEmbedded ? EMBEDDED_FRAME_REASON : null,
      api: context ? (documentContext === context ? 'document.modelContext' : navigatorContext === context ? 'navigator.modelContext' : 'custom') : null,
    };
  }
  const bridge = { listTools, executeTool, status };
  if (bridgeTarget) Object.defineProperty(bridgeTarget, bridgeName, { value: bridge, configurable: true });
  return { sync, idle, listTools, executeTool, status, destroy: abortRegistrations };
}
