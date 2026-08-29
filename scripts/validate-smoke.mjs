import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(readJson("schemas/smoke.schema.json"));

if (!validate(readJson("fixtures/smoke.valid.json"))) {
  throw new Error(`valid fixture rejected: ${ajv.errorsText(validate.errors)}`);
}
console.log("valid fixture: accepted");

if (validate(readJson("fixtures/smoke.invalid.json"))) {
  throw new Error("invalid fixture accepted");
}
console.log("invalid fixture: rejected");
