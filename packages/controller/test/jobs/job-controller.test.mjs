import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JobController, JsonJobStore } from '../../src/jobs/job-controller.mjs';

async function controller() {
  const directory = await mkdtemp(path.join(tmpdir(), 'mgds-jobs-'));
  let counter = 0;
  return new JobController(new JsonJobStore(directory), {
    idFactory: () => `job_test_${String(++counter).padStart(16, '0')}`,
    now: () => '2026-08-29T20:00:00Z',
  });
}

const procedure = (overrides = {}) => ({
  id: 'proc_01K3YXBR30T5K6A4H9CX',
  capabilityId: 'mgds.unity.editor.play.start@0.1.0',
  projectScope: 'prj_01K3YXA0J3V6J2HM8Q4W',
  idempotency: 'key-required',
  idempotencyKey: 'idem_01K3YXBX3X6XQREZ5V9M',
  ...overrides,
});

test('idempotency keys return the original job without a second execution', async () => {
  const jobs = await controller();
  const first = await jobs.submit(procedure());
  const duplicate = await jobs.submit(procedure({ id: 'proc_01K3YXDIFFERENT0000' }));
  assert.equal(duplicate.id, first.id);
  assert.equal((await jobs.events(first.id)).filter(({ type }) => type === 'submitted').length, 1);
});

test('legal transitions, retry, cancellation, timeout, and terminal immutability are enforced', async () => {
  const jobs = await controller();
  const job = await jobs.submit(procedure());
  await jobs.transition(job.id, 'granted');
  await jobs.transition(job.id, 'running');
  await jobs.checkpoint(job.id, { cursor: 3 });
  await jobs.resume(job.id);
  assert.equal((await jobs.get(job.id)).attempt, 2);
  await jobs.transition(job.id, 'cancelling');
  await jobs.transition(job.id, 'cancelled');
  await assert.rejects(() => jobs.transition(job.id, 'running'), /illegal transition/);

  const timed = await jobs.submit(procedure({ idempotencyKey: 'idem_01K3YXTIMED000000001' }));
  await jobs.transition(timed.id, 'granted');
  await jobs.transition(timed.id, 'running');
  await jobs.timeout(timed.id);
  assert.equal((await jobs.get(timed.id)).state, 'timed-out');
});

test('checkpoint and event sequence survive controller restart', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mgds-jobs-restart-'));
  const options = { idFactory: () => 'job_restart_0000000001', now: () => '2026-08-29T20:00:00Z' };
  const first = new JobController(new JsonJobStore(directory), options);
  const job = await first.submit(procedure());
  await first.transition(job.id, 'granted');
  await first.transition(job.id, 'running');
  await first.checkpoint(job.id, { generation: 7 });

  const restarted = new JobController(new JsonJobStore(directory), options);
  const restored = await restarted.get(job.id);
  assert.deepEqual(restored.checkpoint, { generation: 7 });
  assert.deepEqual((await restarted.events(job.id)).map(({ sequence }) => sequence), [1, 2, 3, 4]);
});

test('never-idempotent procedures reject reuse of their procedure identity', async () => {
  const jobs = await controller();
  await jobs.submit(procedure({ idempotency: 'never', idempotencyKey: undefined }));
  await assert.rejects(() => jobs.submit(procedure({ idempotency: 'never', idempotencyKey: undefined })), /duplicate non-idempotent execution/);
});
