import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { aggregateCampaign, loadCampaignEvidence, readBoundedEvidenceFile } from "../packages/campaign/src/index.mjs";

const options = parseOptions(process.argv.slice(2));
const plan = JSON.parse(await readFile(options.plan, "utf8"));
const runs = JSON.parse(await readFile(options.runs, "utf8"));
const evaluatorAuthorities = JSON.parse(await readFile(options.evaluators, "utf8"));
const evidenceIndex = JSON.parse(await readFile(options.evidence, "utf8"));
const evidenceBundles = await loadCampaignEvidence({ plan, runs, index: evidenceIndex, readEvidenceFile: readBoundedEvidenceFile });
const trustedEvaluatorFingerprints = parseTrust("MGDS_TRUSTED_EVALUATOR_FINGERPRINTS");
const result = aggregateCampaign({ plan, runs, evaluatorAuthorities, trustedEvaluatorFingerprints, evidenceBundles });
await mkdir(dirname(options.output), { recursive: true });
await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ campaignId: result.campaignId, status: result.status, metrics: result.metrics, output: options.output })}\n`);
if (result.status !== "pass") process.exitCode = 1;

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`);
    options[args[index].slice(2)] = args[index + 1];
  }
  if (!options.plan || !options.runs || !options.evidence || !options.evaluators || !options.output) throw new Error("--plan, --runs, --evidence, --evaluators, and --output are required");
  return options;
}

function parseTrust(name) {
  return process.env[name] ? JSON.parse(process.env[name]) : {};
}
