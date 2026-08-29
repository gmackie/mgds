import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  ".node-version",
  ".python-version",
  "pyproject.toml",
  "uv.lock",
  "global.json",
  ".github/workflows/ci.yml",
  "schemas/smoke.schema.json",
  "fixtures/smoke.valid.json",
  "fixtures/smoke.invalid.json",
  "scripts/validate-smoke.mjs",
];

test("repository pins every public toolchain and smoke artifact", () => {
  for (const file of requiredFiles) {
    assert.equal(existsSync(file), true, `missing ${file}`);
  }

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.packageManager, "pnpm@11.10.0");
  assert.match(packageJson.scripts.test, /packages\/\*\/test/);
  assert.equal(readFileSync(".node-version", "utf8").trim(), "24.20.0");
  assert.equal(readFileSync(".python-version", "utf8").trim(), "3.14.6");
  assert.equal(JSON.parse(readFileSync("global.json", "utf8")).sdk.version, "10.0.302");
});

test("CI runs the smoke contract on the three required hosts", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  for (const runner of ["macos-14", "ubuntu-22.04", "windows-2025"]) {
    assert.match(workflow, new RegExp(runner.replace("-", "\\-")));
  }
  assert.match(workflow, /pnpm validate:smoke/);
});

test("CI installs pnpm before setup-node initializes the pnpm cache", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const pnpmSetup = workflow.indexOf("pnpm/action-setup@v4");
  const nodeSetup = workflow.indexOf("actions/setup-node@v5");
  assert.ok(pnpmSetup >= 0, "pnpm setup action is missing");
  assert.ok(pnpmSetup < nodeSetup, "pnpm must exist before setup-node resolves the pnpm cache");
});

test("schema smoke accepts the valid fixture and rejects the invalid fixture", () => {
  const run = spawnSync(process.execPath, ["scripts/validate-smoke.mjs"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /valid fixture: accepted/);
  assert.match(run.stdout, /invalid fixture: rejected/);
});

test("runtime artifact ignores do not hide the source artifact package", () => {
  const ignore = readFileSync(".gitignore", "utf8");
  assert.doesNotMatch(ignore, /^artifacts\/$/m);
  assert.match(ignore, /^\/artifacts\/$/m);
  assert.equal(existsSync("packages/artifacts/src/artifact-store.mjs"), true);
});

test("Unity UPM packages are not treated as npm workspaces", () => {
  const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
  assert.doesNotMatch(workspace, /Packages\/\*/);
});
