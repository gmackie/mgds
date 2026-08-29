const SECRET_KEYS = /token|secret|password|credential|authorization/i;
const PATH_KEYS = /path|directory|cwd/i;
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function redactForEvidence(value, { maxDepth = 8, maxItems = 1000, maxString = 8192 } = {}, depth = 0, state = { items: 0 }) {
  if (depth > maxDepth) return "[TRUNCATED_DEPTH]";
  if (++state.items > maxItems) return "[TRUNCATED_ITEMS]";
  if (typeof value === "string") return value.replace(ANSI, "").slice(0, maxString);
  if (Array.isArray(value)) return value.slice(0, maxItems).map((x) => redactForEvidence(x, { maxDepth, maxItems, maxString }, depth + 1, state));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, maxItems).map(([key, item]) => {
    if (SECRET_KEYS.test(key)) return [key, "[REDACTED]"];
    if (PATH_KEYS.test(key)) return [key, "[REDACTED_PATH]"];
    return [key, redactForEvidence(item, { maxDepth, maxItems, maxString }, depth + 1, state)];
  }));
}
