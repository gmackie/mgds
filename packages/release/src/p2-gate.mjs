import { createHash, createPublicKey, sign, verify } from "node:crypto";

import { canonical } from "@mgds/attestation";
import { aggregateCampaign } from "@mgds/campaign";

const HASH = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_HOSTS = ["linux-x64", "macos-arm64", "windows-x64"];
const REQUIRED_HARNESSES = ["claude-code", "codex"];
const REQUIRED_SEEDS = [1337, 7331, 424242];
const REQUIRED_REPETITIONS = [1, 2, 3, 4, 5];
const EXPECTED_CAMPAIGN = "mgds.campaign.p2@0.1.0";
const EXPECTED_TASK = "mgds.golden-arena.key-exit@0.1.0";
const EXPECTED_RUNS = 90;
const WORKFLOW_REF = "gmackie/mgds/.github/workflows/conformance.yml@refs/heads/main";
const SOURCE_DIGEST = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const REQUIRED_EVIDENCE = ["compile", "event-ledger", "player-build", "screenshot", "tests"];
const EMPTY_SHA256 = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function evaluateP2ReleaseGate(input) {
  const {
    candidate,
    candidateHash,
    campaignPlan,
    campaignRuns,
    evidenceBundles = new Map(),
    evaluatorAuthorities = {},
    trustedEvaluatorFingerprints = {},
    verifiedHostEvidence,
    review,
    reviewReportHash,
    reviewerAuthorities = {},
    trustedReviewerFingerprints = {},
    signing,
    releaseAuthorities = {},
    trustedReleaseAuthorityFingerprint,
    releaseSourceDigest,
    releaseSourceState,
  } = input;
  const blockers = [];

  if (candidate?.status !== "candidate" || !/^0\.1\.0-preview\.[1-9][0-9]*$/.test(candidate?.version ?? "") || !HASH.test(candidateHash ?? "")) {
    block("CANDIDATE_INVALID", "Candidate identity or content hash is invalid.");
  }

  let campaignResult;
  try {
    campaignResult = aggregateCampaign({
      plan: campaignPlan,
      runs: campaignRuns,
      evaluatorAuthorities,
      trustedEvaluatorFingerprints,
      evidenceBundles,
    });
  } catch (error) {
    campaignResult = { campaignId: null, status: "invalid", metrics: { recordedRuns: 0 }, failures: [error.message] };
  }
  if (
    !validP2Plan(campaignPlan)
    || campaignResult.campaignId !== EXPECTED_CAMPAIGN
    || campaignResult.status !== "pass"
    || campaignResult.metrics?.expectedRuns !== EXPECTED_RUNS
    || campaignResult.metrics?.recordedRuns !== EXPECTED_RUNS
    || campaignResult.metrics?.validRuns !== EXPECTED_RUNS
    || campaignResult.metrics?.missingRuns !== 0
    || campaignResult.failures?.length !== 0
  ) block("CAMPAIGN_NOT_PASS", "The exact sealed 90-run P2 campaign has not passed.");

  if (!SOURCE_DIGEST.test(releaseSourceDigest ?? "")) {
    block("SOURCE_DIGEST_MISSING", "An exact release source commit digest is required.");
  }
  if (
    releaseSourceState?.headDigest !== releaseSourceDigest
    || releaseSourceState?.clean !== true
    || releaseSourceState?.trackedInputsVerified !== true
  ) block("SOURCE_CHECKOUT_MISMATCH", "Release inputs are not proven to come from a clean checkout of the exact source commit.");

  if (!Array.isArray(verifiedHostEvidence) || verifiedHostEvidence.length === 0) {
    block("HOST_EVIDENCE_MISSING", "No cryptographically verified host evidence was supplied.");
  } else if (!validHostEvidence(verifiedHostEvidence, releaseSourceDigest)) {
    block("HOST_EVIDENCE_INVALID", "Exactly one verified GitHub provenance subject is required for every target host.");
  }

  const reviewTarget = buildP2ReviewTarget({
    candidateHash,
    releaseSourceDigest,
    campaignPlan,
    campaignRuns,
    campaignResult,
    verifiedHostEvidence: Array.isArray(verifiedHostEvidence) ? verifiedHostEvidence : [],
    trustedEvaluatorFingerprints,
  });
  if (review?.status === "approved" && (!HASH.test(reviewReportHash ?? "") || reviewReportHash === EMPTY_SHA256)) {
    block("INDEPENDENT_REVIEW_REPORT_INVALID", "An approved independent review requires a non-empty report.");
  }
  if (!validFindingCounts(review?.findings)) {
    block("INDEPENDENT_REVIEW_INVALID", "Review finding counts must be non-negative integers.");
  } else if (review?.status !== "approved" || review.independent !== true || review.reportHash !== reviewReportHash || !HASH.test(reviewReportHash ?? "")) {
    block("INDEPENDENT_REVIEW_NOT_APPROVED", "An independent review over the exact report bytes is required.");
  } else {
    if (review.findings.critical > 0 || review.findings.high > 0) {
      block("INDEPENDENT_REVIEW_HAS_SEVERE_FINDINGS", "Critical and high findings must be zero.");
    }
    if (review.targetHash !== reviewTarget.hash) {
      block("INDEPENDENT_REVIEW_TARGET_INVALID", "The independent review does not bind the exact release target.");
    }
    if (!validReviewSignature({ review, reviewerAuthorities, trustedReviewerFingerprints })) {
      block("INDEPENDENT_REVIEW_SIGNATURE_INVALID", "Review approval is not signed by an externally pinned reviewer.");
    }
  }

  const releaseAuthority = releaseAuthorities?.[signing?.authority ?? "mgds-release-authority"];
  const actualReleaseFingerprint = publicKeyFingerprint(releaseAuthority?.publicKey);
  const releaseAuthorityTrusted = HASH.test(trustedReleaseAuthorityFingerprint ?? "")
    && actualReleaseFingerprint === trustedReleaseAuthorityFingerprint;
  if (!releaseAuthorityTrusted) {
    block("RELEASE_AUTHORITY_UNTRUSTED", "The release authority does not match the out-of-band trust anchor.");
  }

  const subject = buildP2ReleaseSubject({
    candidateHash,
    releaseSourceDigest,
    campaignPlan,
    campaignRuns,
    campaignResult,
    verifiedHostEvidence: Array.isArray(verifiedHostEvidence) ? verifiedHostEvidence : [],
    reviewReportHash,
    reviewTargetHash: reviewTarget.hash,
    review,
    trustedEvaluatorFingerprints,
    trustedReviewerFingerprints,
    trustedReleaseAuthorityFingerprint,
  });
  if (signing?.status !== "signed") {
    block("RELEASE_NOT_SIGNED", "The release authority has not signed the complete release subject.");
  } else if (!validReleaseSignature({ signing, subjectHash: subject.hash, releaseAuthority })) {
    block("RELEASE_SIGNATURE_INVALID", "The signature does not bind the exact candidate, campaign, host, review, and trust inputs.");
  }

  return {
    version: candidate?.version ?? null,
    status: blockers.length === 0 ? "ready" : "blocked",
    blockers,
    evidence: {
      campaignRuns: Number.isInteger(campaignResult.metrics?.recordedRuns) ? campaignResult.metrics.recordedRuns : 0,
      hosts: Array.isArray(verifiedHostEvidence) ? [...new Set(verifiedHostEvidence.map(({ host }) => host))].sort() : [],
      candidateHash: HASH.test(candidateHash ?? "") ? candidateHash : null,
      sourceDigest: SOURCE_DIGEST.test(releaseSourceDigest ?? "") ? releaseSourceDigest : null,
      reviewTargetHash: reviewTarget.hash,
      releaseSubjectHash: subject.hash,
    },
    campaignResult,
  };

  function block(code, message) {
    blockers.push({ code, message });
  }
}

export function buildP2ReleaseSubject({
  candidateHash,
  releaseSourceDigest,
  campaignPlan,
  campaignRuns,
  campaignResult,
  verifiedHostEvidence,
  reviewReportHash,
  reviewTargetHash,
  review,
  trustedEvaluatorFingerprints,
  trustedReviewerFingerprints,
  trustedReleaseAuthorityFingerprint,
}) {
  const hosts = [...(verifiedHostEvidence ?? [])]
    .map(({ host, artifactHash, repository, workflowRef, subjectDigest, verificationDigest, sourceDigest }) => ({
      host, artifactHash, repository, workflowRef, subjectDigest, verificationDigest, sourceDigest,
    }))
    .sort((left, right) => left.host.localeCompare(right.host));
  const runs = [...(campaignRuns ?? [])].sort((left, right) => String(left?.slotId).localeCompare(String(right?.slotId)));
  const evidenceIdentities = runs.map(({ slotId, evidenceHash }) => ({ slotId, evidenceHash }));
  const manifest = {
    schema: "mgds.p2-release-subject/v1",
    candidateHash: HASH.test(candidateHash ?? "") ? candidateHash : null,
    sourceDigest: SOURCE_DIGEST.test(releaseSourceDigest ?? "") ? releaseSourceDigest : null,
    campaignPlanHash: digest(canonical(campaignPlan ?? null)),
    campaignRunSetHash: digest(canonical(runs)),
    campaignEvidenceSetHash: digest(canonical(evidenceIdentities)),
    campaignResultHash: digest(canonical(campaignResult ?? null)),
    hostEvidenceHash: digest(canonical(hosts)),
    reviewReportHash: HASH.test(reviewReportHash ?? "") ? reviewReportHash : null,
    reviewTargetHash: HASH.test(reviewTargetHash ?? "") ? reviewTargetHash : null,
    reviewApprovalHash: digest(canonical(review ?? null)),
    evaluatorTrustHash: digest(canonical(trustedEvaluatorFingerprints ?? {})),
    reviewerTrustHash: digest(canonical(trustedReviewerFingerprints ?? {})),
    releaseAuthorityFingerprint: HASH.test(trustedReleaseAuthorityFingerprint ?? "") ? trustedReleaseAuthorityFingerprint : null,
  };
  return { manifest, hash: digest(canonical(manifest)) };
}

export function buildP2ReviewTarget({
  candidateHash,
  releaseSourceDigest,
  campaignPlan,
  campaignRuns,
  campaignResult,
  verifiedHostEvidence,
  trustedEvaluatorFingerprints,
}) {
  const hosts = normalizedHosts(verifiedHostEvidence);
  const runs = normalizedRuns(campaignRuns);
  const manifest = {
    schema: "mgds.p2-review-target/v1",
    candidateHash: HASH.test(candidateHash ?? "") ? candidateHash : null,
    sourceDigest: SOURCE_DIGEST.test(releaseSourceDigest ?? "") ? releaseSourceDigest : null,
    campaignPlanHash: digest(canonical(campaignPlan ?? null)),
    campaignRunSetHash: digest(canonical(runs)),
    campaignEvidenceSetHash: digest(canonical(runs.map(({ slotId, evidenceHash }) => ({ slotId, evidenceHash })))),
    campaignResultHash: digest(canonical(campaignResult ?? null)),
    hostEvidenceHash: digest(canonical(hosts)),
    evaluatorTrustHash: digest(canonical(trustedEvaluatorFingerprints ?? {})),
  };
  return { manifest, hash: digest(canonical(manifest)) };
}

export function buildP2ReviewApprovalPayload(review) {
  return {
    status: review.status,
    independent: review.independent,
    findings: review.findings,
    reportHash: review.reportHash,
    targetHash: review.targetHash,
    reviewerId: review.reviewer.id,
  };
}

export function signP2ReviewApproval(review, privateKey) {
  if (!privateKey) throw new Error("reviewer private key is required");
  const value = structuredClone(review);
  return {
    ...value,
    signature: sign(null, Buffer.from(canonical(buildP2ReviewApprovalPayload(value))), privateKey).toString("base64url"),
  };
}

export function signP2ReleaseSubject(subjectHash, privateKey) {
  if (!HASH.test(subjectHash ?? "") || !privateKey) throw new Error("release subject hash and private key are required");
  return {
    status: "signed",
    authority: "mgds-release-authority",
    algorithm: "Ed25519",
    subjectHash,
    signature: sign(null, Buffer.from(subjectHash), privateKey).toString("base64url"),
  };
}

function validP2Plan(plan) {
  if (
    plan?.campaignId !== EXPECTED_CAMPAIGN
    || plan.soakMinutes !== 240
    || plan.thresholds?.seedAgreement !== 1
    || plan.thresholds?.t0PassRate !== 1
    || plan.thresholds?.orphanProcesses !== 0
    || plan.thresholds?.unknownWorkspaceStates !== 0
    || !Array.isArray(plan.slots)
    || plan.slots.length !== EXPECTED_RUNS
  ) return false;

  const expectedSlots = new Set();
  for (const host of REQUIRED_HOSTS) {
    for (const harness of REQUIRED_HARNESSES) {
      for (const seed of REQUIRED_SEEDS) {
        for (const repetition of REQUIRED_REPETITIONS) {
          expectedSlots.add([EXPECTED_TASK, host, harness, seed, repetition].join("::"));
        }
      }
    }
  }
  const environmentHashes = new Map();
  for (const slot of plan.slots) {
    if (
      slot?.campaignId !== EXPECTED_CAMPAIGN
      || slot.taskId !== EXPECTED_TASK
      || slot.slotId !== [slot.taskId, slot.host, slot.harness, slot.seed, slot.repetition].join("::")
      || !expectedSlots.delete(slot.slotId)
      || !HASH.test(slot.taskHash ?? "")
      || !HASH.test(slot.budgetHash ?? "")
      || !HASH.test(slot.environmentHash ?? "")
      || canonical([...(slot.requiredEvidence ?? [])].sort()) !== canonical(REQUIRED_EVIDENCE)
      || slot.buildTarget !== "desktop"
    ) return false;
    const previous = environmentHashes.get(slot.host);
    if (previous && previous !== slot.environmentHash) return false;
    environmentHashes.set(slot.host, slot.environmentHash);
  }
  const taskHashes = new Set(plan.slots.map(({ taskHash, budgetHash }) => `${taskHash}:${budgetHash}`));
  return expectedSlots.size === 0 && environmentHashes.size === REQUIRED_HOSTS.length && taskHashes.size === 1;
}

function validHostEvidence(evidence, releaseSourceDigest) {
  if (evidence.length !== REQUIRED_HOSTS.length) return false;
  const hosts = evidence.map(({ host }) => host);
  if (new Set(hosts).size !== REQUIRED_HOSTS.length || !REQUIRED_HOSTS.every((host) => hosts.includes(host))) return false;
  return evidence.every((item) => item.status === "pass"
    && HASH.test(item.artifactHash ?? "")
    && item.attestationVerified === true
    && item.repository === "gmackie/mgds"
    && item.workflowRef === WORKFLOW_REF
    && item.sourceDigest === releaseSourceDigest
    && item.subjectDigest === item.artifactHash
    && HASH.test(item.verificationDigest ?? ""));
}

function validFindingCounts(findings) {
  return ["critical", "high", "medium", "low"].every((key) => Number.isInteger(findings?.[key]) && findings[key] >= 0);
}

function validReviewSignature({ review, reviewerAuthorities, trustedReviewerFingerprints }) {
  try {
    const reviewerId = review.reviewer?.id;
    const authority = reviewerAuthorities?.[reviewerId];
    const publicKey = createPublicKey(authority?.publicKey);
    const payload = buildP2ReviewApprovalPayload(review);
    if (
      authority?.algorithm !== "Ed25519"
      || review.reviewer?.algorithm !== "Ed25519"
      || publicKeyFingerprint(authority.publicKey) !== trustedReviewerFingerprints?.[reviewerId]
      || !/^[A-Za-z0-9_-]+$/.test(review.signature ?? "")
    ) return false;
    return verify(null, Buffer.from(canonical(payload)), publicKey, Buffer.from(review.signature, "base64url"));
  } catch {
    return false;
  }
}

function normalizedRuns(campaignRuns) {
  return [...(campaignRuns ?? [])].sort((left, right) => String(left?.slotId).localeCompare(String(right?.slotId)));
}

function normalizedHosts(verifiedHostEvidence) {
  return [...(verifiedHostEvidence ?? [])]
    .map(({ host, artifactHash, repository, workflowRef, subjectDigest, verificationDigest, sourceDigest }) => ({
      host, artifactHash, repository, workflowRef, subjectDigest, verificationDigest, sourceDigest,
    }))
    .sort((left, right) => left.host.localeCompare(right.host));
}

function validReleaseSignature({ signing, subjectHash, releaseAuthority }) {
  try {
    if (
      signing.authority !== "mgds-release-authority"
      || signing.algorithm !== "Ed25519"
      || releaseAuthority?.algorithm !== "Ed25519"
      || signing.subjectHash !== subjectHash
      || !/^[A-Za-z0-9_-]+$/.test(signing.signature ?? "")
    ) return false;
    return verify(null, Buffer.from(subjectHash), createPublicKey(releaseAuthority.publicKey), Buffer.from(signing.signature, "base64url"));
  } catch {
    return false;
  }
}

function publicKeyFingerprint(value) {
  try {
    return digest(createPublicKey(value).export({ type: "spki", format: "der" }));
  } catch {
    return null;
  }
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
