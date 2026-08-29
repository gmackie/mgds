import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

import { buildCampaignPlan, loadCampaignEvidence, readBoundedEvidenceFile, sealCampaignInputs } from "../packages/campaign/src/index.mjs";
import { verifyHostEvidenceEntries } from "../packages/release/src/host-attestation.mjs";
import { evaluateP2ReleaseGate } from "../packages/release/src/p2-gate.mjs";
import { sourceBoundReleaseInputs, verifyReleaseCheckout } from "../packages/release/src/source-checkout.mjs";

const execute = promisify(execFile);
const options = parseOptions(process.argv.slice(2));
const candidateBytes = await readFile(options.candidate);
const config = await readJson(options.config);
const sealed = await sealCampaignInputs({ config, readFile });
const campaignPlan = buildCampaignPlan({ config, ...sealed });
const [campaignRuns, evidenceIndex, hostEntries, review, reviewReportBytes, signing, evaluatorAuthorities, reviewerAuthorities, releaseAuthorities] = await Promise.all([
  readJson(options.runs),
  readJson(options.evidence),
  readJson(options.hosts),
  readJsonOr(options.review, { status: "pending", independent: false, findings: { critical: 0, high: 0, medium: 0, low: 0 } }),
  readBoundedEvidenceFile(options["review-report"], 16 * 1024 * 1024).catch(() => null),
  readJsonOr(options.signing, { status: "pending" }),
  readJson(options.evaluators),
  readJsonOr(options.reviewers, {}),
  readJsonOr(options["release-authorities"], {}),
]);
const releaseSourceDigest = process.env.MGDS_RELEASE_SOURCE_DIGEST ?? null;
let releaseSourceState = { headDigest: null, clean: false, trackedInputsVerified: false };
if (/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(releaseSourceDigest ?? "")) {
  try {
    releaseSourceState = await verifyReleaseCheckout({
      expectedSourceDigest: releaseSourceDigest,
      inputPaths: sourceBoundReleaseInputs({ options, config, evidenceIndex }),
      runGit,
    });
  } catch {
    releaseSourceState = { headDigest: null, clean: false, trackedInputsVerified: false };
  }
}
const evidenceBundles = await loadCampaignEvidence({ plan: campaignPlan, runs: campaignRuns, index: evidenceIndex, readEvidenceFile: readBoundedEvidenceFile });
const verifiedHostEvidence = releaseSourceState.clean
  ? await verifyHostEvidenceEntries({ entries: hostEntries, expectedSourceDigest: releaseSourceDigest, readFile, runGhVerify })
  : [];
const result = evaluateP2ReleaseGate({
  candidate: JSON.parse(candidateBytes),
  candidateHash: hash(candidateBytes),
  campaignPlan,
  campaignRuns,
  evidenceBundles,
  evaluatorAuthorities,
  trustedEvaluatorFingerprints: parseTrustMap("MGDS_TRUSTED_EVALUATOR_FINGERPRINTS"),
  verifiedHostEvidence,
  review,
  reviewReportHash: reviewReportBytes?.length > 0 ? hash(reviewReportBytes) : null,
  reviewerAuthorities,
  trustedReviewerFingerprints: parseTrustMap("MGDS_TRUSTED_REVIEWER_FINGERPRINTS"),
  signing,
  releaseAuthorities,
  trustedReleaseAuthorityFingerprint: process.env.MGDS_RELEASE_AUTHORITY_FINGERPRINT ?? null,
  releaseSourceDigest,
  releaseSourceState,
});
await mkdir(dirname(options.output), { recursive: true });
await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  version: result.version,
  status: result.status,
  blockers: result.blockers.map(({ code }) => code),
  evidence: result.evidence,
})}\n`);
if (result.status !== "ready") process.exitCode = 1;

async function runGhVerify(path, sourceDigest) {
  const { stdout } = await execute("gh", [
    "attestation", "verify", path,
    "--repo", "gmackie/mgds",
    "--signer-workflow", "gmackie/mgds/.github/workflows/conformance.yml",
    "--source-ref", "refs/heads/main",
    "--source-digest", sourceDigest,
    "--deny-self-hosted-runners",
    "--format", "json",
  ], { maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function runGit(args) {
  const { stdout } = await execute("git", args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonOr(path, fallback) {
  return readJson(path).catch(() => fallback);
}

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseTrustMap(name) {
  return process.env[name] ? JSON.parse(process.env[name]) : {};
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`);
    options[args[index].slice(2)] = args[index + 1];
  }
  for (const name of ["candidate", "config", "runs", "evidence", "hosts", "review", "review-report", "signing", "evaluators", "reviewers", "release-authorities", "output"]) {
    if (!options[name]) throw new Error(`--${name} is required`);
  }
  return options;
}
