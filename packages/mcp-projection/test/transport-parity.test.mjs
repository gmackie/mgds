import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createReferenceService } from '../../controller/src/reference-service.mjs';
import { invokeMcp } from '../src/index.mjs';

const now = '2026-08-29T20:00:00Z';
const temporary = (prefix) => mkdtemp(path.join(tmpdir(), prefix));

function cli(state, command, args = []) {
  const result = spawnSync(process.execPath, ['apps/mgds-cli/src/cli.mjs', command, '--state', state, ...args], {
    encoding: 'utf8',
    env: { ...process.env, MGDS_NOW: now },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('doctor and discovery return equivalent JSON through CLI and MCP', async () => {
  const [cliState, mcpState] = await Promise.all([temporary('mgds-cli-'), temporary('mgds-mcp-')]);
  const service = createReferenceService(mcpState, { now: () => now });
  assert.deepEqual(cli(cliState, 'doctor'), await invokeMcp(service, 'mgds.doctor', {}));
  assert.deepEqual(cli(cliState, 'discover'), await invokeMcp(service, 'mgds.discover', {}));
});

test('run-task, collect, and report preserve transport parity', async () => {
  const [cliState, mcpState, fixtureRoot] = await Promise.all([temporary('mgds-cli-run-'), temporary('mgds-mcp-run-'), temporary('mgds-task-')]);
  const task = {
    id: 'mgds.task.fake.echo@0.1.0',
    capabilityId: 'mgds.unity.fake.echo@0.1.0',
    input: { message: 'hello' },
  };
  const taskPath = path.join(fixtureRoot, 'task.json');
  await writeFile(taskPath, JSON.stringify(task));
  const service = createReferenceService(mcpState, { now: () => now });

  const cliRun = cli(cliState, 'run-task', ['--task', taskPath]);
  const mcpRun = await invokeMcp(service, 'mgds.run-task', { task });
  assert.deepEqual(cliRun, mcpRun);
  assert.deepEqual(cli(cliState, 'collect', ['--run', cliRun.runId]), await invokeMcp(service, 'mgds.collect', { runId: mcpRun.runId }));
  assert.deepEqual(cli(cliState, 'report', ['--run', cliRun.runId]), await invokeMcp(service, 'mgds.report', { runId: mcpRun.runId }));
});

test('deferred jobs can be cancelled equivalently through both transports', async () => {
  const [cliState, mcpState, fixtureRoot] = await Promise.all([temporary('mgds-cli-cancel-'), temporary('mgds-mcp-cancel-'), temporary('mgds-task-cancel-')]);
  const task = { id: 'mgds.task.fake.cancel@0.1.0', capabilityId: 'mgds.unity.fake.echo@0.1.0', input: {}, defer: true };
  const taskPath = path.join(fixtureRoot, 'task.json');
  await writeFile(taskPath, JSON.stringify(task));
  const service = createReferenceService(mcpState, { now: () => now });

  const cliRun = cli(cliState, 'run-task', ['--task', taskPath]);
  const mcpRun = await invokeMcp(service, 'mgds.run-task', { task });
  assert.deepEqual(cli(cliState, 'cancel', ['--job', cliRun.jobId]), await invokeMcp(service, 'mgds.cancel', { jobId: mcpRun.jobId }));
});
