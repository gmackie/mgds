import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ArtifactStore } from '../src/artifact-store.mjs';
import { EventLedger } from '../src/event-ledger.mjs';

const temporary = (prefix) => mkdtemp(path.join(tmpdir(), prefix));

test('artifact hashes are stable across machines and content is verified on read', async () => {
  const [leftRoot, rightRoot] = await Promise.all([temporary('mgds-artifact-a-'), temporary('mgds-artifact-b-')]);
  const bytes = Buffer.from('{"state":"ready"}\n');
  const left = await new ArtifactStore(leftRoot).put({ logicalName: 'state.json', mediaType: 'application/json', bytes });
  const right = await new ArtifactStore(rightRoot).put({ logicalName: 'state.json', mediaType: 'application/json', bytes });
  assert.equal(left.sha256, right.sha256);
  assert.deepEqual(await new ArtifactStore(leftRoot).get(left.sha256), bytes);
});

test('tampering, path-like names, partial writes, and symlink stores are rejected', async () => {
  const root = await temporary('mgds-artifact-tamper-');
  const store = new ArtifactStore(root);
  await assert.rejects(() => store.put({ logicalName: '../escape', mediaType: 'text/plain', bytes: Buffer.from('x') }), /logical name/);
  const artifact = await store.put({ logicalName: 'safe.txt', mediaType: 'text/plain', bytes: Buffer.from('safe') });
  await writeFile(path.join(root, 'objects', artifact.sha256.slice(0, 2), artifact.sha256), 'tampered');
  await assert.rejects(() => store.get(artifact.sha256), /hash mismatch/);
  await writeFile(path.join(root, 'manifests', 'unfinished.partial'), 'partial');
  assert.equal((await store.list()).length, 1);

  const symlinkRoot = await temporary('mgds-artifact-link-');
  const outside = await temporary('mgds-artifact-outside-');
  await mkdir(symlinkRoot, { recursive: true });
  await symlink(outside, path.join(symlinkRoot, 'objects'));
  await assert.rejects(() => new ArtifactStore(symlinkRoot).put({ logicalName: 'safe.txt', mediaType: 'text/plain', bytes: Buffer.from('safe') }), /symlink/);
});

test('event ledger uses a deterministic hash chain and detects mutation', async () => {
  const root = await temporary('mgds-ledger-');
  const file = path.join(root, 'events.jsonl');
  const ledger = new EventLedger(file);
  await ledger.append({ type: 'submitted', jobId: 'job_test_0000000001' });
  await ledger.append({ type: 'transition', from: 'queued', to: 'granted' });
  const entries = await ledger.entries();
  assert.equal(entries[1].previousHash, entries[0].hash);
  assert.equal(await ledger.verify(), true);

  const original = await readFile(file, 'utf8');
  await writeFile(file, original.replace('granted', 'running'));
  await assert.rejects(() => ledger.verify(), /ledger hash mismatch/);
});
