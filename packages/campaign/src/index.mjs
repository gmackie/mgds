import { createHash, createPublicKey, verify } from "node:crypto";
import { constants, readFileSync } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";

import { assertPublishable } from "@mgds/redaction";

const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_EVIDENCE_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_CAMPAIGN_EVIDENCE_BYTES = 256 * 1024 * 1024;
const VERIFIED_BUNDLE = Symbol("verified-campaign-evidence");
const validators = compileValidators();

export async function sealCampaignInputs({ config, readFile }) {
  validateConfig(config);
  if (typeof readFile !== "function") throw new Error("readFile is required");
  if (!Array.isArray(config.tasks) || config.tasks.length === 0) throw new Error("campaign tasks are required");
  if (!Array.isArray(config.environmentInputs) || config.environmentInputs.length === 0) throw new Error("campaign environment inputs are required");
  for (const descriptor of config.tasks) validateRepositoryPath(descriptor?.path);
  for (const path of config.environmentInputs) validateRepositoryPath(path);

  const tasks = [];
  for (const descriptor of config.tasks) {
    const bytes = requireBytes(await readFile(descriptor.path), descriptor.path);
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (manifest.id !== descriptor.id) throw new Error(`task identity mismatch for ${descriptor.path}`);
    if (!manifest.budgets || typeof manifest.budgets !== "object") throw new Error(`task budget missing for ${descriptor.path}`);
    if (!validEvidenceRoles(manifest.evidence)) throw new Error(`task evidence requirements missing for ${descriptor.path}`);
    if (typeof manifest.terminal?.buildTarget !== "string" || manifest.terminal.buildTarget.length === 0) throw new Error(`task build target missing for ${descriptor.path}`);
    tasks.push({ id: descriptor.id, hash: digest(bytes), budgetHash: digest(canonical(manifest.budgets)), evidence: [...manifest.evidence], buildTarget: manifest.terminal.buildTarget });
  }

  const inputs = [];
  for (const path of config.environmentInputs) {
    inputs.push({ path, hash: digest(requireBytes(await readFile(path), path)) });
  }
  inputs.sort((left, right) => left.path.localeCompare(right.path));
  const environments = Object.fromEntries(config.hosts.map((host) => [host, digest(canonical({ host, inputs }))]));
  return { tasks, environments };
}

export function buildCampaignPlan({ config, tasks, environments }) {
  validateConfig(config);
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("at least one sealed task is required");
  if (new Set(tasks.map(({ id }) => id)).size !== tasks.length) throw new Error("task identities must be unique");
  const slots = [];

  for (const task of tasks) {
    if (!task?.id || !HASH.test(task.hash) || !HASH.test(task.budgetHash) || !validEvidenceRoles(task.evidence) || typeof task.buildTarget !== "string" || task.buildTarget.length === 0) {
      throw new Error("task id, sealed hash, budget hash, evidence requirements, and build target are required");
    }
    for (const host of config.hosts) {
      const environmentHash = environments?.[host];
      if (!HASH.test(environmentHash ?? "")) throw new Error(`sealed environment required for ${host}`);
      for (const harness of config.harnesses) {
        for (const seed of config.seeds) {
          for (let repetition = 1; repetition <= config.repeatRuns; repetition += 1) {
            const slotId = [task.id, host, harness, seed, repetition].join("::");
            slots.push({
              slotId,
              campaignId: config.id,
              taskId: task.id,
              taskHash: task.hash,
              budgetHash: task.budgetHash,
              environmentHash,
              requiredEvidence: [...task.evidence],
              buildTarget: task.buildTarget,
              host,
              harness,
              seed,
              repetition,
            });
          }
        }
      }
    }
  }

  return {
    campaignId: config.id,
    thresholds: structuredClone(config.thresholds),
    soakMinutes: config.soakMinutes,
    slots,
  };
}

export async function loadCampaignEvidence({ plan, runs, index, readEvidenceFile }) {
  if (!validators.plan(plan) || !Array.isArray(runs) || !validators.index(index) || typeof readEvidenceFile !== "function") {
    throw new Error("campaign plan, runs, evidence index, and bounded byte reader are required and schema-valid");
  }
  const expected = new Set(runs.map(({ evidenceHash }) => evidenceHash));
  if (expected.size !== runs.length && runs.length > 0) throw new Error("campaign runs must have unique evidence hashes");
  const entries = new Map();
  for (const entry of index.bundles) {
    if (!HASH.test(entry?.evidenceHash ?? "")) throw new Error("invalid evidence index hash");
    validateRepositoryPath(entry.path);
    if (!expected.has(entry.evidenceHash)) throw new Error(`unexpected evidence index entry: ${entry.evidenceHash}`);
    if (entries.has(entry.evidenceHash)) throw new Error(`duplicate evidence index entry: ${entry.evidenceHash}`);
    entries.set(entry.evidenceHash, entry.path);
  }
  const bundles = new Map();
  let totalBytes = 0;
  const slots = new Map(plan.slots.map((slot) => [slot.slotId, slot]));
  for (const run of runs) {
    const evidenceHash = run.evidenceHash;
    const path = entries.get(evidenceHash);
    if (!path) throw new Error(`missing evidence index entry: ${evidenceHash}`);
    const bytes = requireBytes(await readEvidenceFile(path, MAX_EVIDENCE_BUNDLE_BYTES), path);
    if (bytes.length === 0 || bytes.length > MAX_EVIDENCE_BUNDLE_BYTES) throw new Error(`evidence bundle size limit exceeded: ${path}`);
    totalBytes += bytes.length;
    if (totalBytes > MAX_CAMPAIGN_EVIDENCE_BYTES) throw new Error("campaign evidence byte budget exceeded");
    if (digest(bytes) !== evidenceHash) throw new Error(`evidence index content mismatch: ${evidenceHash}`);
    const failures = verifyEvidenceBundle(run, slots.get(run.slotId), new Map([[evidenceHash, bytes]]));
    if (failures.length > 0) throw new Error(failures.join("; "));
    bundles.set(evidenceHash, { [VERIFIED_BUNDLE]: true, evidenceHash, runId: run.runId, slotId: run.slotId });
  }
  return bundles;
}

export async function readBoundedEvidenceFile(path, maxBytes = MAX_EVIDENCE_BUNDLE_BYTES) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("positive evidence size limit required");
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`regular evidence bundle required: ${path}`);
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxBytes || (before.ino && opened.ino && (before.ino !== opened.ino || before.dev !== opened.dev))) {
      throw new Error(`evidence bundle size limit or file identity mismatch: ${path}`);
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) throw new Error(`evidence bundle size limit exceeded: ${path}`);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

export function aggregateCampaign({ plan, runs, evaluatorAuthorities = {}, trustedEvaluatorFingerprints = {}, evidenceBundles = new Map() }) {
  if (!validators.plan(plan)) throw new Error(`campaign plan schema invalid: ${formatErrors(validators.plan.errors)}`);
  if (!Array.isArray(runs)) throw new Error("campaign runs are required");

  const expected = new Map(plan.slots.map((slot) => [slot.slotId, slot]));
  const seen = new Set();
  const accepted = [];
  const failures = [];
  const attestedSlots = new Set();
  const seenRunIds = new Set();

  for (const run of runs) {
    const slot = expected.get(run?.slotId);
    if (!slot) {
      failures.push(`unexpected slot: ${run?.slotId ?? "<missing>"}`);
      continue;
    }
    if (seen.has(run.slotId)) {
      failures.push(`duplicate slot: ${run.slotId}`);
      continue;
    }
    seen.add(run.slotId);
    accepted.push(run);
    if (!validators.run(run)) failures.push(`run schema invalid for ${run.slotId}: ${formatErrors(validators.run.errors)}`);
    if (seenRunIds.has(run.runId)) failures.push(`duplicate run identity: ${run.runId}`);
    else if (typeof run.runId === "string") seenRunIds.add(run.runId);
    compare(run, slot, "campaignId");
    compare(run, slot, "taskId");
    compare(run, slot, "taskHash", "task hash mismatch");
    compare(run, slot, "budgetHash", "budget hash mismatch");
    compare(run, slot, "environmentHash", "environment hash mismatch");
    if (canonical(run.requiredEvidence) !== canonical(slot.requiredEvidence)) failures.push(`required evidence mismatch for ${run.slotId}`);
    compare(run, slot, "buildTarget", "build target mismatch");
    compare(run, slot, "host");
    compare(run, slot, "harness");
    compare(run, slot, "seed");
    compare(run, slot, "repetition");
    if (run.privateAffordances !== false) failures.push(`private affordance declared for ${run.slotId}`);
    if (!HASH.test(run.evidenceHash ?? "")) failures.push(`invalid evidence hash for ${run.slotId}`);
    if (!/^run_[A-Za-z0-9_-]{16,}$/.test(run.runId ?? "")) failures.push(`invalid run identity for ${run.slotId}`);
    if (typeof run.model !== "string" || run.model.trim().length === 0 || run.model.length > 120) failures.push(`model provenance missing for ${run.slotId}`);
    if (!["valid", "invalid", "inconclusive"].includes(run.verdict)) failures.push(`invalid verdict for ${run.slotId}`);
    if (!Number.isInteger(run.orphanProcesses) || run.orphanProcesses < 0) failures.push(`invalid orphan process count for ${run.slotId}`);
    if (!(run.durationMinutes > 0 && run.durationMinutes <= 1440)) failures.push(`invalid duration for ${run.slotId}`);
    if (typeof run.soak !== "boolean") failures.push(`invalid soak marker for ${run.slotId}`);
    if (!validEvaluatorIdentity(run.evaluator)) failures.push(`invalid evaluator identity for ${run.slotId}`);
    if (verifyEvidenceAttestation(run, evaluatorAuthorities, trustedEvaluatorFingerprints)) attestedSlots.add(run.slotId);
    else failures.push(`invalid evidence attestation for ${run.slotId}`);
    failures.push(...verifyEvidenceBundle(run, slot, evidenceBundles));
  }

  const missingSlotIds = plan.slots.filter(({ slotId }) => !seen.has(slotId)).map(({ slotId }) => slotId);
  const validRuns = accepted.filter(({ verdict }) => verdict === "valid").length;
  const t0PassRate = ratio(validRuns, accepted.length);
  const agreementGroups = groupBy(accepted, ({ taskId, host, harness, seed }) => [taskId, host, harness, seed].join("::"));
  const agreeingGroups = [...agreementGroups.values()].filter((group) => new Set(group.map(({ verdict }) => verdict)).size === 1).length;
  const seedAgreement = ratio(agreeingGroups, agreementGroups.size);
  const orphanProcesses = accepted.reduce((total, run) => total + nonNegativeInteger(run.orphanProcesses), 0);
  const unknownWorkspaceStates = accepted.filter(({ workspaceState }) => workspaceState !== "known-clean").length;
  const thresholds = plan.thresholds ?? {};

  if (accepted.length > 0 && t0PassRate < thresholds.t0PassRate) failures.push(`pass-rate threshold: ${t0PassRate} < ${thresholds.t0PassRate}`);
  if (accepted.length > 0 && seedAgreement < thresholds.seedAgreement) failures.push(`seed-agreement threshold: ${seedAgreement} < ${thresholds.seedAgreement}`);
  if (orphanProcesses > thresholds.orphanProcesses) failures.push(`orphan process threshold: ${orphanProcesses} > ${thresholds.orphanProcesses}`);
  if (unknownWorkspaceStates > thresholds.unknownWorkspaceStates) failures.push(`unknown workspace state threshold: ${unknownWorkspaceStates} > ${thresholds.unknownWorkspaceStates}`);
  enforceEvaluatorFairness(accepted, failures);
  if (missingSlotIds.length === 0) enforceSoakCoverage(plan, accepted, attestedSlots, failures);

  return {
    campaignId: plan.campaignId,
    status: failures.length > 0 ? "invalid" : missingSlotIds.length > 0 ? "incomplete" : "pass",
    metrics: {
      expectedRuns: plan.slots.length,
      recordedRuns: accepted.length,
      missingRuns: missingSlotIds.length,
      validRuns,
      t0PassRate,
      seedAgreement,
      orphanProcesses,
      unknownWorkspaceStates,
    },
    missingSlotIds,
    failures,
  };

  function compare(run, slot, key, label = `${key} mismatch`) {
    if (run[key] !== slot[key]) failures.push(`${label} for ${run.slotId}`);
  }
}

export function campaignRunAttestationPayload(run) {
  return {
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
}

function validateConfig(config) {
  if (!config?.id) throw new Error("campaign id is required");
  for (const key of ["harnesses", "hosts", "seeds"]) {
    if (!Array.isArray(config[key]) || config[key].length === 0) throw new Error(`${key} are required`);
    if (new Set(config[key]).size !== config[key].length) throw new Error(`${key} must be unique`);
  }
  if (!Number.isInteger(config.repeatRuns) || config.repeatRuns < 1) throw new Error("repeatRuns must be a positive integer");
  if (!Number.isInteger(config.soakMinutes) || config.soakMinutes < 1 || config.soakMinutes > 1440) throw new Error("soakMinutes out of range");
  const thresholds = config.thresholds ?? {};
  for (const key of ["seedAgreement", "t0PassRate"]) {
    if (!(thresholds[key] >= 0 && thresholds[key] <= 1)) throw new Error(`${key} threshold out of range`);
  }
  for (const key of ["orphanProcesses", "unknownWorkspaceStates"]) {
    if (!Number.isInteger(thresholds[key]) || thresholds[key] < 0) throw new Error(`${key} threshold out of range`);
  }
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function validEvaluatorIdentity(evaluator) {
  return /^mgds\.evaluator\.[a-z0-9.-]+@[0-9]+\.[0-9]+\.[0-9]+$/.test(evaluator?.id ?? "")
    && evaluator.authority === "independent-evaluator"
    && HASH.test(evaluator.digest ?? "");
}

function verifyEvidenceAttestation(run, authorities, trustedFingerprints) {
  try {
    const attestation = run.evidenceAttestation;
    const authority = authorities?.[run.evaluator?.id];
    const publicKey = createPublicKey(authority?.publicKey);
    const fingerprint = digest(publicKey.export({ type: "spki", format: "der" }));
    const expected = campaignRunAttestationPayload(run);
    if (
      authority?.algorithm !== "Ed25519"
      || attestation?.algorithm !== "Ed25519"
      || attestation.authority !== run.evaluator.id
      || fingerprint !== trustedFingerprints?.[run.evaluator.id]
      || canonical(attestation.payload) !== canonical(expected)
      || !/^[A-Za-z0-9_-]+$/.test(attestation.signature ?? "")
    ) return false;
    return verify(null, Buffer.from(canonical(expected)), publicKey, Buffer.from(attestation.signature, "base64url"));
  } catch {
    return false;
  }
}

function verifyEvidenceBundle(run, slot, evidenceBundles) {
  const label = run?.slotId ?? "<missing>";
  if (!(evidenceBundles instanceof Map)) return [`evidence bundle resolver invalid for ${label}`];
  const value = evidenceBundles.get(run.evidenceHash);
  if (value?.[VERIFIED_BUNDLE] === true) {
    return value.evidenceHash === run.evidenceHash && value.runId === run.runId && value.slotId === run.slotId
      ? []
      : [`verified evidence identity mismatch for ${label}`];
  }
  if (!(value instanceof Uint8Array)) return [`evidence bundle missing for ${label}`];
  const bytes = Buffer.from(value);
  if (bytes.length === 0 || bytes.length > MAX_EVIDENCE_BUNDLE_BYTES) return [`evidence bundle size invalid for ${label}`];
  if (digest(bytes) !== run.evidenceHash) return [`evidence hash mismatch for ${label}`];

  try {
    const bundle = JSON.parse(bytes.toString("utf8"));
    if (!validators.evidence(bundle)) return [`evidence bundle schema invalid for ${label}: ${formatErrors(validators.evidence.errors)}`];
    try {
      assertPublishable(bundle);
    } catch {
      return [`evidence privacy rejected for ${label}`];
    }
    if (
      bundle?.schema !== "mgds.campaign-evidence/v1"
      || bundle.runId !== run.runId
      || bundle.slotId !== run.slotId
      || bundle.replayStatus !== "verified"
    ) return [`evidence identity mismatch for ${label}`];
    if (!Array.isArray(bundle.events) || bundle.events.length === 0) return [`evidence ledger missing for ${label}`];
    if (!Array.isArray(bundle.artifacts) || bundle.artifacts.length === 0) return [`evidence artifacts missing for ${label}`];

    let previousHash = "0".repeat(64);
    for (let index = 0; index < bundle.events.length; index += 1) {
      const entry = bundle.events[index];
      const body = { sequence: entry?.sequence, previousHash: entry?.previousHash, event: entry?.event };
      const expectedHash = digest(canonical(body)).slice(7);
      if (entry?.sequence !== index + 1 || entry.previousHash !== previousHash || entry.hash !== expectedHash) {
        return [`evidence ledger mismatch for ${label} at sequence ${index + 1}`];
      }
      previousHash = entry.hash;
    }

    const artifactHashes = new Set();
    const artifactRoles = new Set();
    for (const artifact of bundle.artifacts) {
      if (!HASH.test(artifact?.hash ?? "") || typeof artifact.bytesBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(artifact.bytesBase64)) {
        return [`evidence artifact invalid for ${label}`];
      }
      const artifactBytes = Buffer.from(artifact.bytesBase64, "base64");
      if (artifactBytes.length === 0 || artifactBytes.toString("base64") !== artifact.bytesBase64 || digest(artifactBytes) !== artifact.hash || artifactHashes.has(artifact.hash) || artifactRoles.has(artifact.role)) {
        return [`evidence artifact hash mismatch for ${label}`];
      }
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(artifactBytes);
        if (artifact.role === "screenshot") assertPublishable(text);
        else assertPublishable(JSON.parse(text));
      } catch (error) {
        if (error?.message?.startsWith("MGDS_PRIVACY_REJECTED")) return [`evidence privacy rejected for ${label}`];
      }
      if (!validRoleContent(artifact.role, artifactBytes, bundle, slot)) return [`evidence content invalid for ${artifact.role} in ${label}`];
      artifactHashes.add(artifact.hash);
      artifactRoles.add(artifact.role);
    }
    const requiredRoles = [...(slot?.requiredEvidence ?? [])].sort();
    if (canonical([...artifactRoles].sort()) !== canonical(requiredRoles)) return [`required evidence roles mismatch for ${label}`];
    return [];
  } catch {
    return [`evidence bundle invalid for ${label}`];
  }
}

function validEvidenceRoles(value) {
  return Array.isArray(value) && value.length > 0 && value.every((role) => typeof role === "string" && /^[a-z][a-z0-9-]{1,63}$/.test(role))
    && new Set(value).size === value.length;
}

function validRoleContent(role, bytes, bundle, slot) {
  if (role === "screenshot") {
    return validPng(bytes);
  }
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (role === "compile") return exactKeys(value, ["diagnostics", "schema", "status"]) && value.schema === "mgds.compile-report/v1" && value.status === "pass" && Array.isArray(value.diagnostics);
    if (role === "tests") return exactKeys(value, ["failed", "passed", "schema", "status"]) && value.schema === "mgds.test-report/v1" && value.status === "pass" && Number.isInteger(value.passed) && value.passed > 0 && value.failed === 0;
    if (role === "event-ledger") return exactKeys(value, ["entries", "headHash", "schema"]) && value.schema === "mgds.event-ledger-evidence/v1" && value.entries === bundle.events.length && value.headHash === bundle.events.at(-1)?.hash;
    if (role === "player-build") return validPlayerBuild(value, slot?.buildTarget);
    return false;
  } catch {
    return false;
  }
}

function validPlayerBuild(value, expectedBuildTarget) {
  if (!exactKeys(value, ["artifactHash", "buildTarget", "files", "schema", "status"]) || value.schema !== "mgds.player-build/v1" || value.status !== "pass" || value.buildTarget !== expectedBuildTarget || !Array.isArray(value.files) || value.files.length === 0) return false;
  const identities = [];
  const names = new Set();
  for (const file of value.files) {
    const portableIdentity = typeof file?.name === "string" ? file.name.toLowerCase() : "";
    if (!exactKeys(file, ["bytesBase64", "hash", "name"]) || !validPortableBuildName(file.name) || names.has(portableIdentity) || !HASH.test(file.hash ?? "") || typeof file.bytesBase64 !== "string") return false;
    const bytes = Buffer.from(file.bytesBase64, "base64");
    if (bytes.length === 0 || bytes.toString("base64") !== file.bytesBase64 || digest(bytes) !== file.hash) return false;
    try {
      assertPublishable(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
      if (error?.message?.startsWith("MGDS_PRIVACY_REJECTED")) return false;
    }
    names.add(portableIdentity);
    identities.push({ name: file.name, hash: file.hash });
  }
  return digest(canonical(identities)) === value.artifactHash;
}

function validPortableBuildName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 240 || name.startsWith("/") || name.includes("\\") || /[\u0000-\u001f\u007f]/.test(name)) return false;
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  const segments = name.split("/");
  return segments.every((segment) => segment.length > 0 && segment.length <= 120 && segment !== "." && segment !== ".." && !segment.endsWith(".") && /^[A-Za-z0-9._-]+$/.test(segment) && !reserved.test(segment));
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && canonical(Object.keys(value).sort()) === canonical(keys);
}

function validPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8;
  let seenHeader = false;
  let seenImageData = false;
  let imageDataEnded = false;
  let seenPalette = false;
  let seenTransparency = false;
  let width = 0;
  let height = 0;
  let bitsPerPixel = 0;
  let bitDepth = 0;
  let colorType = 0;
  let paletteEntries = 0;
  const compressed = [];
  const allowed = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "pHYs"]);
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > bytes.length) return false;
    if (!allowed.has(type) || crc32(bytes.subarray(offset + 4, dataEnd)) !== bytes.readUInt32BE(dataEnd)) return false;
    if (!seenHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
      const legalDepths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[colorType];
      if (width === 0 || height === 0 || width > 8192 || height > 8192 || width * height > 16_777_216 || !channels || !legalDepths?.includes(bitDepth) || bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || bytes[dataStart + 12] !== 0) return false;
      bitsPerPixel = channels * bitDepth;
      seenHeader = true;
    } else if (type === "IHDR") return false;
    if (type === "PLTE") {
      const entries = length / 3;
      if (seenPalette || seenImageData || length === 0 || length > 768 || length % 3 !== 0 || colorType === 0 || colorType === 4 || (colorType === 3 && entries > 2 ** bitDepth)) return false;
      seenPalette = true;
      paletteEntries = entries;
    }
    if (type === "tRNS") {
      if (seenTransparency || seenImageData || colorType === 4 || colorType === 6 || (colorType === 0 && length !== 2) || (colorType === 2 && length !== 6) || (colorType === 3 && (!seenPalette || length === 0 || length > paletteEntries))) return false;
      seenTransparency = true;
    }
    if (type === "IDAT") {
      if (length === 0 || imageDataEnded || (colorType === 3 && !seenPalette)) return false;
      seenImageData = true;
      compressed.push(bytes.subarray(dataStart, dataEnd));
    } else if (seenImageData && type !== "IEND") imageDataEnded = true;
    if (type === "IEND") {
      if (length !== 0 || !seenHeader || !seenImageData || chunkEnd !== bytes.length) return false;
      try {
        const rowBytes = Math.ceil(width * bitsPerPixel / 8);
        const expectedBytes = height * (rowBytes + 1);
        const inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedBytes + 1 });
        if (inflated.length !== expectedBytes) return false;
        for (let row = 0; row < height; row += 1) if (inflated[row * (rowBytes + 1)] > 4) return false;
        return true;
      } catch {
        return false;
      }
    }
    offset = chunkEnd;
  }
  return false;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function compileValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const names = ["campaign-plan", "campaign-run", "campaign-evidence", "campaign-evidence-index"];
  for (const name of names) {
    const schema = JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"));
    ajv.addSchema(schema);
  }
  return {
    plan: ajv.getSchema("https://mgds.dev/schemas/v0/campaign-plan.schema.json"),
    run: ajv.getSchema("https://mgds.dev/schemas/v0/campaign-run.schema.json"),
    evidence: ajv.getSchema("https://mgds.dev/schemas/v0/campaign-evidence.schema.json"),
    index: ajv.getSchema("https://mgds.dev/schemas/v0/campaign-evidence-index.schema.json"),
  };
}

function formatErrors(errors) {
  return (errors ?? []).map(({ instancePath, message }) => `${instancePath || "/"} ${message}`).join(", ");
}

function enforceEvaluatorFairness(runs, failures) {
  const groups = groupBy(runs, ({ taskId, host, seed, repetition }) => [taskId, host, seed, repetition].join("::"));
  for (const [key, group] of groups) {
    const identities = new Set(group.map(({ evaluator }) => `${evaluator?.id ?? ""}:${evaluator?.digest ?? ""}`));
    if (identities.size > 1) failures.push(`evaluator fairness mismatch for ${key}`);
  }
}

function enforceSoakCoverage(plan, runs, attestedSlots, failures) {
  const required = new Set(plan.slots.map(({ host, harness }) => `${host}::${harness}`));
  for (const key of required) {
    const covered = runs.some((run) => `${run.host}::${run.harness}` === key
      && run.soak === true
      && run.durationMinutes >= plan.soakMinutes
      && attestedSlots.has(run.slotId));
    if (!covered) failures.push(`soak requirement not met for ${key}`);
  }
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function validateRepositoryPath(path) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`repository-relative path required: ${path}`);
  }
}

function requireBytes(value, path) {
  if (!(value instanceof Uint8Array)) throw new Error(`unable to read campaign input: ${path}`);
  return Buffer.from(value);
}
