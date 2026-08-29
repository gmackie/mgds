import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("terminology defines the normative MGDS vocabulary", () => {
  const path = "spec/v0/00-terminology.html";
  assert.equal(existsSync(path), true, `missing ${path}`);
  const document = read(path);
  for (const term of [
    "Controller",
    "Unity adapter",
    "Player probe",
    "Evaluation sandbox",
    "Capability",
    "Procedure",
    "Project workspace",
    "Artifact",
  ]) {
    assert.match(document, new RegExp(`>${term}<`));
  }
  assert.match(document, /MUST NOT use “Unity CLI” as an MGDS component name/);
});

test("architecture separates the six components and four state planes", () => {
  const path = "spec/v0/01-architecture.html";
  assert.equal(existsSync(path), true, `missing ${path}`);
  const document = read(path);
  for (const component of [
    "Controller",
    "Unity adapter",
    "Player probe",
    "Task harness",
    "Evaluation sandbox",
    "Artifact store",
  ]) {
    assert.match(document, new RegExp(component));
  }
  for (const plane of [
    "Repository and artifact plane",
    "Authoring and import plane",
    "Gameplay and runtime plane",
    "Independent evaluation plane",
  ]) {
    assert.match(document, new RegExp(plane));
  }
  assert.match(document, /schema and lifecycle contract are canonical/i);
});

test("registry policy reserves MGDS namespaces without redefining Unity terms", () => {
  const path = "spec/v0/registry.md";
  assert.equal(existsSync(path), true, `missing ${path}`);
  const registry = read(path);
  assert.match(registry, /mgds\.unity\./);
  assert.match(registry, /org\.mgds\.unity\./);
  for (const collision of ["Unity CLI", "Pipeline", "Agent", "PlayMode", "MCP server"]) {
    assert.match(registry, new RegExp(`\\| ${collision.replace(" ", " ")} \\|`));
  }
});
