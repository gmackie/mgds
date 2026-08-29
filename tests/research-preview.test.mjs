import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { evaluateSubmission } from "../packages/evaluator/src/index.mjs";
import { runT0 } from "../packages/evaluator/src/t0.mjs";
import { SandboxPolicy } from "../packages/sandbox/src/index.mjs";
import { SecretBroker } from "../packages/broker/src/index.mjs";
import { redactForEvidence } from "../packages/redaction/src/index.mjs";
import { createAttestation, verifyAttestation } from "../packages/attestation/src/index.mjs";
import { RecoveryRegistry } from "../packages/controller/src/recovery.mjs";
import { injectFault } from "../packages/fault-injector/src/index.mjs";
import { buildHarnessProvenance } from "../harnesses/shared/provenance.mjs";
import { reproduceResult } from "../scripts/reproduce-result.mjs";

test("isolated evaluator rejects untrusted authority and verifies sealed bytes", () => {
  const task = Buffer.from("sealed-task");
  const artifact = Buffer.from("known-good");
  const result = evaluateSubmission({
    taskBytes: task,
    expectedTaskHash: `sha256:${sha(task)}`,
    evaluatorId: "eval_key_exit_v1",
    expectedEvaluatorId: "eval_key_exit_v1",
    evidence: [{ authority: "evaluator", bytes: artifact, hash: `sha256:${sha(artifact)}` }],
    hiddenChecks: [({ evidence }) => evidence.length === 1],
  });
  assert.equal(result.ok, true);
  assert.throws(() => evaluateSubmission({
    taskBytes: task,
    expectedTaskHash: `sha256:${sha(task)}`,
    evaluatorId: "eval_key_exit_v1",
    expectedEvaluatorId: "eval_key_exit_v1",
    evidence: [{ authority: "agent", bytes: artifact, hash: `sha256:${sha(artifact)}` }],
    hiddenChecks: [],
  }), /authority/);
});

test("T0 reports clause-level failure for a deliberately broken adapter", () => {
  const good = runT0({ manifest: true, bounds: true, cancellation: true, privacy: true, evidence: true });
  const broken = runT0({ manifest: false, bounds: false, cancellation: false, privacy: false, evidence: false });
  assert.equal(good.status, "pass");
  assert.equal(broken.status, "fail");
  assert.equal(broken.clauses.filter((x) => x.status === "fail").length, 5);
});

test("sandbox, broker, redaction, attestation, and recovery fail closed", () => {
  const benchmark = new SandboxPolicy("benchmark", { network: ["https://packages.unity.com"], immutableBase: true });
  assert.throws(() => benchmark.authorizePath("/unrelated"), /disposable workspace/);
  const broker = new SecretBroker({ destinations: ["https://example.invalid"], now: () => 1000 });
  const handle = broker.issue("secret-value", 100);
  assert.equal(broker.resolve(handle, "https://example.invalid", 1050), "secret-value");
  assert.throws(() => broker.resolve(handle, "https://evil.invalid", 1050), /destination/);
  const redacted = redactForEvidence({ path: "/Users/person/project", token: "abc", text: "\u001b[31mhello" });
  assert.deepEqual(redacted, { path: "[REDACTED_PATH]", token: "[REDACTED]", text: "hello" });
  const { attestation, publicKey } = createAttestation({ runId: "run_fixture", head: `sha256:${"a".repeat(64)}` });
  assert.equal(verifyAttestation(attestation, publicKey), true);
  assert.equal(verifyAttestation({ ...attestation, payload: { ...attestation.payload, runId: "run_tampered" } }, publicKey), false);
  const recovery = new RecoveryRegistry();
  recovery.register("proc_1", "player", 100);
  assert.equal(recovery.reconcile(new Set(), 200).state, "known-clean");
});

test("fault catalog and harness provenance are deterministic and bounded", () => {
  assert.deepEqual(injectFault("port-collision", { port: 7800 }), { code: "MGDS_PORT_COLLISION", retryable: true, port: 7800 });
  assert.throws(() => injectFault("unknown", {}), /Unknown fault/);
  const provenance = buildHarnessProvenance({ harness: "codex", model: "gpt-5", taskHash: `sha256:${"b".repeat(64)}`, wallMinutes: 45 });
  assert.equal(provenance.harness, "codex");
  assert.equal(provenance.budget.wallMinutes, 45);
});

test("P2 engineering artifacts exist and result reproduction verifies hashes", () => {
  for (const path of [
    "benchmarks/golden-arena/ProjectSettings/ProjectVersion.txt",
    "benchmarks/tasks/t1/key-exit/task.json",
    "profiles/benchmark.policy.json",
    "profiles/project.policy.json",
    "toolchains/unity-6000.3.9f1.json",
    "docs/quickstart.html",
    "docs/adapter-authoring.html",
    "security/known-limitations.html",
    "docs/p3-protocol.html",
  ]) assert.equal(existsSync(path), true, `missing ${path}`);
  const bytes = Buffer.from("evidence");
  const replay = reproduceResult({ artifacts: [{ bytes, hash: `sha256:${sha(bytes)}` }] });
  assert.equal(replay.status, "verified");
  const release = JSON.parse(readFileSync("versions/v0.1.0-preview.1.json", "utf8"));
  assert.equal(release.status, "candidate");
});

function sha(bytes) {
  return (awaitImportCrypto()).createHash("sha256").update(bytes).digest("hex");
}

function awaitImportCrypto() {
  return requireCrypto;
}

import * as requireCrypto from "node:crypto";
