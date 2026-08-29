export const JOB_STATES = Object.freeze([
  'queued',
  'granted',
  'running',
  'checkpointed',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
  'expired',
]);

const EDGES = new Set([
  'queued>granted', 'queued>cancelled',
  'granted>running', 'granted>cancelled', 'granted>expired',
  'running>checkpointed', 'running>succeeded', 'running>failed', 'running>cancelling', 'running>timed-out',
  'checkpointed>running', 'checkpointed>failed', 'checkpointed>cancelling', 'checkpointed>timed-out',
  'cancelling>cancelled', 'cancelling>failed',
]);

export function isLegalTransition(from, to) {
  return EDGES.has(`${from}>${to}`);
}

export function assertJobTrace(events, procedure) {
  let previousSequence = 0;
  let executions = 0;
  for (const event of events) {
    if (!Number.isInteger(event.sequence) || event.sequence <= previousSequence) {
      throw new Error('event sequence must increase monotonically');
    }
    previousSequence = event.sequence;
    if (event.type === 'transition' && !isLegalTransition(event.from, event.to)) {
      throw new Error(`illegal transition: ${event.from}>${event.to}`);
    }
    if (event.type === 'execution-started') executions += 1;
  }
  if (procedure.idempotency === 'never' && executions > 1) {
    throw new Error('duplicate non-idempotent execution');
  }
  return true;
}
