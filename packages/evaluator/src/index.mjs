import { createHash, timingSafeEqual } from "node:crypto";

export function evaluateSubmission({ taskBytes, expectedTaskHash, evaluatorId, expectedEvaluatorId, evidence, hiddenChecks }) {
  requireHash(taskBytes, expectedTaskHash, "task");
  if (evaluatorId !== expectedEvaluatorId) throw new Error("evaluator identity mismatch");
  if (!Array.isArray(evidence) || !Array.isArray(hiddenChecks)) throw new TypeError("evidence and hidden checks are required");
  for (const item of evidence) {
    if (item.authority !== "evaluator") throw new Error("evidence authority must be evaluator");
    requireHash(item.bytes, item.hash, "evidence");
  }
  const checks = hiddenChecks.map((check, index) => ({ id: `hidden-${index + 1}`, passed: check({ evidence }) === true }));
  return { ok: checks.every((x) => x.passed), evaluatorId, checks };
}

function requireHash(bytes, expected, label) {
  const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const left = Buffer.from(actual);
  const right = Buffer.from(String(expected));
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error(`${label} hash mismatch`);
}
