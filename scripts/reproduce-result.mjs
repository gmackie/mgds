import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export function reproduceResult({ artifacts }) {
  const checks = artifacts.map(({ bytes, hash }) => ({ hash, verified: `sha256:${createHash("sha256").update(bytes).digest("hex")}` === hash }));
  return { status: checks.every((x) => x.verified) ? "verified" : "invalid", checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write("Use the library API with sealed artifact bytes; filesystem ingestion is intentionally explicit.\n");
}
