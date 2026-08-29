import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { buildCampaignPlan, sealCampaignInputs } from "../packages/campaign/src/index.mjs";

const options = parseOptions(process.argv.slice(2));
const config = JSON.parse(await readFile(options.config, "utf8"));
const sealed = await sealCampaignInputs({ config, readFile });
const plan = buildCampaignPlan({ config, ...sealed });
await mkdir(dirname(options.output), { recursive: true });
await writeFile(options.output, `${JSON.stringify(plan, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ campaignId: plan.campaignId, slots: plan.slots.length, output: options.output })}\n`);

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`);
    options[args[index].slice(2)] = args[index + 1];
  }
  if (!options.config || !options.output) throw new Error("--config and --output are required");
  return options;
}
