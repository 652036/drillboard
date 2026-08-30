export const MAX_TOOL_OUTPUT_CHARS = 1500;
export const TOOL_CHUNK_CHARS = 520;
const TOOL_CHUNK_SERIALIZED_CHARS = 1000;

function normalizedCursor(cursor, total) {
  if (!Number.isInteger(cursor) || cursor < 0) return 0;
  return Math.min(cursor, total);
}

export function segmentText(value, cursor = 0, chunkSize = TOOL_CHUNK_CHARS) {
  const text = String(value ?? '');
  const startCursor = normalizedCursor(cursor, text.length);
  const maximumEnd = Math.min(text.length, startCursor + chunkSize);
  let low = startCursor;
  let high = maximumEnd;
  let endCursor = startCursor;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (JSON.stringify(text.slice(startCursor, middle)).length <= TOOL_CHUNK_SERIALIZED_CHARS) {
      endCursor = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return {
    chunk: text.slice(startCursor, endCursor),
    startCursor,
    nextCursor: endCursor < text.length ? endCursor : null,
    hasMore: endCursor < text.length,
    totalCharacters: text.length,
  };
}

export function segmentJson(value, cursor = 0) {
  return { format: 'application/json', ...segmentText(JSON.stringify(value), cursor) };
}

export function assertToolOutputBudget(value, maximum = MAX_TOOL_OUTPUT_CHARS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool execution must return a plain object.');
  if ('content' in value || 'structuredContent' in value) throw new Error('Tool execution must return one plain object, not an MCP content wrapper.');
  const size = JSON.stringify(value).length;
  if (size > maximum) throw new Error(`Tool output exceeded the ${maximum}-character budget (${size}). Use a section cursor for bounded retrieval.`);
  return value;
}
