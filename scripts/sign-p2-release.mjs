import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readExternalPrivateKey } from "../packages/campaign-operator/src/index.mjs";
import { signP2ReleaseSubject } from "../packages/release/src/p2-gate.mjs";

const options = parseOptions(process.argv.slice(2));
const subject = JSON.parse(await readFile(options.subject, "utf8"));
const privateKey = await readExternalPrivateKey({ path: options["private-key"], repositoryRoot: fileURLToPath(new URL("..", import.meta.url)) });
await writeJsonAtomic(options.output, signP2ReleaseSubject(subject.hash, privateKey));

function parseOptions(args) { if (args[0] === "--") args = args.slice(1); const value = {}; for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`); value[args[index].slice(2)] = args[index + 1]; } for (const name of ["subject", "private-key", "output"]) if (!value[name]) throw new Error(`--${name} is required`); return value; }
async function writeJsonAtomic(path, value) { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" }); await rename(temporary, path); }
