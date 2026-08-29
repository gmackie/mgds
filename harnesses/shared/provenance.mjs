export function buildHarnessProvenance({ harness, model, taskHash, wallMinutes, environment = "mgds" }) {
  if (!["codex", "claude-code"].includes(harness)) throw new Error("unsupported harness");
  if (!/^sha256:[a-f0-9]{64}$/.test(taskHash)) throw new Error("sealed task hash required");
  if (!(wallMinutes > 0 && wallMinutes <= 240)) throw new Error("wall budget out of range");
  return { schema: "mgds.harness-provenance/v1", harness, model, taskHash, environment, budget: { wallMinutes }, privateAffordances: false };
}
