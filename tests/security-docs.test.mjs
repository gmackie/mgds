import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("threat model names trust boundaries, assets, attackers, and residual risk", () => {
  const path = "spec/v0/02-threat-model.html";
  assert.equal(existsSync(path), true, `missing ${path}`);
  const document = read(path);
  for (const section of [
    "Protected assets",
    "Threat actors",
    "Trust boundaries",
    "Required controls",
    "Residual limitations",
  ]) {
    assert.match(document, new RegExp(section));
  }
  for (const threat of ["MGDS-T01", "MGDS-T02", "MGDS-T03", "MGDS-T04", "MGDS-T05", "MGDS-T06"]) {
    assert.match(document, new RegExp(threat));
  }
});

test("privacy contract redacts prohibited data before persistence", () => {
  const path = "spec/v0/03-privacy.html";
  assert.equal(existsSync(path), true, `missing ${path}`);
  const document = read(path);
  for (const prohibited of [
    "Credential values",
    "Transcript text",
    "Personal identity",
    "Raw local paths",
    "Unrelated source",
    "Unbounded telemetry",
  ]) {
    assert.match(document, new RegExp(prohibited));
  }
  assert.match(document, /before persistence/i);
  assert.match(document, /previewed before signing or publication/i);
});

test("security policy provides private reporting without collecting secrets", () => {
  const path = "SECURITY.md";
  assert.equal(existsSync(path), true, `missing ${path}`);
  const policy = read(path);
  assert.match(policy, /Private vulnerability reporting/);
  assert.match(policy, /Do not include credentials, tokens, private project data, or personal information/);
  assert.match(policy, /Supported versions/);
});

test("abuse fixture index covers every Phase 0 attack class", () => {
  const path = "fixtures/abuse/index.json";
  assert.equal(existsSync(path), true, `missing ${path}`);
  const index = JSON.parse(read(path));
  const categories = new Set(index.scenarios.map((scenario) => scenario.category));
  assert.deepEqual(categories, new Set([
    "credentials",
    "raw-paths",
    "command-injection",
    "stale-approval",
    "dependency-confusion",
    "evaluator-tampering",
  ]));
  assert.ok(index.scenarios.every((scenario) => scenario.synthetic === true));
  assert.doesNotMatch(JSON.stringify(index), /mackieg|forgegraf|ghp_|sk-[A-Za-z0-9]/i);
});
