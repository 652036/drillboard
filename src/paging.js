export const MAX_TOOL_OUTPUT_CHARS = 4000;
export const TOOL_CHUNK_CHARS = 2400;
const TOOL_CHUNK_SERIALIZED_CHARS = 3200;
export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 25;
// Leaves room for the message/section/paging envelope under MAX_TOOL_OUTPUT_CHARS.
export const ITEM_PAGE_BUDGET_CHARS = 3000;

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

// Item-based paging: every page is a complete JSON array of whole items, so no key or string is ever split.
// The page ends early when adding the next item would exceed the serialized budget; at least one item is
// always returned so progress is guaranteed.
export function pageItems(items, { offset = 0, limit = DEFAULT_PAGE_LIMIT, budget = ITEM_PAGE_BUDGET_CHARS } = {}) {
  const source = Array.isArray(items) ? items : [];
  const total = source.length;
  const start = normalizedCursor(offset, total);
  const size = Number.isInteger(limit) ? Math.max(1, Math.min(limit, MAX_PAGE_LIMIT)) : DEFAULT_PAGE_LIMIT;
  const page = [];
  let used = 2;
  for (let index = start; index < total && page.length < size; index += 1) {
    const serialized = JSON.stringify(source[index]).length + (page.length ? 1 : 0);
    if (page.length && used + serialized > budget) break;
    page.push(source[index]);
    used += serialized;
  }
  const end = start + page.length;
  return {
    format: 'application/json',
    items: page,
    offset: start,
    limit: size,
    returned: page.length,
    total,
    nextCursor: end < total ? end : null,
    hasMore: end < total,
  };
}

export function pageMessage(label, page) {
  if (!page.total) return `No ${label} recorded.`;
  const range = `${page.offset + 1}-${page.offset + page.returned} of ${page.total}`;
  return page.nextCursor === null ? `${label} ${range}; this is the last page.` : `${label} ${range}; pass offset=${page.nextCursor} for the next page.`;
}

export function assertToolOutputBudget(value, maximum = MAX_TOOL_OUTPUT_CHARS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool execution must return a plain object.');
  if ('content' in value || 'structuredContent' in value) throw new Error('Tool execution must return one plain object, not an MCP content wrapper.');
  const size = JSON.stringify(value).length;
  if (size > maximum) throw new Error(`Tool output exceeded the ${maximum}-character budget (${size}). Use a section cursor for bounded retrieval.`);
  return value;
}
