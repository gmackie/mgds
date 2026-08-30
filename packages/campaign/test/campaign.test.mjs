import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import { canonical } from "../../attestation/src/index.mjs";

import {
  aggregateCampaign,
  buildCampaignPlan,
  campaignRunAttestationPayload,
  loadCampaignEvidence,
  readBoundedEvidenceFile,
  sealCampaignInputs,
} from "../src/index.mjs";

const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function indexedPngWithoutPalette() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 1;
  header[9] = 3;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 0]))),
    pngChunk("IEND"),
  ]);
}

const config = {
  id: "mgds.campaign.p2@0.1.0",
  harnesses: ["codex", "claude-code"],
  hosts: ["macos-arm64", "linux-x64", "windows-x64"],
  seeds: [1337, 7331, 424242],
  repeatRuns: 5,
  soakMinutes: 240,
  thresholds: {
    seedAgreement: 1,
    t0PassRate: 1,
    orphanProcesses: 0,
    unknownWorkspaceStates: 0,
  },
};

const task = {
  id: "mgds.task.key-exit@0.1.0",
  hash: hash("sealed task"),
  budgetHash: hash("45 minute budget"),
  evidence: ["compile", "tests", "event-ledger", "screenshot", "player-build"],
  buildTarget: "desktop",
};

const environments = Object.fromEntries(config.hosts.map((host) => [host, hash(`environment:${host}`)]));
const evaluatorId = "mgds.evaluator.key-exit@0.1.0";
const evaluatorDigest = hash("key-exit evaluator");
const evaluatorKeys = generateKeyPairSync("ed25519");
const evaluatorAuthorities = {
  [evaluatorId]: {
    algorithm: "Ed25519",
    publicKey: evaluatorKeys.publicKey.export({ type: "spki", format: "pem" }),
  },
};
const trustedEvaluatorFingerprints = {
  [evaluatorId]: hash(evaluatorKeys.publicKey.export({ type: "spki", format: "der" })),
};
const evidenceBundles = new Map();

function passingRun(slot) {
  const base = {
    ...slot,
    runId: `run_${hash(slot.slotId).slice(7, 27)}`,
    model: slot.harness === "codex" ? "gpt-test" : "claude-test",
    verdict: "valid",
    workspaceState: "known-clean",
    orphanProcesses: 0,
    privateAffordances: false,
    durationMinutes: slot.repetition === 1 ? config.soakMinutes : 45,
    soak: slot.repetition === 1,
    evaluator: { id: evaluatorId, digest: evaluatorDigest, authority: "independent-evaluator" },
  };
  return signedWithEvidence(slot, base);
}

function signedWithEvidence(slot, base, mutateBundle = (value) => value) {
  const evidence = evidenceBundle(base);
  const mutated = Buffer.from(JSON.stringify(mutateBundle(JSON.parse(evidence))));
  const evidenceHash = hash(mutated);
  evidenceBundles.set(evidenceHash, mutated);
  return signedRun(slot, { ...base, evidenceHash });
}

function signedRun(slot, run) {
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
  const headHash = hash(canonical(body)).slice(7);
  return Buffer.from(JSON.stringify({
    schema: "mgds.campaign-evidence/v1",
    runId: run.runId,
    slotId: run.slotId,
    events: [{ ...body, hash: headHash }],
    artifacts: task.evidence.map((role) => {
      const artifactBytes = evidenceArtifactBytes(role, run, headHash);
      return { role, hash: hash(artifactBytes), bytesBase64: artifactBytes.toString("base64") };
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
  const files = [{ name: "Game/player.bin", hash: hash(bytes), bytesBase64: bytes.toString("base64") }];
  return { schema: "mgds.player-build/v1", status: "pass", buildTarget: "desktop", artifactHash: hash(canonical(files.map(({ name, hash: fileHash }) => ({ name, hash: fileHash })))), files };
}

function aggregate(plan, runs) {
  return aggregateCampaign({ plan, runs, evaluatorAuthorities, trustedEvaluatorFingerprints, evidenceBundles });
}

test("campaign planning creates a stable complete matrix", () => {
  const first = buildCampaignPlan({ config, tasks: [task], environments });
  const second = buildCampaignPlan({ config, tasks: [task], environments });

  assert.equal(first.slots.length, 90);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.slots.map(({ slotId }) => slotId)).size, 90);
  assert.deepEqual(first.slots[0], {
    slotId: "mgds.task.key-exit@0.1.0::macos-arm64::codex::1337::1",
    campaignId: config.id,
    taskId: task.id,
    taskHash: task.hash,
    budgetHash: task.budgetHash,
    environmentHash: environments["macos-arm64"],
    requiredEvidence: task.evidence,
    buildTarget: task.buildTarget,
    host: "macos-arm64",
    harness: "codex",
    seed: 1337,
    repetition: 1,
  });
  assert.throws(
    () => buildCampaignPlan({ config, tasks: [task, task], environments }),
    /task identities must be unique/,
  );
});

test("campaign run attestation payload is canonical and complete", () => {
  const slot = buildCampaignPlan({ config, tasks: [task], environments }).slots[0];
  const run = passingRun(slot);

  assert.deepEqual(campaignRunAttestationPayload(run), run.evidenceAttestation.payload);
  const changed = { ...run, model: `${run.model}-changed` };
  assert.notEqual(canonical(campaignRunAttestationPayload(changed)), canonical(run.evidenceAttestation.payload));
});

test("campaign inputs are sealed from repository-owned task and environment bytes", async () => {
  const files = new Map([
    ["benchmarks/task.json", Buffer.from(JSON.stringify({ id: task.id, budgets: { wallMinutes: 45 }, evidence: task.evidence, terminal: { buildTarget: task.buildTarget } }))],
    ["profiles/benchmark.json", Buffer.from("sealed policy")],
    ["toolchains/unity.json", Buffer.from("sealed toolchain")],
  ]);
  const configured = {
    ...config,
    tasks: [{ id: task.id, path: "benchmarks/task.json" }],
    environmentInputs: ["profiles/benchmark.json", "toolchains/unity.json"],
  };

  const sealed = await sealCampaignInputs({
    config: configured,
    readFile: async (path) => files.get(path),
  });

  assert.deepEqual(sealed.tasks, [{
    id: task.id,
    hash: hash(files.get("benchmarks/task.json")),
    budgetHash: hash('{"wallMinutes":45}'),
    evidence: task.evidence,
    buildTarget: task.buildTarget,
  }]);
  assert.equal(Object.keys(sealed.environments).length, 3);
  assert.notEqual(sealed.environments["macos-arm64"], sealed.environments["linux-x64"]);
  await assert.rejects(
    sealCampaignInputs({ config: { ...configured, environmentInputs: ["../private"] }, readFile: async () => Buffer.alloc(0) }),
    /schema-valid|repository-relative/,
  );
});

test("campaign aggregation passes only a complete fair matrix", () => {
  const plan = buildCampaignPlan({ config, tasks: [task], environments });
  const result = aggregate(plan, plan.slots.map(passingRun));

  assert.equal(result.status, "pass");
  assert.deepEqual(result.metrics, {
    expectedRuns: 90,
    recordedRuns: 90,
    missingRuns: 0,
    validRuns: 90,
    t0PassRate: 1,
    seedAgreement: 1,
    orphanProcesses: 0,
    unknownWorkspaceStates: 0,
  });
  assert.deepEqual(result.failures, []);
});

test("normative campaign schemas accept reference plan, run, evidence, and result artifacts", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const [planSchema, runSchema, evidenceSchema, resultSchema] = await Promise.all([
    readFile("schemas/v0/campaign-plan.schema.json", "utf8").then(JSON.parse),
    readFile("schemas/v0/campaign-run.schema.json", "utf8").then(JSON.parse),
    readFile("schemas/v0/campaign-evidence.schema.json", "utf8").then(JSON.parse),
    readFile("schemas/v0/campaign-result.schema.json", "utf8").then(JSON.parse),
  ]);
  ajv.addSchema(planSchema);
  ajv.addSchema(runSchema);
  ajv.addSchema(evidenceSchema);
  ajv.addSchema(resultSchema);
  const plan = buildCampaignPlan({ config, tasks: [task], environments });
  const runs = plan.slots.map(passingRun);
  const result = aggregate(plan, runs);

  const validatePlan = ajv.getSchema(planSchema.$id);
  const validateRun = ajv.getSchema(runSchema.$id);
  const validateEvidence = ajv.getSchema(evidenceSchema.$id);
  const validateResult = ajv.getSchema(resultSchema.$id);
  assert.equal(validatePlan(plan), true, JSON.stringify(validatePlan.errors));
  assert.equal(validateRun(runs[0]), true, JSON.stringify(validateRun.errors));
  assert.equal(validateEvidence(JSON.parse(evidenceBundles.get(runs[0].evidenceHash))), true, JSON.stringify(validateEvidence.errors));
  assert.equal(validateResult(result), true, JSON.stringify(validateResult.errors));
  const pendingResult = JSON.parse(await readFile("results/p2/campaign.json", "utf8"));
  assert.equal(validateResult(pendingResult), true, JSON.stringify(validateResult.errors));
});

test("malformed run identities and metrics cannot be normalized into a pass", () => {
  const plan = buildCampaignPlan({ config, tasks: [task], environments });
  const runs = plan.slots.map(passingRun);
  runs[0] = { ...runs[0], runId: "bad", model: "", verdict: "yes", orphanProcesses: -1 };

  const result = aggregate(plan, runs);
  assert.equal(result.status, "invalid");
  assert.match(result.failures.join("\n"), /invalid run identity/);
  assert.match(result.failures.join("\n"), /model provenance missing/);
  assert.match(result.failures.join("\n"), /invalid verdict/);
  assert.match(result.failures.join("\n"), /invalid orphan process count/);
});

test("missing runs stay incomplete while duplicate or unexpected runs invalidate the campaign", () => {
  const plan = buildCampaignPlan({ config, tasks: [task], environments });
  const oneRun = passingRun(plan.slots[0]);

  const incomplete = aggregate(plan, [oneRun]);
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.metrics.recordedRuns, 1);
  assert.equal(incomplete.missingSlotIds.length, 89);

  const duplicate = aggregate(plan, [oneRun, oneRun]);
  assert.equal(duplicate.status, "invalid");
  assert.match(duplicate.failures.join("\n"), /duplicate slot/);

  const unexpected = aggregate(plan, [{ ...oneRun, slotId: "not-in-the-plan" }]);
  assert.equal(unexpected.status, "invalid");
  assert.match(unexpected.failures.join("\n"), /unexpected slot/);
});

test("sealed-input drift, private affordances, and unsafe cleanup fail closed", () => {
  const plan = buildCampaignPlan({ config, tasks: [task], environments });
  const runs = plan.slots.map(passingRun);
  runs[0] = {
    ...runs[0],
    taskHash: hash("substituted task"),
    environmentHash: hash("private environment"),
    privateAffordances: true,
    workspaceState: "unknown",
    orphanProcesses: 1,
  };

  const result = aggregate(plan, runs);
  assert.equal(result.status, "invalid");
  assert.match(result.failures.join("\n"), /task hash mismatch/);
  assert.match(result.failures.join("\n"), /environment hash mismatch/);
  assert.match(result.failures.join("\n"), /private affordance/);
  assert.match(result.failures.join("\n"), /orphan process threshold/);
  assert.match(result.failures.join("\n"), /unknown workspace state threshold/);
});

test("repeatability is reported per seeded run group and cannot be averaged away", () => {
  const smaller = { ...config, hosts: ["macos-arm64"], seeds: [1337], repeatRuns: 2 };
  const plan = buildCampaignPlan({ config: smaller, tasks: [task], environments });
  const runs = plan.slots.map(passingRun);
  runs.find(({ harness, repetition }) => harness === "codex" && repetition === 2).verdict = "invalid";

  const result = aggregate(plan, runs);
  assert.equal(result.status, "invalid");
  assert.equal(result.metrics.t0PassRate, 0.75);
  assert.equal(result.metrics.seedAgreement, 0.5);
  assert.match(result.failures.join("\n"), /pass-rate threshold/);
  assert.match(result.failures.join("\n"), /seed-agreement threshold/);
});

test("unsigned evaluator assertions and absent soak coverage cannot pass", () => {
  const smaller = { ...config, hosts: ["macos-arm64"], seeds: [1337], repeatRuns: 2 };
  const plan = buildCampaignPlan({ config: smaller, tasks: [task], environments });
  const unsigned = plan.slots.map(passingRun);
  delete unsigned[0].evidenceAttestation;
  delete unsigned[0].evaluator;

  const unsignedResult = aggregate(plan, unsigned);
  assert.equal(unsignedResult.status, "invalid");
  assert.match(unsignedResult.failures.join("\n"), /evaluator identity/);
  assert.match(unsignedResult.failures.join("\n"), /evidence attestation/);

  const noSoak = plan.slots.map((slot) => {
    const run = passingRun(slot);
    return signedRun(slot, { ...run, durationMinutes: 45, soak: false, evidenceAttestation: undefined });
  });
  const noSoakResult = aggregate(plan, noSoak);
  assert.equal(noSoakResult.status, "invalid");
  assert.match(noSoakResult.failures.join("\n"), /soak requirement/);
});

test("the evaluator signature covers every run provenance field", () => {
  const plan = buildCampaignPlan({ config, tasks: [task], environments });
  const runs = plan.slots.map(passingRun);
  runs[0] = { ...runs[0], model: "substituted-model" };

  const result = aggregate(plan, runs);
  assert.equal(result.status, "invalid");
  assert.match(result.failures.join("\n"), /invalid evidence attestation/);
});

test("campaign evidence is resolved by hash and its ledger and artifact bytes are replayed", () => {
  const plan = buildCampaignPlan({ config, tasks: [task], environments });
  const runs = plan.slots.map(passingRun);
  const missing = new Map(evidenceBundles);
  missing.delete(runs[0].evidenceHash);
  const missingResult = aggregateCampaign({ plan, runs, evaluatorAuthorities, trustedEvaluatorFingerprints, evidenceBundles: missing });
  assert.equal(missingResult.status, "invalid");
  assert.match(missingResult.failures.join("\n"), /evidence bundle missing/);

  const tampered = new Map(evidenceBundles);
  const value = JSON.parse(tampered.get(runs[0].evidenceHash));
  value.events[0].event.runId = "run_tampered_identity";
  tampered.set(runs[0].evidenceHash, Buffer.from(JSON.stringify(value)));
  const tamperedResult = aggregateCampaign({ plan, runs, evaluatorAuthorities, trustedEvaluatorFingerprints, evidenceBundles: tampered });
  assert.equal(tamperedResult.status, "invalid");
  assert.match(tamperedResult.failures.join("\n"), /evidence hash mismatch/);
});

test("campaign evidence indexes resolve only the declared repository-relative bundles", async () => {
  const plan = buildCampaignPlan({ config: { ...config, hosts: ["macos-arm64"], harnesses: ["codex"], seeds: [1337], repeatRuns: 2 }, tasks: [task], environments });
  const runs = plan.slots.map(passingRun);
  const index = {
    schema: "mgds.campaign-evidence-index/v1",
    bundles: runs.map((run, position) => ({ evidenceHash: run.evidenceHash, path: `artifacts/evidence/${position}.json` })),
  };
  const byPath = new Map(index.bundles.map((entry) => [entry.path, evidenceBundles.get(entry.evidenceHash)]));
  const readEvidenceFile = async (path) => byPath.get(path);
  const loaded = await loadCampaignEvidence({ plan, runs, index, readEvidenceFile });
  assert.equal(loaded.size, 2);

  await assert.rejects(
    loadCampaignEvidence({ plan, runs, index: { ...index, bundles: [{ ...index.bundles[0], path: "../private.json" }, index.bundles[1]] }, readEvidenceFile }),
    /schema-valid|repository-relative/,
  );
  await assert.rejects(
    loadCampaignEvidence({ plan, runs, index: { ...index, bundles: [index.bundles[0]] }, readEvidenceFile }),
    /missing evidence index entry/,
  );
  await assert.rejects(
    loadCampaignEvidence({ plan, runs: runs.slice(0, 1), index, readEvidenceFile }),
    /unexpected evidence index entry/,
  );
});

test("bounded evidence reads use one regular-file handle and enforce the byte cap", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "mgds-evidence-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "bundle.json");
  const link = join(directory, "bundle-link.json");
  await writeFile(file, "evidence");
  await symlink(file, link);

  assert.equal((await readBoundedEvidenceFile(file, 8)).toString(), "evidence");
  await assert.rejects(readBoundedEvidenceFile(file, 7), /size limit/);
  await assert.rejects(readBoundedEvidenceFile(link, 8), /regular evidence bundle/);
});

test("duplicate run identities and schema-undeclared run fields fail closed", () => {
  const plan = buildCampaignPlan({ config, tasks: [task], environments });
  const runs = plan.slots.map(passingRun);
  const duplicateBase = { ...runs[1], runId: runs[0].runId };
  delete duplicateBase.evidenceAttestation;
  runs[1] = signedWithEvidence(plan.slots[1], duplicateBase);
  runs[2] = { ...runs[2], unsignedExtraField: true };

  const result = aggregate(plan, runs);
  assert.equal(result.status, "invalid");
  assert.match(result.failures.join("\n"), /duplicate run identity/);
  assert.match(result.failures.join("\n"), /run schema invalid/);
});

test("task-required evidence roles, strict bundle schema, and privacy classification are enforced", () => {
  const smaller = { ...config, hosts: ["macos-arm64"], harnesses: ["codex"], seeds: [1337], repeatRuns: 1 };
  const plan = buildCampaignPlan({ config: smaller, tasks: [task], environments });
  const base = passingRun(plan.slots[0]);
  const unsignedBase = { ...base };
  delete unsignedBase.evidenceAttestation;

  const missingRole = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => ({ ...bundle, artifacts: bundle.artifacts.slice(0, -1) }));
  const missingResult = aggregate(plan, [missingRole]);
  assert.match(missingResult.failures.join("\n"), /required evidence roles/);

  const privateBundle = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const body = { sequence: 1, previousHash: "0".repeat(64), event: { ...bundle.events[0].event, note: "/Users/alice/private-game/Assets" } };
    return { ...bundle, events: [{ ...body, hash: hash(canonical(body)).slice(7) }] };
  });
  const privateResult = aggregate(plan, [privateBundle]);
  assert.match(privateResult.failures.join("\n"), /privacy rejected/);

  const privateCompile = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const bytes = Buffer.from(canonical({ schema: "mgds.compile-report/v1", status: "pass", diagnostics: [], transcript: "private agent text" }));
    return { ...bundle, artifacts: bundle.artifacts.map((artifact) => artifact.role === "compile" ? { ...artifact, bytesBase64: bytes.toString("base64"), hash: hash(bytes) } : artifact) };
  });
  assert.match(aggregate(plan, [privateCompile]).failures.join("\n"), /privacy rejected/);

  const unknownPrivacy = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => ({ ...bundle, privacy: { ...bundle.privacy, classification: "unknown" } }));
  const unknownResult = aggregate(plan, [unknownPrivacy]);
  assert.match(unknownResult.failures.join("\n"), /evidence bundle schema invalid/);

  const mislabeled = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const compile = bundle.artifacts.find(({ role }) => role === "compile");
    const mislabeledBytes = Buffer.from(`${Buffer.from(compile.bytesBase64, "base64").toString("utf8")} `);
    return { ...bundle, artifacts: bundle.artifacts.map((artifact) => artifact.role === "screenshot" ? { ...artifact, bytesBase64: mislabeledBytes.toString("base64"), hash: hash(mislabeledBytes) } : artifact) };
  });
  const mislabeledResult = aggregate(plan, [mislabeled]);
  assert.match(mislabeledResult.failures.join("\n"), /evidence content invalid for screenshot/);

  const truncatedPng = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.write("IHDR", 12, "ascii");
    bytes.writeUInt32BE(1, 16);
    bytes.writeUInt32BE(1, 20);
    return { ...bundle, artifacts: bundle.artifacts.map((artifact) => artifact.role === "screenshot" ? { ...artifact, bytesBase64: bytes.toString("base64"), hash: hash(bytes) } : artifact) };
  });
  assert.match(aggregate(plan, [truncatedPng]).failures.join("\n"), /evidence content invalid for screenshot/);

  const corruptPng = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const screenshot = bundle.artifacts.find(({ role }) => role === "screenshot");
    const bytes = Buffer.from(screenshot.bytesBase64, "base64");
    bytes[bytes.length - 1] ^= 1;
    return { ...bundle, artifacts: bundle.artifacts.map((artifact) => artifact.role === "screenshot" ? { ...artifact, bytesBase64: bytes.toString("base64"), hash: hash(bytes) } : artifact) };
  });
  assert.match(aggregate(plan, [corruptPng]).failures.join("\n"), /evidence content invalid for screenshot/);

  const missingPalette = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const bytes = indexedPngWithoutPalette();
    return { ...bundle, artifacts: bundle.artifacts.map((artifact) => artifact.role === "screenshot" ? { ...artifact, bytesBase64: bytes.toString("base64"), hash: hash(bytes) } : artifact) };
  });
  assert.match(aggregate(plan, [missingPalette]).failures.join("\n"), /evidence content invalid for screenshot/);

  const wrongBuild = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const player = bundle.artifacts.find(({ role }) => role === "player-build");
    const report = JSON.parse(Buffer.from(player.bytesBase64, "base64"));
    report.buildTarget = "mobile";
    report.files[0].name = "Game//player";
    const bytes = Buffer.from(canonical(report));
    return { ...bundle, artifacts: bundle.artifacts.map((artifact) => artifact.role === "player-build" ? { ...artifact, bytesBase64: bytes.toString("base64"), hash: hash(bytes) } : artifact) };
  });
  assert.match(aggregate(plan, [wrongBuild]).failures.join("\n"), /evidence content invalid for player-build/);

  const collidingBuildNames = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const player = bundle.artifacts.find(({ role }) => role === "player-build");
    const report = JSON.parse(Buffer.from(player.bytesBase64, "base64"));
    const secondBytes = Buffer.from("second player binary");
    report.files.push({ name: "game/PLAYER.bin", hash: hash(secondBytes), bytesBase64: secondBytes.toString("base64") });
    report.artifactHash = hash(canonical(report.files.map(({ name, hash: fileHash }) => ({ name, hash: fileHash }))));
    const bytes = Buffer.from(canonical(report));
    return { ...bundle, artifacts: bundle.artifacts.map((artifact) => artifact.role === "player-build" ? { ...artifact, bytesBase64: bytes.toString("base64"), hash: hash(bytes) } : artifact) };
  });
  assert.match(aggregate(plan, [collidingBuildNames]).failures.join("\n"), /evidence content invalid for player-build/);

  const trailingDotBuildName = signedWithEvidence(plan.slots[0], unsignedBase, (bundle) => {
    const player = bundle.artifacts.find(({ role }) => role === "player-build");
    const report = JSON.parse(Buffer.from(player.bytesBase64, "base64"));
    report.files[0].name = "Game/player.";
    report.artifactHash = hash(canonical(report.files.map(({ name, hash: fileHash }) => ({ name, hash: fileHash }))));
    const bytes = Buffer.from(canonical(report));
    return { ...bundle, artifacts: bundle.artifacts.map((artifact) => artifact.role === "player-build" ? { ...artifact, bytesBase64: bytes.toString("base64"), hash: hash(bytes) } : artifact) };
  });
  assert.match(aggregate(plan, [trailingDotBuildName]).failures.join("\n"), /evidence content invalid for player-build/);
});
