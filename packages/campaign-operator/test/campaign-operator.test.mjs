import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyAttestation } from "../../attestation/src/index.mjs";
import { campaignRunAttestationPayload } from "../../campaign/src/index.mjs";
import {
  buildCampaignEvidence,
  readExternalPrivateKey,
  selectHostSlots,
  signEvaluatorRun,
  writeCampaignCheckpointAtomic,
} from "../src/index.mjs";

const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const slots = [
  { slotId: "task::macos-arm64::codex::1::1", host: "macos-arm64", harness: "codex", requiredEvidence: ["compile", "tests"] },
  { slotId: "task::macos-arm64::claude-code::1::1", host: "macos-arm64", harness: "claude-code", requiredEvidence: ["compile", "tests"] },
  { slotId: "task::linux-x64::codex::1::1", host: "linux-x64", harness: "codex", requiredEvidence: ["compile", "tests"] },
];

test("host shard selection is deterministic, resumable, and fail-closed", () => {
  assert.deepEqual(selectHostSlots({ plan: { slots }, host: "macos-arm64", completedSlotIds: [slots[0].slotId] }), [slots[1]]);
  assert.deepEqual(selectHostSlots({ plan: { slots }, host: "macos-arm64", harness: "codex", completedSlotIds: [] }), [slots[0]]);
  assert.throws(() => selectHostSlots({ plan: { slots }, host: "macos-arm64", completedSlotIds: [slots[2].slotId] }), /foreign completed slot/);
  assert.throws(() => selectHostSlots({ plan: { slots }, host: "macos-arm64", completedSlotIds: [slots[0].slotId, slots[0].slotId] }), /duplicate completed slot/);
});

test("campaign checkpoint replacement is atomic and publishable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mgds-checkpoint-"));
  const path = join(directory, "checkpoint.json");
  try {
    await writeCampaignCheckpointAtomic(path, { campaignId: "mgds.campaign.p2@0.1.0", host: "macos-arm64", completedSlotIds: [slots[0].slotId] });
    const value = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(value, { schema: "mgds.campaign-checkpoint/v1", campaignId: "mgds.campaign.p2@0.1.0", host: "macos-arm64", completedSlotIds: [slots[0].slotId] });
    await assert.rejects(writeCampaignCheckpointAtomic(path, { campaignId: "mgds.campaign.p2@0.1.0", host: "macos-arm64", completedSlotIds: ["/Users/private/workspace"] }), /privacy|slot identity/);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("evaluator evidence is a hash-chained, role-complete bundle", () => {
  const slot = slots[0];
  const result = buildCampaignEvidence({
    slot,
    runId: "run_1234567890abcdef",
    events: [{ type: "run.started" }, { type: "run.completed" }],
    artifacts: { compile: Buffer.from('{"status":"pass"}'), tests: Buffer.from('{"failed":0}') },
  });
  assert.equal(result.evidenceHash, digest(result.bytes));
  const bundle = JSON.parse(result.bytes);
  assert.equal(bundle.events[1].previousHash, bundle.events[0].hash);
  assert.deepEqual(bundle.artifacts.map(({ role }) => role), ["compile", "tests"]);
  assert.throws(() => buildCampaignEvidence({ slot, runId: "run_1234567890abcdef", events: [{}], artifacts: { compile: Buffer.from("{}") } }), /required evidence/);
  assert.throws(() => buildCampaignEvidence({ slot, runId: "run_1234567890abcdef", events: [{}], artifacts: { compile: Buffer.from('{"path":"/Users/alice/project"}'), tests: Buffer.from("{}") } }), /privacy/i);
});

test("evaluator run signatures cover the shared campaign payload", () => {
  const keys = generateKeyPairSync("ed25519");
  const unsigned = {
    slotId: slots[0].slotId,
    campaignId: "mgds.campaign.p2@0.1.0",
    taskId: "mgds.task.key-exit@0.1.0",
    taskHash: digest("task"), budgetHash: digest("budget"), environmentHash: digest("environment"),
    requiredEvidence: ["compile", "tests"], buildTarget: "desktop", host: "macos-arm64", harness: "codex", seed: 1, repetition: 1,
    runId: "run_1234567890abcdef", model: "gpt-test", evidenceHash: digest("evidence"), verdict: "valid", workspaceState: "known-clean",
    orphanProcesses: 0, privateAffordances: false, durationMinutes: 45, soak: false,
    evaluator: { id: "mgds.evaluator.reference@0.1.0", digest: digest("evaluator"), authority: "independent-evaluator" },
  };
  const signed = signEvaluatorRun(unsigned, keys.privateKey);
  assert.deepEqual(signed.evidenceAttestation.payload, campaignRunAttestationPayload(signed));
  assert.equal(signed.evidenceAttestation.authority, unsigned.evaluator.id);
  assert.equal(verifyAttestation(signed.evidenceAttestation, keys.publicKey), true);
});

test("private signing keys must be regular, owner-only files outside the repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "mgds-keys-"));
  const repository = join(root, "repository");
  const path = join(root, "external.pem");
  const inside = join(repository, "inside.pem");
  const link = join(root, "link.pem");
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  try {
    await mkdir(repository);
    await writeFile(path, pem, { mode: 0o600 });
    await writeFile(inside, pem, { mode: 0o600 });
    assert.equal((await readExternalPrivateKey({ path, repositoryRoot: repository })).asymmetricKeyType, "ed25519");
    await assert.rejects(readExternalPrivateKey({ path: inside, repositoryRoot: repository }), /outside the repository/);
    await chmod(path, 0o644);
    if (process.platform === "win32") assert.equal((await readExternalPrivateKey({ path, repositoryRoot: repository })).asymmetricKeyType, "ed25519");
    else await assert.rejects(readExternalPrivateKey({ path, repositoryRoot: repository }), /owner-only/);
    await chmod(path, 0o600);
    await symlink(path, link);
    await assert.rejects(readExternalPrivateKey({ path: link, repositoryRoot: repository }), /regular non-symlink/);
  } finally {
    await rm(root, { recursive: true });
  }
});
