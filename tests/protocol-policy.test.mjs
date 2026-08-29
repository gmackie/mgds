import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { assertApproval, consumeBudget, evaluatePolicy } from '../scripts/policy-contract.mjs';

const root = new URL('../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('policy, approval, lease, and budget golden fixtures validate', async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const kinds = ['policy', 'approval', 'lease', 'budget'];
  for (const schema of await Promise.all(kinds.map((kind) => json(`schemas/v0/${kind}.schema.json`)))) ajv.addSchema(schema);
  const fixture = await json('fixtures/v0/authority.valid.json');
  for (const kind of kinds) {
    const validate = ajv.getSchema(`https://mgds.dev/schemas/v0/${kind}.schema.json`);
    assert.equal(validate(fixture[kind]), true, `${kind}: ${JSON.stringify(validate.errors)}`);
  }
});

test('policy is deny-by-default and never downgrades requested risk', () => {
  const policy = {
    defaultDecision: 'deny',
    grants: [{ capabilityId: 'mgds.unity.project.assets.list@0.1.0', projectScope: 'prj_scope_0123456789', riskCeiling: 'read', expiresAt: '2026-08-29T21:00:00Z' }],
  };
  assert.equal(evaluatePolicy({ capabilityId: 'mgds.unity.unknown@0.1.0', projectScope: 'prj_scope_0123456789', risk: 'read' }, policy, '2026-08-29T20:00:00Z').decision, 'deny');
  assert.equal(evaluatePolicy({ capabilityId: 'mgds.unity.project.assets.list@0.1.0', projectScope: 'prj_scope_0123456789', risk: 'bounded-write' }, policy, '2026-08-29T20:00:00Z').decision, 'deny');
  assert.equal(evaluatePolicy({ capabilityId: 'mgds.unity.project.assets.list@0.1.0', projectScope: 'prj_scope_0123456789', risk: 'read' }, policy, '2026-08-29T20:00:00Z').decision, 'allow');
});

test('approval binds the exact request hash, risk, and expiry', () => {
  const approval = {
    requestHash: `sha256:${'a'.repeat(64)}`,
    riskCeiling: 'bounded-write',
    expiresAt: '2026-08-29T21:00:00Z',
  };
  assert.doesNotThrow(() => assertApproval({ requestHash: approval.requestHash, risk: 'bounded-write' }, approval, '2026-08-29T20:00:00Z'));
  assert.throws(() => assertApproval({ requestHash: `sha256:${'b'.repeat(64)}`, risk: 'bounded-write' }, approval, '2026-08-29T20:00:00Z'), /request hash/);
  assert.throws(() => assertApproval({ requestHash: approval.requestHash, risk: 'elevated' }, approval, '2026-08-29T20:00:00Z'), /risk ceiling/);
  assert.throws(() => assertApproval({ requestHash: approval.requestHash, risk: 'read' }, approval, '2026-08-29T22:00:00Z'), /expired/);
});

test('budget consumption terminates at the first exhausted dimension', () => {
  const remaining = consumeBudget({ wallTimeSeconds: 10, artifactBytes: 1000, networkRequests: 2, retries: 1 }, { wallTimeSeconds: 4, artifactBytes: 200, networkRequests: 1, retries: 0 });
  assert.deepEqual(remaining, { wallTimeSeconds: 6, artifactBytes: 800, networkRequests: 1, retries: 1 });
  assert.throws(() => consumeBudget(remaining, { wallTimeSeconds: 7 }), /MGDS_BUDGET_EXHAUSTED:wallTimeSeconds/);
});

test('negative authority fixtures are rejected by their declared schema', async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const kinds = ['policy', 'approval', 'lease', 'budget'];
  for (const schema of await Promise.all(kinds.map((kind) => json(`schemas/v0/${kind}.schema.json`)))) ajv.addSchema(schema);
  const fixture = await json('fixtures/v0/authority.invalid.json');
  for (const candidate of fixture.cases) {
    const validate = ajv.getSchema(`https://mgds.dev/schemas/v0/${candidate.schema}.schema.json`);
    assert.equal(validate(candidate.value), false, candidate.name);
  }
});
