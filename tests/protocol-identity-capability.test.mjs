import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const root = new URL('../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

async function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schemas = await Promise.all([
    'schemas/v0/resource.schema.json',
    'schemas/v0/capability.schema.json',
    'schemas/v0/manifest.schema.json',
  ].map(json));
  for (const schema of schemas) ajv.addSchema(schema);
  return {
    resource: ajv.getSchema('https://mgds.dev/schemas/v0/resource.schema.json'),
    capability: ajv.getSchema('https://mgds.dev/schemas/v0/capability.schema.json'),
    manifest: ajv.getSchema('https://mgds.dev/schemas/v0/manifest.schema.json'),
  };
}

test('identity, resource, capability, and manifest golden fixture validates', async () => {
  const [fixture, validate] = await Promise.all([
    json('fixtures/v0/identity-resource-capability.valid.json'),
    validators(),
  ]);
  assert.equal(validate.resource(fixture.resource), true, JSON.stringify(validate.resource.errors));
  assert.equal(validate.capability(fixture.capability), true, JSON.stringify(validate.capability.errors));
  assert.equal(validate.manifest(fixture.manifest), true, JSON.stringify(validate.manifest.errors));
});

test('resource identity rejects raw paths, missing scope, and negative generations', async () => {
  const [fixture, { resource }] = await Promise.all([
    json('fixtures/v0/resource.invalid.json'),
    validators(),
  ]);
  for (const candidate of fixture.cases) {
    assert.equal(resource(candidate.value), false, `${candidate.name} unexpectedly passed`);
  }
});

test('capabilities require units, effects, risk, and authority', async () => {
  const [fixture, { capability }] = await Promise.all([
    json('fixtures/v0/capability.invalid.json'),
    validators(),
  ]);
  for (const candidate of fixture.cases) {
    assert.equal(capability(candidate.value), false, `${candidate.name} unexpectedly passed`);
  }
});

test('public capability registry uses unique versioned identifiers', async () => {
  const registry = await json('registry/v0/capabilities.json');
  assert.equal(registry.version, 1);
  const ids = registry.capabilities.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^mgds\.unity\.[a-z0-9.-]+@[0-9]+\.[0-9]+\.[0-9]+$/.test(id)));
});
