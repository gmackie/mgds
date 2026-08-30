import { createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";

import { verifyP3Submission } from "../packages/p3-submission/src/index.mjs";

const options = parseOptions(process.argv.slice(2));
const [bytes, publicKeyBytes] = await Promise.all([readFile(options.bundle), readFile(options["public-key"])]);
const result = verifyP3Submission({ bytes, publicKey: createPublicKey(publicKeyBytes) });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function parseOptions(args) {
  if (args[0] === "--") args = args.slice(1);
  const value = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`);
    value[args[index].slice(2)] = args[index + 1];
  }
  if (!value.bundle || !value["public-key"]) throw new Error("--bundle and --public-key are required");
  return value;
}
