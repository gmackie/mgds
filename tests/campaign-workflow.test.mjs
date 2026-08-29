import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cross-platform T0 results are retained and provenance-attested", async () => {
  const workflow = await readFile(".github/workflows/conformance.yml", "utf8");

  assert.match(workflow, /permissions:\s+contents: read\s+id-token: write\s+attestations: write/);
  assert.match(workflow, /uses: actions\/attest@v4/);
  assert.match(workflow, /subject-path: artifacts\/conformance\/\$\{\{ matrix\.host \}\}\.json/);
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /name: mgds-t0-\$\{\{ matrix\.host \}\}/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /retention-days: 30/);
});
