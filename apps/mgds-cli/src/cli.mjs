#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createReferenceService } from '../../../packages/controller/src/reference-service.mjs';

const [command, ...raw] = process.argv.slice(2);
const options = {};
for (let index = 0; index < raw.length; index += 2) {
  if (!raw[index]?.startsWith('--') || raw[index + 1] === undefined) throw new Error(`invalid argument: ${raw[index]}`);
  options[raw[index].slice(2)] = raw[index + 1];
}
const state = options.state ?? '.mgds';
const now = process.env.MGDS_NOW;
const service = createReferenceService(state, now ? { now: () => now } : undefined);

let result;
switch (command) {
  case 'doctor': result = service.doctor(); break;
  case 'discover': result = service.discover(); break;
  case 'run-task': result = await service.runTask(JSON.parse(await readFile(options.task, 'utf8'))); break;
  case 'cancel': result = await service.cancel(options.job); break;
  case 'collect': result = await service.collect(options.run); break;
  case 'report': result = await service.report(options.run); break;
  default: throw new Error(`unknown command: ${command}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
