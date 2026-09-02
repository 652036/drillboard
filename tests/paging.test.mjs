import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAGE_LIMIT, ITEM_PAGE_BUDGET_CHARS, MAX_PAGE_LIMIT, MAX_TOOL_OUTPUT_CHARS, assertToolOutputBudget, pageItems, pageMessage, segmentJson, segmentText } from '../src/paging.js';

function collectSegments(makeSegment) {
  let cursor = 0;
  let reconstructed = '';
  do {
    const segment = makeSegment(cursor);
    const envelope = { message: 'Bounded segment.', section: 'test', ...segment };
    assert.ok(JSON.stringify(envelope).length <= MAX_TOOL_OUTPUT_CHARS);
    assertToolOutputBudget(envelope);
    reconstructed += segment.chunk;
    cursor = segment.nextCursor;
  } while (cursor !== null);
  return reconstructed;
}

function collectPages(items, options = {}) {
  let offset = 0;
  const collected = [];
  let pages = 0;
  do {
    const page = pageItems(items, { ...options, offset });
    const envelope = { message: pageMessage('Test items', page), section: 'test', ...page };
    assert.ok(JSON.stringify(envelope).length <= MAX_TOOL_OUTPUT_CHARS, `page ${pages} exceeded the tool budget`);
    assertToolOutputBudget(envelope);
    assert.ok(Array.isArray(page.items));
    assert.equal(page.returned, page.items.length);
    assert.equal(page.offset, offset);
    assert.ok(page.returned >= 1 || page.total === 0, 'every non-empty page must contain at least one whole item');
    collected.push(...page.items);
    offset = page.nextCursor;
    pages += 1;
  } while (offset !== null);
  return { collected, pages };
}

test('budget constants leave headroom for the paging envelope', () => {
  assert.equal(MAX_TOOL_OUTPUT_CHARS, 4000);
  assert.ok(ITEM_PAGE_BUDGET_CHARS < MAX_TOOL_OUTPUT_CHARS - 500);
  assert.ok(DEFAULT_PAGE_LIMIT <= MAX_PAGE_LIMIT);
});

test('text segmentation stays under budget and reconstructs escape-heavy content', () => {
  const source = '\\"\u0000#'.repeat(2500);
  assert.equal(collectSegments((cursor) => segmentText(source, cursor)), source);
});

test('JSON segmentation stays under budget and reconstructs the complete payload', () => {
  const payload = { records: Array.from({ length: 200 }, (_, index) => ({ id: index, text: `record-${index}-${'\\"'.repeat(30)}` })) };
  const serialized = JSON.stringify(payload);
  assert.equal(collectSegments((cursor) => segmentJson(payload, cursor)), serialized);
});

test('item paging returns whole items, honours limit, and reconstructs the complete list in order', () => {
  const items = Array.from({ length: 57 }, (_, index) => ({ id: `item-${index}`, title: `Title ${index}`, text: 'x'.repeat(40) }));
  const { collected, pages } = collectPages(items, { limit: 10 });
  assert.deepEqual(collected, items);
  assert.equal(pages, 6);
  const first = pageItems(items, { offset: 0, limit: 10 });
  assert.equal(first.returned, 10);
  assert.equal(first.nextCursor, 10);
  assert.equal(first.total, 57);
  assert.equal(first.hasMore, true);
  const last = pageItems(items, { offset: 50, limit: 10 });
  assert.equal(last.returned, 7);
  assert.equal(last.nextCursor, null);
  assert.equal(last.hasMore, false);
});

test('item paging shrinks a page instead of splitting an item when the budget is tight', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: index, rationale: 'r'.repeat(700), title: 't'.repeat(100) }));
  const page = pageItems(items, { offset: 0, limit: MAX_PAGE_LIMIT });
  assert.ok(page.returned < 12, 'page must shrink below the requested limit');
  assert.ok(page.returned >= 1);
  assert.ok(JSON.stringify(page.items).length <= ITEM_PAGE_BUDGET_CHARS);
  for (const item of page.items) assert.equal(item.rationale.length, 700, 'items are never truncated');
  const { collected } = collectPages(items, { limit: MAX_PAGE_LIMIT });
  assert.deepEqual(collected, items);
});

test('item paging tolerates empty lists, out-of-range offsets, and bad limits', () => {
  const empty = pageItems([], { offset: 0 });
  assert.deepEqual(empty.items, []);
  assert.equal(empty.total, 0);
  assert.equal(empty.nextCursor, null);
  assert.match(pageMessage('Test items', empty), /No Test items recorded/);
  const items = [{ id: 1 }, { id: 2 }];
  const beyond = pageItems(items, { offset: 99 });
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.offset, 2);
  assert.equal(beyond.nextCursor, null);
  assert.equal(pageItems(items, { limit: 999 }).limit, MAX_PAGE_LIMIT);
  assert.equal(pageItems(items, { limit: -3 }).limit, 1);
  assert.equal(pageItems(items, { limit: 'ten' }).limit, DEFAULT_PAGE_LIMIT);
  assert.equal(pageItems(items, { offset: -4 }).offset, 0);
  assert.match(pageMessage('Test items', pageItems(items, { limit: 1 })), /1-1 of 2; pass offset=1/);
  assert.match(pageMessage('Test items', pageItems(items, { offset: 1, limit: 1 })), /2-2 of 2; this is the last page/);
});
