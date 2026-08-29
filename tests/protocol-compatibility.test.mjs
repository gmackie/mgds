import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { negotiateCapability } from '../scripts/negotiate-version.mjs';

const root = new URL('../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('handshake fixtures cover exact, compatible, deprecated, and unsupported versions', async () => {
  const [fixture, registry] = await Promise.all([
    json('fixtures/v0/compatibility.json'),
    json('registry/v0/versions.json'),
  ]);
  assert.deepEqual(new Set(fixture.cases.map(({ expected }) => expected)), new Set(['exact', 'compatible', 'deprecated', 'unsupported']));
  for (const candidate of fixture.cases) {
    assert.equal(negotiateCapability(candidate.requested, candidate.advertised, registry).status, candidate.expected, candidate.name);
  }
});

test('profiles declare mandatory clauses and capability sets', async () => {
  const registry = await json('registry/v0/profiles.json');
  assert.equal(registry.version, 1);
  assert.ok(registry.profiles.some(({ id }) => id === 'mgds.conformance.t0@0.1.0'));
  for (const profile of registry.profiles) {
    assert.ok(profile.clauses.length > 0);
    assert.ok(profile.capabilities.length > 0);
  }
});

test('all schemas compile together and conformance fixture validates', () => {
  const run = spawnSync(process.execPath, ['scripts/validate-schemas.mjs'], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /schemas compiled:/);
  assert.match(run.stdout, /conformance fixture: accepted/);
});

test('schema validation is part of the public check and CI gates', async () => {
  const [pkg, ci] = await Promise.all([
    json('package.json'),
    readFile(new URL('.github/workflows/ci.yml', root), 'utf8'),
  ]);
  assert.equal(pkg.scripts['schemas:check'], 'node scripts/validate-schemas.mjs');
  assert.match(pkg.scripts.check, /schemas:check/);
  assert.match(ci, /pnpm schemas:check/);
});
