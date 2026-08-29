import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(target));
    else if (entry.name.endsWith('.schema.json')) files.push(target);
  }
  return files;
}

const schemaFiles = (await filesBelow('schemas')).sort();
const schemas = await Promise.all(schemaFiles.map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of schemas) ajv.addSchema(schema);
for (const schema of schemas) ajv.getSchema(schema.$id);

const conformance = JSON.parse(await readFile('fixtures/v0/conformance.valid.json', 'utf8'));
const validate = ajv.getSchema('https://mgds.dev/schemas/v0/conformance.schema.json');
if (!validate(conformance)) throw new Error(JSON.stringify(validate.errors));

console.log(`schemas compiled: ${schemas.length}`);
console.log('conformance fixture: accepted');
