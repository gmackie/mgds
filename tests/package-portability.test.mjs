import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("campaign and release packages use declared package dependencies and package-local schemas", async () => {
  const [campaignSource, campaignPackage, releaseSource, releasePackage] = await Promise.all([
    readFile("packages/campaign/src/index.mjs", "utf8"),
    readFile("packages/campaign/package.json", "utf8").then(JSON.parse),
    readFile("packages/release/src/p2-gate.mjs", "utf8"),
    readFile("packages/release/package.json", "utf8").then(JSON.parse),
  ]);
  assert.match(campaignSource, /@mgds\/redaction/);
  assert.doesNotMatch(campaignSource, /\.\.\/\.\.\/redaction|\.\.\/\.\.\/\.\.\/schemas/);
  assert.equal(campaignPackage.dependencies["@mgds/redaction"], "workspace:*");
  assert.match(releaseSource, /@mgds\/attestation/);
  assert.match(releaseSource, /@mgds\/campaign/);
  assert.equal(releasePackage.dependencies["@mgds/attestation"], "workspace:*");
  assert.equal(releasePackage.dependencies["@mgds/campaign"], "workspace:*");
  for (const name of ["campaign-plan", "campaign-run", "campaign-evidence", "campaign-evidence-index"]) {
    const [root, packaged] = await Promise.all([
      readFile(`schemas/v0/${name}.schema.json`, "utf8").then(JSON.parse),
      readFile(`packages/campaign/schemas/${name}.schema.json`, "utf8").then(JSON.parse),
    ]);
    assert.deepEqual(packaged, root);
  }
});
