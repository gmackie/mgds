const SECRET_KEYS = /token|secret|password|credential|authorization/i;
const PATH_KEYS = /path|directory|cwd/i;
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const PROHIBITED_KEY = /(?:transcript|email|username|rawPath|secret|credential|token)/i;
const PROHIBITED_VALUE = /(?:\u001b\[[0-?]*[ -/]*[@-~]|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|file:\/\/\/(?:Users|home|Volumes|tmp|private|var|opt|mnt|srv|workspace)\/[^\s"')]+|(?:^|[\s"'(=:])\/(?:Users|home|Volumes|tmp|private|var|opt|mnt|srv|workspace)\/[^\s"')]+|[A-Za-z]:[\\/][^\s"']+|\\\\[^\\\s]+\\[^\\\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

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

export function assertPublishable(value) {
  const visit = (current, path) => {
    if (typeof current === "string" && PROHIBITED_VALUE.test(current)) throw new Error(`MGDS_PRIVACY_REJECTED:${path}`);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, item] of Object.entries(current)) {
        if (PROHIBITED_KEY.test(key)) throw new Error(`MGDS_PRIVACY_REJECTED:${path}.${key}`);
        visit(item, `${path}.${key}`);
      }
    }
  };
  visit(value, "$");
  return true;
}
