import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('repository declares separate code and documentation licenses', async () => {
  const [code, docs, reuse, pkg, ci] = await Promise.all([
    read('LICENSE'),
    read('LICENSE-DOCS'),
    read('REUSE.toml'),
    read('package.json').then(JSON.parse),
    read('.github/workflows/ci.yml'),
  ]);

  assert.match(code, /Apache License/);
  assert.match(docs, /Creative Commons Attribution 4.0 International/);
  assert.match(reuse, /SPDX-License-Identifier/);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.scripts['license:check'], 'uvx --with=reuse[charset-normalizer] reuse lint');
  assert.match(ci, /pnpm license:check/);
});

test('contribution and governance contracts preserve public authority boundaries', async () => {
  const [contributing, governance, rfcs] = await Promise.all([
    read('CONTRIBUTING.md'),
    read('GOVERNANCE.md'),
    read('rfcs/README.md'),
  ]);

  assert.match(contributing, /Developer Certificate of Origin/);
  assert.match(contributing, /security-sensitive/i);
  assert.match(governance, /normative/i);
  assert.match(governance, /two maintainer approvals/i);
  assert.match(rfcs, /compatibility/i);
  assert.match(rfcs, /security/i);
});

test('asset attribution is machine-readable and permits redistribution', async () => {
  const manifest = JSON.parse(await read('assets/ATTRIBUTION.json'));
  assert.equal(manifest.version, 1);
  assert.ok(Array.isArray(manifest.assets));
  for (const asset of manifest.assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.equal(asset.redistributionAllowed, true);
    assert.ok(asset.source);
    assert.ok(asset.license);
  }
});
