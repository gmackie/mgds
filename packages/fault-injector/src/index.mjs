const faults = {
  "stale-import": (x) => ({ code: "MGDS_STALE_IMPORT", retryable: true, asset: x.asset ?? null }),
  "compile-failure": (x) => ({ code: "MGDS_COMPILE_FAILURE", retryable: false, diagnosticCount: x.diagnosticCount ?? 1 }),
  "moved-asset": (x) => ({ code: "MGDS_MOVED_ASSET", retryable: true, asset: x.asset ?? null }),
  "missing-reference": () => ({ code: "MGDS_MISSING_REFERENCE", retryable: false }),
  "scene-divergence": () => ({ code: "MGDS_SCENE_DIVERGENCE", retryable: false }),
  "package-failure": () => ({ code: "MGDS_PACKAGE_FAILURE", retryable: true }),
  crash: () => ({ code: "MGDS_PROCESS_CRASH", retryable: true }),
  timeout: () => ({ code: "MGDS_TIMEOUT", retryable: true }),
  "port-collision": (x) => ({ code: "MGDS_PORT_COLLISION", retryable: true, port: x.port }),
  disconnect: () => ({ code: "MGDS_DISCONNECT", retryable: true }),
  "insufficient-authority": () => ({ code: "MGDS_AUTHORITY_DENIED", retryable: false }),
};
export function injectFault(name, context = {}) { if (!faults[name]) throw new Error(`Unknown fault: ${name}`); return faults[name](context); }
export const faultNames = Object.freeze(Object.keys(faults).sort());
