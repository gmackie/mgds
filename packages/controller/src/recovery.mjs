export class RecoveryRegistry {
  #records = new Map();
  register(id, kind, startedAt) { this.#records.set(id, { id, kind, startedAt, state: "running" }); }
  reconcile(liveIds, at) {
    const orphans = [];
    for (const record of this.#records.values()) if (record.state === "running" && !liveIds.has(record.id)) { record.state = "terminated"; record.endedAt = at; orphans.push(record.id); }
    return { state: [...this.#records.values()].every((x) => x.state !== "running") ? "known-clean" : "known-active", terminated: orphans.sort() };
  }
}
