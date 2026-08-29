const CLAUSES = [
  ["T0-MANIFEST", "manifest"],
  ["T0-BOUNDS", "bounds"],
  ["T0-CANCEL", "cancellation"],
  ["T0-PRIVACY", "privacy"],
  ["T0-EVIDENCE", "evidence"],
];

export function runT0(adapter) {
  const clauses = CLAUSES.map(([id, field]) => ({ id, status: adapter?.[field] === true ? "pass" : "fail" }));
  return { profile: "mgds.t0@0.1.0", status: clauses.every((x) => x.status === "pass") ? "pass" : "fail", clauses };
}
