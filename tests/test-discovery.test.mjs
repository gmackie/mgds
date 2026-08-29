import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the workspace test command discovers direct and nested package tests", async () => {
  const workspace = JSON.parse(await readFile("package.json", "utf8"));
  assert.match(workspace.scripts.test, /packages\/\*\/test\/\*\.test\.mjs/);
  assert.match(workspace.scripts.test, /packages\/\*\/test\/\*\*\/\*\.test\.mjs/);
});
