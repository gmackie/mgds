import { createHash } from "node:crypto";

const SOURCE_DIGEST = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

export async function verifyHostEvidenceEntries({ entries, expectedSourceDigest, readFile, runGhVerify }) {
  if (!Array.isArray(entries) || typeof readFile !== "function" || typeof runGhVerify !== "function") {
    throw new Error("host entries, byte reader, and GitHub verifier are required");
  }
  if (!SOURCE_DIGEST.test(expectedSourceDigest ?? "")) throw new Error("release source digest required");
  const verified = [];
  for (const entry of entries) {
    if (typeof entry?.artifactPath !== "string" || entry.artifactPath.length === 0) throw new Error("artifact path required");
    const bytes = Buffer.from(await readFile(entry.artifactPath));
    const artifact = JSON.parse(bytes.toString("utf8"));
    if (artifact.host !== entry.host) throw new Error(`host mismatch for ${entry.host}`);
    if (!validT0Adapters(artifact.adapters)) throw new Error(`invalid T0 adapter verdicts for ${entry.host}`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const attestations = await runGhVerify(entry.artifactPath, expectedSourceDigest);
    const match = attestations?.find(({ verificationResult }) => verificationResult?.statement?.subject?.some(({ digest }) => digest?.sha256 === sha256));
    if (!match) throw new Error(`verified subject digest missing for ${entry.host}`);
    verified.push({
      host: entry.host,
      status: "pass",
      artifactHash: `sha256:${sha256}`,
      attestationVerified: true,
      repository: "gmackie/mgds",
      workflowRef: "gmackie/mgds/.github/workflows/conformance.yml@refs/heads/main",
      subjectDigest: `sha256:${sha256}`,
      verificationDigest: `sha256:${createHash("sha256").update(JSON.stringify({
        repository: "gmackie/mgds",
        workflowRef: "gmackie/mgds/.github/workflows/conformance.yml@refs/heads/main",
        sourceDigest: expectedSourceDigest,
        subjectDigest: `sha256:${sha256}`,
      })).digest("hex")}`,
      sourceDigest: expectedSourceDigest,
    });
  }
  return verified;
}

function validT0Adapters(adapters) {
  return ["fake", "unity", "gmacko"].every((name) => adapters?.[name]?.status === "pass")
    && adapters?.broken?.status === "fail";
}
