import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  buildHarnessInvocation,
  buildHarnessRecord,
  buildTaskPrompt,
  executeBoundedProcess,
  hostIdForPlatform,
  parseHarnessOutcome,
  sanitizeHarnessEnvironment,
} from "../packages/harness-runner/src/index.mjs";

const options = parseOptions(process.argv.slice(2));
const [plan, taskBytes, schemaBytes] = await Promise.all([
  readJson(options.plan),
  readFile(options.task),
  readFile(new URL("../schemas/v0/harness-outcome.schema.json", import.meta.url)),
]);
const task = JSON.parse(taskBytes);
const outputSchema = JSON.parse(schemaBytes);
const slot = plan.slots?.find(({ slotId }) => slotId === options.slot);
if (!slot) throw new Error(`campaign slot not found: ${options.slot}`);
if (slot.host !== hostIdForPlatform()) throw new Error(`slot host ${slot.host} does not match this host`);
if (slot.taskHash !== digest(taskBytes) || task.id !== slot.taskId) throw new Error("task bytes do not match sealed campaign slot");
if (slot.harness !== options.harness) throw new Error("slot harness does not match --harness");

const temporary = await mkdtemp(join(tmpdir(), "mgds-harness-"));
try {
  const providerOutput = join(temporary, "provider-outcome.json");
  const schemaPath = join(temporary, "outcome.schema.json");
  await writeFile(schemaPath, schemaBytes, { mode: 0o600 });
  const invocation = buildHarnessInvocation({
    harness: slot.harness,
    model: options.model,
    workspace: resolve(options.workspace),
    outputSchemaPath: schemaPath,
    outputPath: providerOutput,
    outputSchema,
  });
  const processResult = await executeBoundedProcess({
    ...invocation,
    cwd: resolve(options.workspace),
    stdin: buildTaskPrompt({ slot, task }),
    timeoutMs: Number(options["timeout-ms"] ?? task.budgets.wallMinutes * 60_000),
    maxOutputBytes: 1024 * 1024,
    env: sanitizeHarnessEnvironment(slot.harness),
  });
  if (processResult.exitCode !== 0) throw new Error(`harness exited with code ${processResult.exitCode}`);
  const output = slot.harness === "codex" ? await readFile(providerOutput, "utf8") : processResult.stdout;
  const outcome = parseHarnessOutcome({ harness: slot.harness, output });
  const record = buildHarnessRecord({ slot, model: options.model, outcome, durationMs: processResult.durationMs });
  await writeJsonAtomic(options.output, record);
  process.stdout.write(`${JSON.stringify(record)}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function parseOptions(args) {
  if (args[0] === "--") args = args.slice(1);
  const value = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`);
    value[args[index].slice(2)] = args[index + 1];
  }
  for (const name of ["plan", "slot", "task", "harness", "workspace", "model", "output"]) if (!value[name]) throw new Error(`--${name} is required`);
  if (value["timeout-ms"] && (!Number.isInteger(Number(value["timeout-ms"])) || Number(value["timeout-ms"]) < 1)) throw new Error("--timeout-ms must be a positive integer");
  return value;
}

async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
function digest(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await rename(temporaryPath, path);
}
