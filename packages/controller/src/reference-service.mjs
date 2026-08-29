import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ArtifactStore } from '../../artifacts/src/artifact-store.mjs';
import { FakeAdapter } from '../../adapter-testkit/src/fake-adapter.mjs';
import { JobController, JsonJobStore } from './jobs/job-controller.mjs';

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');

class ReferenceService {
  constructor(state, options = {}) {
    this.state = path.resolve(state);
    this.now = options.now ?? (() => new Date().toISOString());
    this.adapter = options.adapter ?? new FakeAdapter();
    this.currentJobId = null;
    this.jobs = new JobController(new JsonJobStore(path.join(this.state, 'jobs')), {
      now: this.now,
      idFactory: () => this.currentJobId,
    });
    this.artifacts = new ArtifactStore(path.join(this.state, 'artifacts'));
  }

  doctor() {
    return { ok: true, protocolVersion: '0.1.0', adapterId: this.adapter.manifest().adapter.id, profiles: ['core'] };
  }

  discover() {
    return this.adapter.manifest();
  }

  async runTask(task) {
    const taskHash = digest(task);
    const jobId = `job_${taskHash.slice(0, 24)}`;
    const runId = `run_${taskHash.slice(0, 24)}`;
    this.currentJobId = jobId;
    const job = await this.jobs.submit({
      id: `proc_${taskHash.slice(0, 24)}`,
      capabilityId: task.capabilityId,
      projectScope: 'prj_reference0000000001',
      idempotency: 'key-required',
      idempotencyKey: `idem_${taskHash.slice(0, 24)}`,
    });
    await this.jobs.transition(job.id, 'granted');
    await this.jobs.transition(job.id, 'running');
    if (task.defer) return { runId, jobId, state: 'running' };

    const output = await this.adapter.execute(task.capabilityId, task.input ?? {});
    const bytes = Buffer.from(`${canonical(output)}\n`);
    const artifact = await this.artifacts.put({ logicalName: 'adapter-output.json', mediaType: 'application/json', bytes });
    await this.jobs.transition(job.id, 'succeeded');
    const report = {
      runId,
      jobId,
      state: 'succeeded',
      taskId: task.id,
      taskHash: `sha256:${taskHash}`,
      artifact,
      result: output,
      completedAt: this.now(),
    };
    await mkdir(path.join(this.state, 'runs'), { recursive: true });
    await writeFile(path.join(this.state, 'runs', `${runId}.json`), `${JSON.stringify(report)}\n`);
    return { runId, jobId, state: 'succeeded', artifactHash: artifact.sha256 };
  }

  async cancel(jobId) {
    const job = await this.jobs.get(jobId);
    if (job.state === 'running' || job.state === 'checkpointed') await this.jobs.transition(jobId, 'cancelling');
    const cancelled = await this.jobs.transition(jobId, 'cancelled');
    return { jobId, state: cancelled.state };
  }

  async collect(runId) {
    const report = await this.#report(runId);
    return { runId, artifacts: [report.artifact] };
  }

  report(runId) {
    return this.#report(runId);
  }

  async #report(runId) {
    if (!/^run_[a-f0-9]{24}$/.test(runId)) throw new Error('MGDS_INVALID_REQUEST');
    return JSON.parse(await readFile(path.join(this.state, 'runs', `${runId}.json`), 'utf8'));
  }
}

export function createReferenceService(state, options) {
  return new ReferenceService(state, options);
}
