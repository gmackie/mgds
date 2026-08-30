import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { buildP3Submission, verifyP3Submission } from "../src/index.mjs";

const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const keys = generateKeyPairSync("ed25519");
const manifest = {
  schema: "mgds.p3-submission/v1",
  submissionId: "mgds.submission.external-studio@0.1.0",
  protocolVersion: "0.1.0-preview.1",
  adapter: { id: "mgds.adapter.external@0.1.0", sourceRevision: "a".repeat(40) },
  toolchain: { unity: "6000.3.9f1" },
  host: "linux-x64",
  t0: { status: "pass", reportHash: digest("t0") },
  tasks: [{ taskId: "mgds.golden-arena.key-exit@0.1.0", status: "pass", evidenceHash: digest("evidence") }],
  eventLedgerHead: "b".repeat(64),
  evaluator: { id: "mgds.evaluator.external@0.1.0", digest: digest("evaluator") },
  privacy: { classification: "public-redacted", redactionVersion: "mgds.redaction/v1" },
};
const artifacts = {
  "reports/t0.json": Buffer.from('{"status":"pass"}'),
  "evidence/key-exit.json": Buffer.from('{"replayStatus":"verified"}'),
};

test("P3 submissions are portable, signed, and independently replayable", () => {
  const built = buildP3Submission({ manifest, artifacts, authority: "mgds.submitter.external@0.1.0", privateKey: keys.privateKey });
  assert.equal(built.bundle.schema, "mgds.p3-bundle/v1");
  assert.equal(built.bundleHash, digest(built.bytes));
  assert.deepEqual(built.bundle.artifacts.map(({ path }) => path), ["evidence/key-exit.json", "reports/t0.json"]);
  assert.deepEqual(verifyP3Submission({ bytes: built.bytes, publicKey: keys.publicKey }), {
    status: "verified",
    submissionId: manifest.submissionId,
    bundleHash: built.bundleHash,
    artifacts: 2,
  });
});

test("P3 replay rejects traversal, byte tampering, manifest drift, and private data", () => {
  assert.throws(() => buildP3Submission({ manifest, artifacts: { "../secret": Buffer.from("x") }, authority: "mgds.submitter.external@0.1.0", privateKey: keys.privateKey }), /portable artifact path/);
  assert.throws(() => buildP3Submission({ manifest: { ...manifest, operatorPath: "/Users/alice" }, artifacts, authority: "mgds.submitter.external@0.1.0", privateKey: keys.privateKey }), /privacy/i);
  assert.throws(() => buildP3Submission({ manifest: { ...manifest, note: "undeclared" }, artifacts, authority: "mgds.submitter.external@0.1.0", privateKey: keys.privateKey }), /manifest invalid/);
  assert.throws(() => buildP3Submission({ manifest, artifacts: { "reports/private.json": Buffer.from('{"path":"/Users/alice/project"}') }, authority: "mgds.submitter.external@0.1.0", privateKey: keys.privateKey }), /privacy/i);
  const built = buildP3Submission({ manifest, artifacts, authority: "mgds.submitter.external@0.1.0", privateKey: keys.privateKey });
  const tampered = JSON.parse(built.bytes);
  tampered.artifacts[0].bytesBase64 = Buffer.from("changed").toString("base64");
  assert.throws(() => verifyP3Submission({ bytes: Buffer.from(JSON.stringify(tampered)), publicKey: keys.publicKey }), /artifact hash mismatch/);
  const drifted = JSON.parse(built.bytes);
  drifted.manifest.host = "windows-x64";
  assert.throws(() => verifyP3Submission({ bytes: Buffer.from(JSON.stringify(drifted)), publicKey: keys.publicKey }), /signature invalid/);
  const swappedAuthority = JSON.parse(built.bytes);
  swappedAuthority.attestation.authority = "mgds.submitter.impostor@0.1.0";
  assert.throws(() => verifyP3Submission({ bytes: Buffer.from(JSON.stringify(swappedAuthority)), publicKey: keys.publicKey }), /signature invalid/);
  const extra = JSON.parse(built.bytes);
  extra.unbound = true;
  assert.throws(() => verifyP3Submission({ bytes: Buffer.from(JSON.stringify(extra)), publicKey: keys.publicKey }), /bundle invalid/);
});
