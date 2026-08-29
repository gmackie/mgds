import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile('fixtures/v0/evidence.valid.json', 'utf8')).artifact;
const roundTrip = JSON.parse(JSON.stringify(fixture));
assert.deepEqual(roundTrip, fixture);
console.log('typescript round-trip: stable');
