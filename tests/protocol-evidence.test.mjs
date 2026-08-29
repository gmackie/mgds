import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { assertPublishable } from '../scripts/evidence-contract.mjs';

const root = new URL('../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const kinds = ['task', 'run', 'artifact', 'evidence', 'result'];

async function schemaValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of await Promise.all(kinds.map((kind) => json(`schemas/v0/${kind}.schema.json`)))) ajv.addSchema(schema);
  return Object.fromEntries(kinds.map((kind) => [kind, ajv.getSchema(`https://mgds.dev/schemas/v0/${kind}.schema.json`)]));
}

test('task, run, artifact, evidence, and result golden fixtures validate', async () => {
  const [fixture, validators] = await Promise.all([json('fixtures/v0/evidence.valid.json'), schemaValidators()]);
  for (const kind of kinds) {
    assert.equal(validators[kind](fixture[kind]), true, `${kind}: ${JSON.stringify(validators[kind].errors)}`);
  }
  assert.equal(assertPublishable(fixture), true);
});

test('schema fixtures reject missing hashes and agent-authored verdicts', async () => {
  const [fixture, validators] = await Promise.all([json('fixtures/v0/evidence.invalid.json'), schemaValidators()]);
  for (const candidate of fixture.schemaCases) {
    assert.equal(validators[candidate.schema](candidate.value), false, candidate.name);
  }
});

test('publication rejects secrets, identities, raw paths, and transcript text recursively', () => {
  const prohibited = [
    { note: 'token=ghp_abcdefghijklmnopqrstuvwxyz123456' },
    { note: '/Users/alice/private-game/Assets' },
    { note: 'C:\\Users\\Alice\\SecretGame' },
    { userEmail: 'person@example.test' },
    { transcript: 'the agent said this' },
  ];
  for (const value of prohibited) assert.throws(() => assertPublishable(value), /MGDS_PRIVACY_REJECTED/);
});

test('every run pins reproducibility identities and evaluator authority', async () => {
  const fixture = await json('fixtures/v0/evidence.valid.json');
  for (const key of ['taskHash', 'controllerDigest', 'adapterDigest', 'evaluatorDigest', 'policyHash', 'unityVersion', 'seed']) {
    assert.ok(fixture.run[key] !== undefined, `missing ${key}`);
  }
  assert.equal(fixture.result.evaluator.authority, 'independent-evaluator');
});
