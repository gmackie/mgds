const SOURCE_DIGEST = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

export async function verifyReleaseCheckout({ expectedSourceDigest, inputPaths, runGit }) {
  if (!SOURCE_DIGEST.test(expectedSourceDigest ?? "") || !Array.isArray(inputPaths) || inputPaths.length === 0 || typeof runGit !== "function") {
    throw new Error("release source digest, input paths, and Git reader are required");
  }
  for (const path of inputPaths) validateRepositoryPath(path);
  const uniquePaths = [...new Set(inputPaths)];
  const headDigest = String(await runGit(["rev-parse", "HEAD"])).trim();
  if (headDigest !== expectedSourceDigest) throw new Error("release checkout HEAD does not match source digest");
  const status = String(await runGit(["status", "--porcelain=v1", "--untracked-files=all"]));
  if (status.trim().length > 0) throw new Error("release checkout is not clean");
  try {
    const staged = String(await runGit(["ls-files", "--stage", "--error-unmatch", "--", ...uniquePaths]));
    const modes = new Map(staged.trim().split("\n").filter(Boolean).map((line) => {
      const match = /^(\d{6}) [a-f0-9]+ \d+\t(.+)$/.exec(line);
      return match ? [match[2], match[1]] : ["", ""];
    }));
    if (uniquePaths.some((path) => modes.get(path) !== "100644")) throw new Error("non-regular input");
  } catch {
    throw new Error("release input is not a tracked regular file in the source commit");
  }
  return { headDigest, clean: true, trackedInputsVerified: true };
}

export function sourceBoundReleaseInputs({ options, config, evidenceIndex }) {
  return [
    options.candidate,
    options.config,
    options.runs,
    options.evidence,
    options.hosts,
    options.evaluators,
    ...(config?.tasks ?? []).map(({ path }) => path),
    ...(config?.environmentInputs ?? []),
    ...(evidenceIndex?.bundles ?? []).map(({ path }) => path),
  ];
}

function validateRepositoryPath(path) {
  if (typeof path !== "string" || path.length === 0 || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`repository-relative release input required: ${path}`);
  }
}
