import { createHash, sign, verify } from "node:crypto";

import { canonical } from "@mgds/attestation";
import { assertPublishable } from "@mgds/redaction";

const HASH = /^sha256:[a-f0-9]{64}$/;

export function buildP3Submission({ manifest, artifacts, authority, privateKey }) {
  assertPublishable(manifest);
  validateManifest(manifest);
  if (!/^mgds\.submitter\.[a-z0-9.-]+@[0-9]+\.[0-9]+\.[0-9]+$/.test(authority ?? "") || !privateKey || !artifacts || typeof artifacts !== "object" || Array.isArray(artifacts)) {
    throw new Error("submitter authority, private key, and artifacts are required");
  }
  const seen = new Set();
  const encoded = Object.entries(artifacts).sort(([left], [right]) => left.localeCompare(right)).map(([path, value]) => {
    validateArtifactPath(path);
    const portable = path.toLowerCase();
    if (seen.has(portable)) throw new Error(`duplicate portable artifact path: ${path}`);
    seen.add(portable);
    const bytes = Buffer.from(value);
    if (bytes.length === 0 || bytes.length > 64 * 1024 * 1024) throw new Error(`artifact size invalid: ${path}`);
    assertArtifactPublishable(bytes);
    return { path, hash: digest(bytes), bytesBase64: bytes.toString("base64") };
  });
  if (encoded.length === 0 || encoded.length > 1024) throw new Error("one to 1024 artifacts are required");
  const payload = { manifest: structuredClone(manifest), artifacts: encoded.map(({ path, hash }) => ({ path, hash })), authority };
  const payloadHash = digest(canonical(payload));
  const bundle = {
    schema: "mgds.p3-bundle/v1",
    manifest: payload.manifest,
    artifacts: encoded,
    attestation: {
      algorithm: "Ed25519",
      authority,
      payloadHash,
      signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString("base64url"),
    },
  };
  assertPublishable(bundle);
  const bytes = Buffer.from(JSON.stringify(bundle));
  return { bundle, bytes, bundleHash: digest(bytes) };
}

export function verifyP3Submission({ bytes, publicKey }) {
  const encoded = Buffer.from(bytes ?? []);
  if (encoded.length === 0 || encoded.length > 256 * 1024 * 1024 || !publicKey) throw new Error("bounded submission bytes and public key are required");
  let bundle;
  try { bundle = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(encoded)); } catch { throw new Error("submission JSON invalid"); }
  if (!exactKeys(bundle, ["artifacts", "attestation", "manifest", "schema"]) || bundle.schema !== "mgds.p3-bundle/v1" || !Array.isArray(bundle.artifacts) || bundle.artifacts.length === 0) throw new Error("submission bundle invalid");
  validateManifest(bundle.manifest);
  assertPublishable(bundle);
  const identities = [];
  const seen = new Set();
  for (const artifact of bundle.artifacts) {
    if (!exactKeys(artifact, ["bytesBase64", "hash", "path"])) throw new Error("artifact identity invalid");
    validateArtifactPath(artifact?.path);
    const portable = artifact.path.toLowerCase();
    if (seen.has(portable) || !HASH.test(artifact.hash ?? "") || typeof artifact.bytesBase64 !== "string") throw new Error("artifact identity invalid");
    const artifactBytes = Buffer.from(artifact.bytesBase64, "base64");
    if (artifactBytes.length === 0 || artifactBytes.toString("base64") !== artifact.bytesBase64 || digest(artifactBytes) !== artifact.hash) throw new Error(`artifact hash mismatch: ${artifact.path}`);
    assertArtifactPublishable(artifactBytes);
    seen.add(portable);
    identities.push({ path: artifact.path, hash: artifact.hash });
  }
  if (!exactKeys(bundle.attestation, ["algorithm", "authority", "payloadHash", "signature"])) throw new Error("submission signature invalid");
  const payload = { manifest: bundle.manifest, artifacts: identities, authority: bundle.attestation.authority };
  if (
    bundle.attestation?.algorithm !== "Ed25519"
    || digest(canonical(payload)) !== bundle.attestation.payloadHash
    || !verify(null, Buffer.from(canonical(payload)), publicKey, Buffer.from(bundle.attestation?.signature ?? "", "base64url"))
  ) throw new Error("submission signature invalid");
  return { status: "verified", submissionId: bundle.manifest.submissionId, bundleHash: digest(encoded), artifacts: identities.length };
}

function validateManifest(value) {
  if (
    !exactKeys(value, ["adapter", "evaluator", "eventLedgerHead", "host", "privacy", "protocolVersion", "schema", "submissionId", "t0", "tasks", "toolchain"])
    || value.schema !== "mgds.p3-submission/v1"
    || !/^mgds\.submission\.[a-z0-9.-]+@[0-9]+\.[0-9]+\.[0-9]+$/.test(value.submissionId ?? "")
    || !/^0\.1\.0-preview\.[1-9][0-9]*$/.test(value.protocolVersion ?? "")
    || !exactKeys(value.adapter, ["id", "sourceRevision"])
    || !/^mgds\.adapter\.[a-z0-9.-]+@[0-9]+\.[0-9]+\.[0-9]+$/.test(value.adapter?.id ?? "")
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value.adapter?.sourceRevision ?? "")
    || !exactKeys(value.toolchain, ["unity"]) || typeof value.toolchain?.unity !== "string"
    || !["macos-arm64", "linux-x64", "windows-x64"].includes(value.host)
    || !exactKeys(value.t0, ["reportHash", "status"]) || value.t0?.status !== "pass" || !HASH.test(value.t0?.reportHash ?? "")
    || !Array.isArray(value.tasks) || value.tasks.length === 0
    || value.tasks.some((task) => !exactKeys(task, ["evidenceHash", "status", "taskId"]) || task?.status !== "pass" || !HASH.test(task?.evidenceHash ?? ""))
    || !/^[a-f0-9]{64}$/.test(value.eventLedgerHead ?? "")
    || !exactKeys(value.evaluator, ["digest", "id"]) || !/^mgds\.evaluator\.[a-z0-9.-]+@[0-9]+\.[0-9]+\.[0-9]+$/.test(value.evaluator?.id ?? "")
    || !HASH.test(value.evaluator?.digest ?? "")
    || !exactKeys(value.privacy, ["classification", "redactionVersion"]) || value.privacy?.classification !== "public-redacted" || value.privacy?.redactionVersion !== "mgds.redaction/v1"
  ) throw new Error("P3 submission manifest invalid");
}

function validateArtifactPath(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 240 || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === ".." || !/^[A-Za-z0-9._-]+$/.test(part))) {
    throw new Error(`portable artifact path required: ${path}`);
  }
}

function assertArtifactPublishable(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return; }
  assertPublishable(text);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && canonical(Object.keys(value).sort()) === canonical(keys);
}

function digest(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
