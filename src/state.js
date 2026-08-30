export class StatePersistenceError extends Error {
  constructor(cause) {
    const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : '';
    super(`Could not save the exercise. No changes were applied.${detail}`, { cause });
    this.name = 'StatePersistenceError';
  }
}

export function commitState(currentState, operation, persist) {
  if (typeof operation !== 'function' || typeof persist !== 'function') throw new TypeError('State operation and persistence callback are required.');
  const draft = structuredClone(currentState);
  operation(draft);
  try {
    persist(draft);
  } catch (error) {
    throw new StatePersistenceError(error);
  }
  return draft;
}
