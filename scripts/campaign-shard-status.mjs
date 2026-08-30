import { readFile } from "node:fs/promises";

import { selectHostSlots, writeCampaignCheckpointAtomic } from "../packages/campaign-operator/src/index.mjs";
import { hostIdForPlatform } from "../packages/harness-runner/src/index.mjs";

const options = parseOptions(process.argv.slice(2));
const plan = JSON.parse(await readFile(options.plan, "utf8"));
const host = hostIdForPlatform();
const checkpoint = await readCheckpoint(options.checkpoint, plan.campaignId, host);
const pending = selectHostSlots({ plan, host, harness: options.harness, completedSlotIds: checkpoint.completedSlotIds });
await writeCampaignCheckpointAtomic(options.checkpoint, checkpoint);
process.stdout.write(`${JSON.stringify({ schema: "mgds.campaign-shard-status/v1", campaignId: plan.campaignId, host, harness: options.harness ?? null, completed: checkpoint.completedSlotIds.length, pending: pending.length, nextSlotId: pending[0]?.slotId ?? null }, null, 2)}\n`);

async function readCheckpoint(path, campaignId, host) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (value.schema !== "mgds.campaign-checkpoint/v1" || value.campaignId !== campaignId || value.host !== host) throw new Error("checkpoint identity mismatch");
    return { campaignId, host, completedSlotIds: value.completedSlotIds };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { campaignId, host, completedSlotIds: [] };
  }
}

function parseOptions(args) {
  if (args[0] === "--") args = args.slice(1);
  const value = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid argument: ${args[index]}`);
    value[args[index].slice(2)] = args[index + 1];
  }
  if (!value.plan || !value.checkpoint) throw new Error("--plan and --checkpoint are required");
  if (value.harness && !["codex", "claude-code"].includes(value.harness)) throw new Error("--harness must be codex or claude-code");
  return value;
}
