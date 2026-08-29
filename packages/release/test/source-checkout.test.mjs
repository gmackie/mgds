import assert from "node:assert/strict";
import test from "node:test";

import { sourceBoundReleaseInputs, verifyReleaseCheckout } from "../src/source-checkout.mjs";

const sourceDigest = "a".repeat(40);

test("release checkout verification pins HEAD, cleanliness, and every tracked input", async () => {
  const calls = [];
  const result = await verifyReleaseCheckout({
    expectedSourceDigest: sourceDigest,
    inputPaths: ["versions/candidate.json", "results/p2/runs.json"],
    runGit: async (args) => {
      calls.push(args);
      if (args[0] === "rev-parse") return `${sourceDigest}\n`;
      if (args[0] === "status") return "";
      return "100644 abc 0\tversions/candidate.json\n100644 def 0\tresults/p2/runs.json\n";
    },
  });
  assert.deepEqual(result, { headDigest: sourceDigest, clean: true, trackedInputsVerified: true });
  assert.deepEqual(calls.at(-1), ["ls-files", "--stage", "--error-unmatch", "--", "versions/candidate.json", "results/p2/runs.json"]);
});

test("source-bound inputs exclude detached review, authority, and signing artifacts", () => {
  const paths = sourceBoundReleaseInputs({
    options: {
      candidate: "versions/candidate.json", config: "campaigns/p2/campaign.json", runs: "results/p2/runs.json",
      evidence: "results/p2/evidence.json", hosts: "results/p2/host-t0.json", evaluators: "versions/evaluators.json",
      review: "artifacts/release/review.json", "review-report": "artifacts/release/review.html",
      signing: "artifacts/release/signing.json", reviewers: "artifacts/release/reviewers.json",
      "release-authorities": "artifacts/release/release-authorities.json",
    },
    config: { tasks: [{ path: "benchmarks/task.json" }], environmentInputs: ["profiles/policy.json"] },
    evidenceIndex: { bundles: [{ path: "results/p2/evidence/run.json" }] },
  });
  assert.deepEqual(paths, [
    "versions/candidate.json", "campaigns/p2/campaign.json", "results/p2/runs.json", "results/p2/evidence.json",
    "results/p2/host-t0.json", "versions/evaluators.json", "benchmarks/task.json", "profiles/policy.json",
    "results/p2/evidence/run.json",
  ]);
});

test("release checkout verification rejects traversal, dirty state, mismatched HEAD, and untracked inputs", async () => {
  await assert.rejects(
    verifyReleaseCheckout({ expectedSourceDigest: sourceDigest, inputPaths: ["../other"], runGit: async () => "" }),
    /repository-relative/,
  );
  await assert.rejects(
    verifyReleaseCheckout({ expectedSourceDigest: sourceDigest, inputPaths: ["a"], runGit: async (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "" }),
    /HEAD does not match/,
  );
  await assert.rejects(
    verifyReleaseCheckout({ expectedSourceDigest: sourceDigest, inputPaths: ["a"], runGit: async (args) => args[0] === "rev-parse" ? `${sourceDigest}\n` : args[0] === "status" ? " M a\n" : "a\n" }),
    /checkout is not clean/,
  );
  await assert.rejects(
    verifyReleaseCheckout({ expectedSourceDigest: sourceDigest, inputPaths: ["a"], runGit: async (args) => args[0] === "rev-parse" ? `${sourceDigest}\n` : args[0] === "status" ? "" : Promise.reject(new Error("not tracked")) }),
    /tracked regular file/,
  );
  await assert.rejects(
    verifyReleaseCheckout({ expectedSourceDigest: sourceDigest, inputPaths: ["a"], runGit: async (args) => args[0] === "rev-parse" ? `${sourceDigest}\n` : args[0] === "status" ? "" : "120000 abc 0\ta\n" }),
    /regular file/,
  );
});
