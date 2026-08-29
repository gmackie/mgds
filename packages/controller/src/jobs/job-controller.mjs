import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isLegalTransition } from '../../../../scripts/job-trace.mjs';

const EMPTY = Object.freeze({ jobs: {}, events: {}, idempotencyKeys: {}, procedureIds: {} });

export class JsonJobStore {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'jobs.json');
  }

  async load() {
    await mkdir(this.directory, { recursive: true });
    return JSON.parse(await readFile(this.file, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return JSON.stringify(EMPTY);
      throw error;
    }));
  }

  async save(snapshot) {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'w' });
    await rename(temporary, this.file);
  }
}

export class JobController {
  constructor(store, options = {}) {
    this.store = store;
    this.idFactory = options.idFactory ?? (() => `job_${crypto.randomUUID().replaceAll('-', '')}`);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async submit(procedure) {
    const snapshot = await this.store.load();
    if (procedure.idempotency === 'key-required') {
      if (!procedure.idempotencyKey) throw new Error('idempotency key required');
      const existing = snapshot.idempotencyKeys[procedure.idempotencyKey];
      if (existing) return structuredClone(snapshot.jobs[existing]);
    }
    if (procedure.idempotency === 'never' && snapshot.procedureIds[procedure.id]) {
      throw new Error('duplicate non-idempotent execution');
    }
    const id = this.idFactory();
    const at = this.now();
    const job = {
      id,
      procedureId: procedure.id,
      projectScope: procedure.projectScope,
      capabilityId: procedure.capabilityId,
      state: 'queued',
      attempt: 0,
      createdAt: at,
      updatedAt: at,
    };
    snapshot.jobs[id] = job;
    snapshot.events[id] = [{ sequence: 1, type: 'submitted', at }];
    snapshot.procedureIds[procedure.id] = id;
    if (procedure.idempotencyKey) snapshot.idempotencyKeys[procedure.idempotencyKey] = id;
    await this.store.save(snapshot);
    return structuredClone(job);
  }

  async get(id) {
    this.#assertId(id);
    const job = (await this.store.load()).jobs[id];
    if (!job) throw new Error('job not found');
    return structuredClone(job);
  }

  async events(id) {
    this.#assertId(id);
    return structuredClone((await this.store.load()).events[id] ?? []);
  }

  async transition(id, to, payload) {
    this.#assertId(id);
    const snapshot = await this.store.load();
    const job = snapshot.jobs[id];
    if (!job) throw new Error('job not found');
    if (!isLegalTransition(job.state, to)) throw new Error(`illegal transition: ${job.state}>${to}`);
    const from = job.state;
    job.state = to;
    job.updatedAt = this.now();
    if (to === 'running') job.attempt += 1;
    if (payload !== undefined) job.checkpoint = structuredClone(payload);
    const events = snapshot.events[id];
    events.push({ sequence: events.length + 1, type: 'transition', from, to, at: job.updatedAt, ...(payload === undefined ? {} : { payload }) });
    await this.store.save(snapshot);
    return structuredClone(job);
  }

  checkpoint(id, payload) {
    return this.transition(id, 'checkpointed', payload);
  }

  resume(id) {
    return this.transition(id, 'running');
  }

  timeout(id) {
    return this.transition(id, 'timed-out');
  }

  #assertId(id) {
    if (!/^job_[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid job id');
  }
}
