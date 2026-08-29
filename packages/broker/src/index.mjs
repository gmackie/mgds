import { randomBytes } from "node:crypto";

export class SecretBroker {
  #secrets = new Map();
  constructor({ destinations = [], now = Date.now } = {}) { this.destinations = new Set(destinations); this.now = now; }
  issue(value, ttlMs = 60000) {
    if (typeof value !== "string" || value.length === 0) throw new Error("secret value required");
    if (ttlMs < 1 || ttlMs > 3600000) throw new Error("secret TTL out of range");
    const handle = `sec_${randomBytes(16).toString("hex")}`;
    this.#secrets.set(handle, { value, expiresAt: this.now() + ttlMs });
    return handle;
  }
  resolve(handle, destination, at = this.now()) {
    if (!this.destinations.has(destination)) throw new Error("destination is not allowlisted");
    const secret = this.#secrets.get(handle);
    if (!secret || at >= secret.expiresAt) throw new Error("secret handle expired or unknown");
    return secret.value;
  }
  revoke(handle) { this.#secrets.delete(handle); }
}
