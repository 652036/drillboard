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

function definitionSignature(definitions) {
  return JSON.stringify(definitions.map(publicDefinition));
}

function defaultContext() {
  return globalThis.document?.modelContext ?? null;
}

export function createWebMCPRegistry({ bridgeName = '__webMCP', onStatus = () => {}, contextProvider = defaultContext, bridgeTarget = globalThis.window } = {}) {
  let definitions = [];
  let controllers = [];
  let nativeSignature = null;
  let registeredContext = null;
  let mode = 'preview';
  let lastError = null;
  let syncQueue = Promise.resolve();

  function abortRegistrations() {
    controllers.forEach((controller) => controller.abort());
    controllers = [];
    nativeSignature = null;
    registeredContext = null;
  }

  async function executeDefinition(definition, input = {}, options = {}) {
    if (options.signal?.aborted) throw new DOMException('Tool execution was cancelled.', 'AbortError');
    const errors = validateSchema(definition.inputSchema, input);
    if (errors.length) throw new Error(errors.join('; '));
    return assertToolOutputBudget(await definition.execute(input, options));
  }

  async function syncNow(next) {
    definitions = next;
    const nextSignature = definitionSignature(next);
    const context = contextProvider();
    if (!context?.registerTool) {
      abortRegistrations();
      mode = 'preview';
      lastError = null;
      onStatus(status());
      return;
    }
    if (registeredContext === context && nativeSignature === nextSignature) {
      mode = 'native';
      onStatus(status());
      return;
    }

    abortRegistrations();
    const pendingControllers = [];
    try {
      for (const definition of next) {
        const controller = new AbortController();
        pendingControllers.push(controller);
        await context.registerTool({
          ...publicDefinition(definition),
          execute: (input, options = {}) => executeDefinition(definition, input, options),
        }, { signal: controller.signal });
      }
      controllers = pendingControllers;
      nativeSignature = nextSignature;
      registeredContext = context;
      mode = 'native';
      lastError = null;
    } catch (error) {
      pendingControllers.forEach((controller) => controller.abort());
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

  function listTools() { return definitions.map(publicDefinition); }
  async function executeTool(name, input = {}, options = {}) {
    const tool = definitions.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return executeDefinition(tool, input, options);
  }
  function status() {
    const context = contextProvider();
    const documentContext = globalThis.document?.modelContext;
    return { mode, toolCount: definitions.length, registeredToolCount: mode === 'native' ? controllers.length : 0, lastError, api: context ? (documentContext === context ? 'document.modelContext' : 'custom') : null };
  }
  const bridge = { listTools, executeTool, status };
  if (bridgeTarget) Object.defineProperty(bridgeTarget, bridgeName, { value: bridge, configurable: true });
  return { sync, listTools, executeTool, status, destroy: abortRegistrations };
}
