import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { assertJobTrace, isLegalTransition, JOB_STATES } from '../scripts/job-trace.mjs';

const root = new URL('../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('procedure, job, and event golden fixtures satisfy their schemas', async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schemas = await Promise.all([
    'schemas/v0/procedure.schema.json',
    'schemas/v0/job.schema.json',
    'schemas/v0/event.schema.json',
  ].map(json));
  for (const schema of schemas) ajv.addSchema(schema);
  const fixture = await json('fixtures/v0/job-lifecycle.valid.json');
  for (const [kind, value] of Object.entries(fixture)) {
    const validate = ajv.getSchema(`https://mgds.dev/schemas/v0/${kind}.schema.json`);
    assert.equal(validate(value), true, `${kind}: ${JSON.stringify(validate.errors)}`);
  }
});

test('the transition relation admits only the normative lifecycle edges', () => {
  const legal = new Set([
    'queued>granted', 'queued>cancelled',
    'granted>running', 'granted>cancelled', 'granted>expired',
    'running>checkpointed', 'running>succeeded', 'running>failed', 'running>cancelling', 'running>timed-out',
    'checkpointed>running', 'checkpointed>failed', 'checkpointed>cancelling', 'checkpointed>timed-out',
    'cancelling>cancelled', 'cancelling>failed',
  ]);
  for (const from of JOB_STATES) {
    for (const to of JOB_STATES) {
      assert.equal(isLegalTransition(from, to), legal.has(`${from}>${to}`), `${from}>${to}`);
    }
  }
});

test('terminal jobs are immutable and duplicate non-idempotent execution is rejected', () => {
  const terminalMutation = [
    { sequence: 1, type: 'transition', from: 'queued', to: 'granted' },
    { sequence: 2, type: 'transition', from: 'granted', to: 'running' },
    { sequence: 3, type: 'transition', from: 'running', to: 'succeeded' },
    { sequence: 4, type: 'transition', from: 'succeeded', to: 'running' },
  ];
  assert.throws(() => assertJobTrace(terminalMutation, { idempotency: 'safe' }), /illegal transition/);

  const duplicate = [
    { sequence: 1, type: 'execution-started', attempt: 1 },
    { sequence: 2, type: 'execution-started', attempt: 2 },
  ];
  assert.throws(() => assertJobTrace(duplicate, { idempotency: 'never' }), /duplicate non-idempotent execution/);
});

test('error registry has stable unique codes and retry semantics', async () => {
  const registry = await json('registry/v0/errors.json');
  const codes = registry.errors.map(({ code }) => code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((code) => /^MGDS_[A-Z0-9_]+$/.test(code)));
  assert.ok(registry.errors.every(({ retry }) => ['never', 'same-request', 'new-lease', 'after-recovery'].includes(retry)));
});
