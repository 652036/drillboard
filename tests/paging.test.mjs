import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TOOL_OUTPUT_CHARS, assertToolOutputBudget, segmentJson, segmentText } from '../src/paging.js';

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

test('text segmentation stays under budget and reconstructs escape-heavy content', () => {
  const source = '\\"\u0000#'.repeat(900);
  assert.equal(collectSegments((cursor) => segmentText(source, cursor)), source);
});

test('JSON segmentation stays under budget and reconstructs the complete payload', () => {
  const payload = { records: Array.from({ length: 80 }, (_, index) => ({ id: index, text: `record-${index}-${'\\"'.repeat(30)}` })) };
  const serialized = JSON.stringify(payload);
  assert.equal(collectSegments((cursor) => segmentJson(payload, cursor)), serialized);
});
