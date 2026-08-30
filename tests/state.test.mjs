import test from 'node:test';
import assert from 'node:assert/strict';
import { StatePersistenceError, commitState } from '../src/state.js';

test('transactional state commits a cloned candidate only after persistence succeeds', () => {
  const original = { exercise: { clock: 15 }, activity: [] };
  let saved;
  const committed = commitState(original, (draft) => { draft.exercise.clock = 30; }, (candidate) => { saved = structuredClone(candidate); });
  assert.equal(original.exercise.clock, 15);
  assert.equal(committed.exercise.clock, 30);
  assert.deepEqual(saved, committed);
  assert.notEqual(committed, original);
});

test('transactional state leaves the live state untouched when persistence fails', () => {
  const original = { exercise: { clock: 15, observations: [] }, activity: [] };
  assert.throws(() => commitState(original, (draft) => { draft.exercise.clock = 90; draft.exercise.observations.push({ id: 'unsaved' }); }, () => { throw new Error('quota exceeded'); }), (error) => error instanceof StatePersistenceError && /No changes were applied.*quota exceeded/.test(error.message));
  assert.deepEqual(original, { exercise: { clock: 15, observations: [] }, activity: [] });
});
