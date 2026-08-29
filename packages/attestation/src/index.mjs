import { generateKeyPairSync, sign, verify } from "node:crypto";

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function createAttestation(payload, privateKey) {
  let publicKey;
  if (!privateKey) ({ privateKey, publicKey } = generateKeyPairSync("ed25519"));
  else publicKey = null;
  const signature = sign(null, Buffer.from(canonical(payload)), privateKey).toString("base64url");
  return { attestation: { algorithm: "Ed25519", payload: structuredClone(payload), signature }, publicKey };
}

export function verifyAttestation(attestation, publicKey) {
  try { return attestation.algorithm === "Ed25519" && verify(null, Buffer.from(canonical(attestation.payload)), publicKey, Buffer.from(attestation.signature, "base64url")); }
  catch { return false; }
}
