import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { verifyHostEvidenceEntries } from "../src/host-attestation.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const sourceDigest = "a".repeat(40);
const artifact = Buffer.from(JSON.stringify({
  host: "macos-arm64",
  adapters: {
    fake: { status: "pass" },
    unity: { status: "pass" },
    gmacko: { status: "pass" },
    broken: { status: "fail" },
  },
}));

test("host evidence is derived from bytes and verified GitHub provenance output", async () => {
  const sha256 = digest(artifact);
  let verifiedSourceDigest;
  const result = await verifyHostEvidenceEntries({
    entries: [{ host: "macos-arm64", artifactPath: "download/macos.json" }],
    expectedSourceDigest: sourceDigest,
    readFile: async () => artifact,
    runGhVerify: async (_path, actualSourceDigest) => {
      verifiedSourceDigest = actualSourceDigest;
      return [{
      attestation: { bundle: "verified fixture" },
      verificationResult: { statement: { subject: [{ name: "macos-arm64.json", digest: { sha256 } }] } },
      }];
    },
  });

  assert.deepEqual(result[0], {
    host: "macos-arm64",
    status: "pass",
    artifactHash: `sha256:${sha256}`,
    attestationVerified: true,
    repository: "gmackie/mgds",
    workflowRef: "gmackie/mgds/.github/workflows/conformance.yml@refs/heads/main",
    subjectDigest: `sha256:${sha256}`,
    verificationDigest: `sha256:${digest(JSON.stringify({
      repository: "gmackie/mgds",
      workflowRef: "gmackie/mgds/.github/workflows/conformance.yml@refs/heads/main",
      sourceDigest,
      subjectDigest: `sha256:${sha256}`,
    }))}`,
    sourceDigest,
  });
  assert.equal(verifiedSourceDigest, sourceDigest);
  assert.equal("artifactPath" in result[0], false);
});

test("host mismatch, failing adapters, or absent matching subjects are rejected", async () => {
  const sha256 = digest(artifact);
  const verified = [{ attestation: {}, verificationResult: { statement: { subject: [{ digest: { sha256 } }] } } }];
  await assert.rejects(
    verifyHostEvidenceEntries({ entries: [{ host: "linux-x64", artifactPath: "x" }], expectedSourceDigest: sourceDigest, readFile: async () => artifact, runGhVerify: async () => verified }),
    /host mismatch/,
  );
  await assert.rejects(
    verifyHostEvidenceEntries({ entries: [{ host: "macos-arm64", artifactPath: "x" }], expectedSourceDigest: sourceDigest, readFile: async () => Buffer.from(JSON.stringify({ host: "macos-arm64", adapters: { fake: { status: "fail" } } })), runGhVerify: async () => verified }),
    /T0 adapter verdicts/,
  );
  await assert.rejects(
    verifyHostEvidenceEntries({ entries: [{ host: "macos-arm64", artifactPath: "x" }], expectedSourceDigest: sourceDigest, readFile: async () => artifact, runGhVerify: async () => [{ attestation: {}, verificationResult: { statement: { subject: [] } } }] }),
    /subject digest/,
  );
});

test("host verification requires a pinned release source digest", async () => {
  await assert.rejects(
    verifyHostEvidenceEntries({ entries: [], expectedSourceDigest: null, readFile: async () => artifact, runGhVerify: async () => [] }),
    /source digest required/,
  );
});

test("host provenance identity is stable across attestation order and signature envelopes", async () => {
  const sha256 = digest(artifact);
  const first = { attestation: { signature: "one" }, verificationResult: { statement: { subject: [{ digest: { sha256 } }] } } };
  const second = { attestation: { signature: "two" }, verificationResult: { statement: { subject: [{ digest: { sha256 } }] } } };
  const input = { entries: [{ host: "macos-arm64", artifactPath: "x" }], expectedSourceDigest: sourceDigest, readFile: async () => artifact };
  const left = await verifyHostEvidenceEntries({ ...input, runGhVerify: async () => [first, second] });
  const right = await verifyHostEvidenceEntries({ ...input, runGhVerify: async () => [second, first] });
  assert.deepEqual(left, right);
});
