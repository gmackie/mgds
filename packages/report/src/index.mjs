export function renderConformanceReport(result) {
  const ordered = [...result.clauses].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ profile: result.profile, status: result.status, clauses: ordered });
}
