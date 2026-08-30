import { createHash, createPrivateKey, sign } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";

import { canonical } from "@mgds/attestation";
import { campaignRunAttestationPayload } from "@mgds/campaign";
import { assertPublishable } from "@mgds/redaction";

const HOSTS = new Set(["macos-arm64", "linux-x64", "windows-x64"]);

export function selectHostSlots({ plan, host, harness, completedSlotIds = [] }) {
  if (!HOSTS.has(host) || !Array.isArray(plan?.slots)) throw new Error("valid campaign plan and host are required");
  const completed = new Set();
  const all = new Map(plan.slots.map((slot) => [slot.slotId, slot]));
  for (const slotId of completedSlotIds) {
    if (completed.has(slotId)) throw new Error(`duplicate completed slot: ${slotId}`);
    const slot = all.get(slotId);
    if (!slot || slot.host !== host || (harness && slot.harness !== harness)) throw new Error(`foreign completed slot: ${slotId}`);
    completed.add(slotId);
  }
  return plan.slots.filter((slot) => slot.host === host && (!harness || slot.harness === harness) && !completed.has(slot.slotId));
}

export async function writeCampaignCheckpointAtomic(path, checkpoint) {
  if (typeof path !== "string" || path.length === 0) throw new Error("checkpoint path is required");
  const value = {
    schema: "mgds.campaign-checkpoint/v1",
    campaignId: checkpoint?.campaignId,
    host: checkpoint?.host,
    completedSlotIds: checkpoint?.completedSlotIds,
  };
  if (!/^mgds\.campaign\.[a-z0-9.-]+@[0-9]+\.[0-9]+\.[0-9]+$/.test(value.campaignId ?? "") || !HOSTS.has(value.host) || !Array.isArray(value.completedSlotIds)) {
    throw new Error("valid checkpoint fields are required");
  }
  if (new Set(value.completedSlotIds).size !== value.completedSlotIds.length || value.completedSlotIds.some((slotId) => typeof slotId !== "string" || slotId.length < 16 || slotId.startsWith("/") || slotId.includes("\\"))) {
    throw new Error("checkpoint slot identity invalid");
  }
  assertPublishable(value);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temporaryPath, path);
  return value;
}

export function buildCampaignEvidence({ slot, runId, events, artifacts }) {
  if (!slot?.slotId || !/^run_[A-Za-z0-9_-]{16,}$/.test(runId ?? "") || !Array.isArray(events) || events.length === 0 || !artifacts || typeof artifacts !== "object") {
    throw new Error("slot, run identity, events, and artifacts are required");
  }
  const roles = Object.keys(artifacts).sort();
  const required = [...(slot.requiredEvidence ?? [])].sort();
  if (canonical(roles) !== canonical(required)) throw new Error("required evidence roles mismatch");
  let previousHash = "0".repeat(64);
  const ledger = events.map((event, index) => {
    assertPublishable(event);
    const body = { sequence: index + 1, previousHash, event: structuredClone(event) };
    const entry = { ...body, hash: digest(canonical(body)).slice(7) };
    previousHash = entry.hash;
    return entry;
  });
  const encodedArtifacts = required.map((role) => {
    const bytes = Buffer.from(artifacts[role]);
    if (bytes.length === 0) throw new Error(`empty evidence artifact: ${role}`);
    if (role !== "screenshot") {
      let decoded;
      try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new Error(`public JSON evidence artifact required: ${role}`); }
      assertPublishable(decoded);
    }
    return { role, hash: digest(bytes), bytesBase64: bytes.toString("base64") };
  });
  const bundle = {
    schema: "mgds.campaign-evidence/v1",
    runId,
    slotId: slot.slotId,
    events: ledger,
    artifacts: encodedArtifacts,
    privacy: { classification: "public-redacted", redactionVersion: "mgds.redaction/v1" },
    replayStatus: "verified",
  };
  assertPublishable(bundle);
  const bytes = Buffer.from(JSON.stringify(bundle));
  return { bundle, bytes, evidenceHash: digest(bytes) };
}

export function signEvaluatorRun(run, privateKey) {
  if (!privateKey) throw new Error("evaluator private key is required");
  const payload = campaignRunAttestationPayload(run);
  const signature = sign(null, Buffer.from(canonical(payload)), privateKey).toString("base64url");
  return {
    ...structuredClone(run),
    evidenceAttestation: {
      algorithm: "Ed25519",
      authority: run.evaluator.id,
      payload,
      signature,
    },
  };
}

export async function readExternalPrivateKey({ path, repositoryRoot }) {
  if (typeof path !== "string" || typeof repositoryRoot !== "string") throw new Error("private key path and repository root are required");
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("private key must be a regular non-symlink file");
  if (process.platform !== "win32" && (before.mode & 0o077) !== 0) throw new Error("private key must be owner-only");
  const [resolvedPath, resolvedRepository] = await Promise.all([realpath(path), realpath(repositoryRoot)]);
  const fromRepository = relative(resolvedRepository, resolvedPath);
  if (fromRepository === "" || (!fromRepository.startsWith("..") && !isAbsolute(fromRepository))) throw new Error("private key must be outside the repository");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || (before.ino && opened.ino && (before.ino !== opened.ino || before.dev !== opened.dev))) throw new Error("private key file identity changed");
    const bytes = await handle.readFile();
    if (bytes.length === 0 || bytes.length > 64 * 1024) throw new Error("private key size invalid");
    const key = createPrivateKey(bytes);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Ed25519 private key required");
    return key;
  } finally {
    await handle.close();
  }
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
