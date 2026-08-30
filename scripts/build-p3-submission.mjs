import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readExternalPrivateKey } from "../packages/campaign-operator/src/index.mjs";
import { buildP3Submission } from "../packages/p3-submission/src/index.mjs";

const options = parseOptions(process.argv.slice(2));
const [manifest, index] = await Promise.all([readJson(options.manifest), readJson(options.artifacts)]);
const artifacts = Object.fromEntries(await Promise.all(Object.entries(index).map(async ([portablePath, sourcePath]) => [portablePath, await readFile(sourcePath)])));
const privateKey = await readExternalPrivateKey({ path: options["private-key"], repositoryRoot: fileURLToPath(new URL("..", import.meta.url)) });
const built = buildP3Submission({ manifest, artifacts, authority: options.authority, privateKey });
await mkdir(dirname(options.output), { recursive: true });
const temporary = `${options.output}.${process.pid}.tmp`;
await writeFile(temporary, built.bytes, { mode: 0o600, flag: "wx" });
await rename(temporary, options.output);
process.stdout.write(`${JSON.stringify({ submissionId: manifest.submissionId, bundleHash: built.bundleHash, artifacts: built.bundle.artifacts.length })}\n`);

async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
function parseOptions(args) { if (args[0] === "--") args = args.slice(1); const value = {}; for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`); value[args[index].slice(2)] = args[index + 1]; } for (const name of ["manifest", "artifacts", "authority", "private-key", "output"]) if (!value[name]) throw new Error(`--${name} is required`); return value; }
