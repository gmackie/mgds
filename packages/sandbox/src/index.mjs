export class SandboxPolicy {
  constructor(profile, config) {
    if (!["benchmark", "project"].includes(profile)) throw new Error("unknown sandbox profile");
    this.profile = profile; this.config = structuredClone(config);
  }
  authorizePath(path) {
    if (this.profile === "benchmark" && !path.startsWith("/workspace/")) throw new Error("benchmark writes require disposable workspace paths");
    if (this.profile === "project" && path.includes("..")) throw new Error("project path escape denied");
    return true;
  }
  authorizeNetwork(origin) {
    if (!this.config.network?.includes(origin)) throw new Error("network destination denied");
    return true;
  }
}
