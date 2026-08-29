import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { canonical } from "../../attestation/src/index.mjs";
import { aggregateCampaign, buildCampaignPlan } from "../../campaign/src/index.mjs";
import { buildP2ReleaseSubject, buildP2ReviewTarget, evaluateP2ReleaseGate } from "../src/p2-gate.mjs";

const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const fingerprint = (key) => digest(key.export({ type: "spki", format: "der" }));
const candidate = { version: "0.1.0-preview.1", status: "candidate" };
const candidateHash = digest("candidate bytes");
const releaseSourceDigest = "a".repeat(40);

const evaluatorId = "mgds.evaluator.key-exit@0.1.0";
const evaluatorKeys = generateKeyPairSync("ed25519");
const evaluatorAuthorities = {
  [evaluatorId]: { algorithm: "Ed25519", publicKey: evaluatorKeys.publicKey.export({ type: "spki", format: "pem" }) },
};
const trustedEvaluatorFingerprints = { [evaluatorId]: fingerprint(evaluatorKeys.publicKey) };

const reviewerId = "mgds.reviewer.independent-lab@0.1.0";
const reviewerKeys = generateKeyPairSync("ed25519");
const reviewerAuthorities = {
  [reviewerId]: { algorithm: "Ed25519", publicKey: reviewerKeys.publicKey.export({ type: "spki", format: "pem" }) },
};
const trustedReviewerFingerprints = { [reviewerId]: fingerprint(reviewerKeys.publicKey) };

const releaseKeys = generateKeyPairSync("ed25519");
const releaseAuthorities = {
  "mgds-release-authority": { algorithm: "Ed25519", publicKey: releaseKeys.publicKey.export({ type: "spki", format: "pem" }) },
};
const trustedReleaseAuthorityFingerprint = fingerprint(releaseKeys.publicKey);

const config = {
  id: "mgds.campaign.p2@0.1.0",
  harnesses: ["codex", "claude-code"],
  hosts: ["macos-arm64", "linux-x64", "windows-x64"],
  seeds: [1337, 7331, 424242],
  repeatRuns: 5,
  soakMinutes: 240,
  thresholds: { seedAgreement: 1, t0PassRate: 1, orphanProcesses: 0, unknownWorkspaceStates: 0 },
};
const requiredEvidence = ["compile", "tests", "event-ledger", "screenshot", "player-build"];
const task = { id: "mgds.golden-arena.key-exit@0.1.0", hash: digest("task"), budgetHash: digest("budget"), evidence: requiredEvidence, buildTarget: "desktop" };
const environments = Object.fromEntries(config.hosts.map((host) => [host, digest(host)]));
const campaignPlan = buildCampaignPlan({ config, tasks: [task], environments });
const evidenceBundles = new Map();
const campaignRuns = campaignPlan.slots.map(signRun);

const verifiedHostEvidence = ["macos-arm64", "linux-x64", "windows-x64"].map((host, index) => ({
  host,
  status: "pass",
  artifactHash: digest(`host:${host}`),
  attestationVerified: true,
  repository: "gmackie/mgds",
  workflowRef: "gmackie/mgds/.github/workflows/conformance.yml@refs/heads/main",
  subjectDigest: digest(`host:${host}`),
  verificationDigest: digest(`attestation:${index + 1}`),
  sourceDigest: releaseSourceDigest,
}));

const campaignResult = aggregateCampaign({ plan: campaignPlan, runs: campaignRuns, evaluatorAuthorities, trustedEvaluatorFingerprints, evidenceBundles });
const reviewReportHash = digest("independent review report bytes");
const reviewTarget = buildP2ReviewTarget({
  candidateHash,
  releaseSourceDigest,
  campaignPlan,
  campaignRuns,
  campaignResult,
  verifiedHostEvidence,
  trustedEvaluatorFingerprints,
});
const reviewBase = {
  status: "approved",
  independent: true,
  findings: { critical: 0, high: 0, medium: 1, low: 2 },
  reportHash: reviewReportHash,
  targetHash: reviewTarget.hash,
  reviewer: { id: reviewerId, algorithm: "Ed25519" },
};
const review = {
  ...reviewBase,
  signature: sign(null, Buffer.from(canonical(reviewPayload(reviewBase))), reviewerKeys.privateKey).toString("base64url"),
};

const subject = buildP2ReleaseSubject({
  candidateHash,
  releaseSourceDigest,
  campaignPlan,
  campaignRuns,
  campaignResult,
  verifiedHostEvidence,
  reviewReportHash,
  reviewTargetHash: reviewTarget.hash,
  review,
  trustedEvaluatorFingerprints,
  trustedReviewerFingerprints,
  trustedReleaseAuthorityFingerprint,
});
const signing = {
  status: "signed",
  authority: "mgds-release-authority",
  algorithm: "Ed25519",
  subjectHash: subject.hash,
  signature: sign(null, Buffer.from(subject.hash), releaseKeys.privateKey).toString("base64url"),
};

function signRun(slot) {
  const base = {
    ...slot,
    runId: `run_${digest(slot.slotId).slice(7, 27)}`,
    model: slot.harness === "codex" ? "gpt-test" : "claude-test",
    verdict: "valid",
    workspaceState: "known-clean",
    orphanProcesses: 0,
    privateAffordances: false,
    durationMinutes: slot.repetition === 1 ? 240 : 45,
    soak: slot.repetition === 1,
    evaluator: { id: evaluatorId, digest: digest("evaluator bytes"), authority: "independent-evaluator" },
  };
  const evidence = evidenceBundle(base);
  const evidenceHash = digest(evidence);
  evidenceBundles.set(evidenceHash, evidence);
  const run = { ...base, evidenceHash };
  const payload = {
    slotId: run.slotId,
    campaignId: run.campaignId,
    taskId: run.taskId,
    taskHash: run.taskHash,
    budgetHash: run.budgetHash,
    environmentHash: run.environmentHash,
    requiredEvidence: run.requiredEvidence,
    buildTarget: run.buildTarget,
    host: run.host,
    harness: run.harness,
    seed: run.seed,
    repetition: run.repetition,
    runId: run.runId,
    model: run.model,
    evidenceHash: run.evidenceHash,
    verdict: run.verdict,
    workspaceState: run.workspaceState,
    orphanProcesses: run.orphanProcesses,
    privateAffordances: run.privateAffordances,
    durationMinutes: run.durationMinutes,
    soak: run.soak,
    evaluatorId: run.evaluator.id,
    evaluatorDigest: run.evaluator.digest,
  };
  return {
    ...run,
    evidenceAttestation: {
      algorithm: "Ed25519",
      authority: evaluatorId,
      payload,
      signature: sign(null, Buffer.from(canonical(payload)), evaluatorKeys.privateKey).toString("base64url"),
    },
  };
}

function evidenceBundle(run) {
  const body = {
    sequence: 1,
    previousHash: "0".repeat(64),
    event: { type: "run.completed", runId: run.runId, slotId: run.slotId },
  };
  const headHash = digest(canonical(body)).slice(7);
  return Buffer.from(JSON.stringify({
    schema: "mgds.campaign-evidence/v1",
    runId: run.runId,
    slotId: run.slotId,
    events: [{ ...body, hash: headHash }],
    artifacts: requiredEvidence.map((role) => {
      const artifactBytes = evidenceArtifactBytes(role, run, headHash);
      return { role, hash: digest(artifactBytes), bytesBase64: artifactBytes.toString("base64") };
    }),
    privacy: { classification: "public-redacted", redactionVersion: "mgds.redaction/v1" },
    replayStatus: "verified",
  }));
}

function evidenceArtifactBytes(role, run, headHash) {
  if (role === "screenshot") {
    return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  }
  const values = {
    compile: { schema: "mgds.compile-report/v1", status: "pass", diagnostics: [] },
    tests: { schema: "mgds.test-report/v1", status: "pass", passed: 1, failed: 0 },
    "event-ledger": { schema: "mgds.event-ledger-evidence/v1", headHash, entries: 1 },
    "player-build": playerBuildReport(run),
  };
  return Buffer.from(canonical(values[role]));
}

function playerBuildReport(run) {
  const bytes = Buffer.from(`player-binary:${run.slotId}`);
  const files = [{ name: "Game/player.bin", hash: digest(bytes), bytesBase64: bytes.toString("base64") }];
  return { schema: "mgds.player-build/v1", status: "pass", buildTarget: "desktop", artifactHash: digest(canonical(files.map(({ name, hash: fileHash }) => ({ name, hash: fileHash })))), files };
}

function reviewPayload(value) {
  return {
    status: value.status,
    independent: value.independent,
    findings: value.findings,
    reportHash: value.reportHash,
    targetHash: value.targetHash,
    reviewerId: value.reviewer.id,
  };
}

function readyInput(overrides = {}) {
  return {
    candidate,
    candidateHash,
    campaignPlan,
    campaignRuns,
    evidenceBundles,
    evaluatorAuthorities,
    trustedEvaluatorFingerprints,
    verifiedHostEvidence,
    review,
    reviewReportHash,
    reviewerAuthorities,
    trustedReviewerFingerprints,
    signing,
    releaseAuthorities,
    trustedReleaseAuthorityFingerprint,
    releaseSourceDigest,
    releaseSourceState: { headDigest: releaseSourceDigest, clean: true, trackedInputsVerified: true },
    ...overrides,
  };
}

test("P2 recomputes and accepts only the complete sealed campaign", () => {
  const ready = evaluateP2ReleaseGate(readyInput());
  assert.equal(ready.status, "ready");
  assert.equal(ready.evidence.campaignRuns, 90);

  const oneRun = evaluateP2ReleaseGate(readyInput({ campaignRuns: campaignRuns.slice(0, 1) }));
  assert.equal(oneRun.status, "blocked");
  assert.match(oneRun.blockers.map(({ code }) => code).join("\n"), /CAMPAIGN_NOT_PASS/);
});

test("P2 rejects a 90-run lookalike with nonstandard matrix dimensions", () => {
  const counterfeitConfig = { ...config, hosts: ["macos-arm64", "linux-x64", "freebsd-x64"] };
  const counterfeitEnvironments = Object.fromEntries(counterfeitConfig.hosts.map((host) => [host, digest(host)]));
  const counterfeitPlan = buildCampaignPlan({ config: counterfeitConfig, tasks: [task], environments: counterfeitEnvironments });
  const counterfeitRuns = counterfeitPlan.slots.map(signRun);
  const result = evaluateP2ReleaseGate(readyInput({ campaignPlan: counterfeitPlan, campaignRuns: counterfeitRuns }));

  assert.equal(result.status, "blocked");
  assert.match(result.blockers.map(({ code }) => code).join("\n"), /CAMPAIGN_NOT_PASS/);
});

test("invented attestation URLs cannot substitute for verified host provenance", () => {
  const invented = verifiedHostEvidence.map(({ host, artifactHash }, index) => ({
    host,
    status: "pass",
    artifactHash,
    attestationUrl: `https://github.com/gmackie/mgds/attestations/${index + 1}`,
  }));
  const result = evaluateP2ReleaseGate(readyInput({ verifiedHostEvidence: invented }));
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.map(({ code }) => code).join("\n"), /HOST_EVIDENCE_INVALID/);
});

test("review approval is content-addressed and signed by an externally pinned reviewer", () => {
  const tampered = { ...review, findings: { ...review.findings, high: 1 } };
  const result = evaluateP2ReleaseGate(readyInput({ review: tampered }));
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.map(({ code }) => code).join("\n"), /INDEPENDENT_REVIEW_HAS_SEVERE_FINDINGS/);
  assert.match(result.blockers.map(({ code }) => code).join("\n"), /INDEPENDENT_REVIEW_SIGNATURE_INVALID/);
});

test("an absent or zero-byte independent review report cannot be approved", () => {
  const emptyReportHash = digest(Buffer.alloc(0));
  const emptyBase = { ...reviewBase, reportHash: emptyReportHash };
  const emptyReview = { ...emptyBase, signature: sign(null, Buffer.from(canonical(reviewPayload(emptyBase))), reviewerKeys.privateKey).toString("base64url") };
  const result = evaluateP2ReleaseGate(readyInput({ review: emptyReview, reviewReportHash: emptyReportHash }));
  assert.match(result.blockers.map(({ code }) => code).join("\n"), /INDEPENDENT_REVIEW_REPORT_INVALID/);
});

test("review approval cannot be replayed onto a different candidate or source commit", () => {
  const changedCandidate = evaluateP2ReleaseGate(readyInput({ candidateHash: digest("different candidate bytes") }));
  assert.match(changedCandidate.blockers.map(({ code }) => code).join("\n"), /INDEPENDENT_REVIEW_TARGET_INVALID/);

  const changedSource = evaluateP2ReleaseGate(readyInput({
    releaseSourceDigest: "b".repeat(40),
    releaseSourceState: { headDigest: "b".repeat(40), clean: true, trackedInputsVerified: true },
    verifiedHostEvidence: verifiedHostEvidence.map((item) => ({ ...item, sourceDigest: "b".repeat(40) })),
  }));
  assert.match(changedSource.blockers.map(({ code }) => code).join("\n"), /INDEPENDENT_REVIEW_TARGET_INVALID/);
});

test("the release gate rejects a dirty or mismatched source checkout", () => {
  const dirty = evaluateP2ReleaseGate(readyInput({ releaseSourceState: { headDigest: releaseSourceDigest, clean: false, trackedInputsVerified: true } }));
  assert.match(dirty.blockers.map(({ code }) => code).join("\n"), /SOURCE_CHECKOUT_MISMATCH/);
  const mismatched = evaluateP2ReleaseGate(readyInput({ releaseSourceState: { headDigest: "b".repeat(40), clean: true, trackedInputsVerified: true } }));
  assert.match(mismatched.blockers.map(({ code }) => code).join("\n"), /SOURCE_CHECKOUT_MISMATCH/);
});

test("release signature binds all evidence and an out-of-band authority fingerprint", () => {
  const swappedHosts = verifiedHostEvidence.map((item, index) => index === 0 ? { ...item, artifactHash: digest("swapped"), subjectDigest: digest("swapped") } : item);
  const swapped = evaluateP2ReleaseGate(readyInput({ verifiedHostEvidence: swappedHosts }));
  assert.equal(swapped.status, "blocked");
  assert.match(swapped.blockers.map(({ code }) => code).join("\n"), /RELEASE_SIGNATURE_INVALID/);

  const swappedRoot = evaluateP2ReleaseGate(readyInput({ trustedReleaseAuthorityFingerprint: digest("different root") }));
  assert.equal(swappedRoot.status, "blocked");
  assert.match(swappedRoot.blockers.map(({ code }) => code).join("\n"), /RELEASE_AUTHORITY_UNTRUSTED/);

  const alternateReviewBase = { ...reviewBase, findings: { ...reviewBase.findings, medium: 2 } };
  const alternateReview = {
    ...alternateReviewBase,
    signature: sign(null, Buffer.from(canonical(reviewPayload(alternateReviewBase))), reviewerKeys.privateKey).toString("base64url"),
  };
  const swappedReview = evaluateP2ReleaseGate(readyInput({ review: alternateReview }));
  assert.equal(swappedReview.status, "blocked");
  assert.match(swappedReview.blockers.map(({ code }) => code).join("\n"), /RELEASE_SIGNATURE_INVALID/);
});

test("release subject binds the exact plan, signed run set, evidence identities, and source commit", () => {
  const common = {
    candidateHash,
    releaseSourceDigest,
    campaignPlan,
    campaignRuns,
    campaignResult,
    verifiedHostEvidence,
    reviewReportHash,
    review,
    trustedEvaluatorFingerprints,
    trustedReviewerFingerprints,
    trustedReleaseAuthorityFingerprint,
  };
  const changedRun = campaignRuns.map((run, index) => index === 0
    ? { ...run, evidenceAttestation: { ...run.evidenceAttestation, signature: `${run.evidenceAttestation.signature}x` } }
    : run);
  const changedPlan = { ...campaignPlan, soakMinutes: 241 };

  assert.notEqual(buildP2ReleaseSubject(common).hash, buildP2ReleaseSubject({ ...common, campaignRuns: changedRun }).hash);
  assert.notEqual(buildP2ReleaseSubject(common).hash, buildP2ReleaseSubject({ ...common, campaignPlan: changedPlan }).hash);
  assert.notEqual(buildP2ReleaseSubject(common).hash, buildP2ReleaseSubject({ ...common, releaseSourceDigest: "b".repeat(40) }).hash);
});

test("pending external inputs remain explicit blockers", () => {
  const result = evaluateP2ReleaseGate(readyInput({
    campaignRuns: [],
    verifiedHostEvidence: [],
    review: { status: "pending", independent: false, findings: { critical: 0, high: 0, medium: 0, low: 0 } },
    reviewReportHash: null,
    signing: { status: "pending" },
    trustedReleaseAuthorityFingerprint: null,
    releaseSourceDigest: null,
    releaseSourceState: { headDigest: null, clean: false, trackedInputsVerified: false },
  }));
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers.map(({ code }) => code), [
    "CAMPAIGN_NOT_PASS",
    "SOURCE_DIGEST_MISSING",
    "SOURCE_CHECKOUT_MISMATCH",
    "HOST_EVIDENCE_MISSING",
    "INDEPENDENT_REVIEW_NOT_APPROVED",
    "RELEASE_AUTHORITY_UNTRUSTED",
    "RELEASE_NOT_SIGNED",
  ]);
});
