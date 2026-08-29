// Generated from schemas/v0 by tools/codegen/generate.mjs. Do not edit.

export interface MgdsResource {
  id: string;
  projectScope: string;
  generation: number;
  kind: "project" | "asset" | "scene" | "entity" | "component" | "player" | "artifact" | "job";
  displayLabel?: string;
  contentHash?: string;
}

export interface MgdsCapability {
  id: string;
  summary: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  preconditions: Array<"editor-ready" | "compiled" | "play-mode" | "development-player" | "build-support" | "network-lease">;
  effects: Array<"read" | "project-write" | "scene-write" | "play-state" | "build" | "network" | "process">;
  risk: "read" | "bounded-write" | "elevated" | "irreversible";
  authority: { scope: "project" | "workspace" | "host" | "network"; mutates: boolean; reversible: boolean; approval: "none" | "policy" | "exact" };
  units: { time: "second"; distance: "meter"; angle: "degree"; frame: "unity-world-left-handed-y-up" | "screen-pixels-top-left" | "not-applicable" };
  idempotency: "safe" | "key-required" | "never";
  deprecated?: boolean;
}

export interface MgdsManifest {
  schemaVersion: "0.1.0";
  adapter: { id: string; version: string; digest: string };
  project: { scope: string; generation: number };
  capabilities: Array<MgdsCapability>;
}

export interface MgdsProcedure {
  id: string;
  capabilityId: string;
  idempotency: "safe" | "key-required" | "never";
  idempotencyKey?: string;
  inputs: Record<string, unknown>;
  timeoutSeconds: number;
  requestedBudget?: Record<string, unknown>;
}

export interface MgdsJob {
  id: string;
  procedureId: string;
  projectScope: string;
  state: "queued" | "granted" | "running" | "checkpointed" | "cancelling" | "succeeded" | "failed" | "cancelled" | "timed-out" | "expired";
  attempt: number;
  createdAt: string;
  updatedAt: string;
  terminalError?: string;
  resultHash?: string;
}

export interface MgdsEvent {
  jobId: string;
  sequence: number;
  type: "transition" | "execution-started" | "checkpoint" | "artifact" | "diagnostic";
  at: string;
  from?: "queued" | "granted" | "running" | "checkpointed" | "cancelling" | "succeeded" | "failed" | "cancelled" | "timed-out" | "expired";
  to?: "queued" | "granted" | "running" | "checkpointed" | "cancelling" | "succeeded" | "failed" | "cancelled" | "timed-out" | "expired";
  attempt?: number;
  payload?: Record<string, unknown>;
}

export interface MgdsPolicy {
  version: 1;
  defaultDecision: "deny";
  grants: Array<{ capabilityId: string; projectScope: string; riskCeiling: "read" | "bounded-write" | "elevated" | "irreversible"; expiresAt: string; budget: MgdsBudget }>;
}

export interface MgdsApproval {
  id: string;
  requestHash: string;
  projectScope: string;
  riskCeiling: "read" | "bounded-write" | "elevated" | "irreversible";
  approverRef: string;
  expiresAt: string;
  signature: string;
}

export interface MgdsLease {
  id: string;
  projectScope: string;
  holder: string;
  generation: number;
  capabilityIds: Array<string>;
  issuedAt: string;
  expiresAt: string;
}

export interface MgdsBudget {
  wallTimeSeconds: number;
  cpuTimeSeconds?: number;
  artifactBytes: number;
  networkRequests: number;
  retries: number;
}

export interface MgdsTask {
  id: string;
  title: string;
  description: string;
  requiredCapabilities: Array<string>;
  fixtureHash: string;
  inputsHash: string;
  evaluatorProfile: string;
  seed?: number;
}

export interface MgdsRun {
  id: string;
  taskId: string;
  taskHash: string;
  controllerDigest: string;
  adapterDigest: string;
  evaluatorDigest: string;
  policyHash: string;
  unityVersion: string;
  agent: { harness: string; model: string; budgetHash: string };
  seed: number;
  startedAt: string;
}

export interface MgdsArtifact {
  id: string;
  logicalName: string;
  mediaType: string;
  sha256: string;
  bytes: number;
  truncated?: boolean;
}

export interface MgdsEvidence {
  runId: string;
  artifacts: Array<string>;
  eventsHash: string;
  redactionVersion: string;
}

export interface MgdsResult {
  runId: string;
  verdict: "valid" | "invalid" | "inconclusive";
  evaluator: { id: string; digest: string; authority: "independent-evaluator" };
  scores: Record<string, unknown>;
  evidenceHash: string;
  limitations?: Array<string>;
}

export interface MgdsConformance {
  id: string;
  profile: string;
  subject: { adapterId: string; digest: string };
  clauses: Array<{ id: string; status: "pass" | "fail" | "not-run"; evidenceHash: string; reason?: string }>;
  summary: { passed: number; failed: number; notRun: number };
  createdAt: string;
}
