import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readExternalPrivateKey } from "../packages/campaign-operator/src/index.mjs";
import { signP2ReviewApproval } from "../packages/release/src/p2-gate.mjs";

const options = parseOptions(process.argv.slice(2));
const [review, reportBytes] = await Promise.all([readJson(options.review), readFile(options.report)]);
const reportHash = digest(reportBytes);
if (reportBytes.length === 0 || review.reportHash !== reportHash) throw new Error("review report bytes do not match the approval");
if (review.status !== "approved" || review.independent !== true) throw new Error("only an explicit independent approval can be signed");
const privateKey = await readExternalPrivateKey({ path: options["private-key"], repositoryRoot: fileURLToPath(new URL("..", import.meta.url)) });
await writeJsonAtomic(options.output, signP2ReviewApproval(review, privateKey));

function digest(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
function parseOptions(args) { return requiredOptions(args, ["review", "report", "private-key", "output"]); }
function requiredOptions(args, names) { if (args[0] === "--") args = args.slice(1); const value = {}; for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`); value[args[index].slice(2)] = args[index + 1]; } for (const name of names) if (!value[name]) throw new Error(`--${name} is required`); return value; }
async function writeJsonAtomic(path, value) { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" }); await rename(temporary, path); }
