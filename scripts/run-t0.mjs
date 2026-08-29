import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { runT0 } from "../packages/evaluator/src/t0.mjs";
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), all[index + 1]]], []));
const adapters = JSON.parse(await readFile(new URL("../conformance/fixtures/adapters.json", import.meta.url)));
const result = { host: args.host, generatedAt: new Date(0).toISOString(), adapters: Object.fromEntries(Object.entries(adapters).map(([name, adapter]) => [name, runT0(adapter)])) };
await mkdir(dirname(args.output), { recursive: true }); await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`);
if (["fake", "unity", "gmacko"].some((name) => result.adapters[name].status !== "pass") || result.adapters.broken.status !== "fail") process.exitCode = 1;
