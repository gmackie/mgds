import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHarnessInvocation,
  buildHarnessRecord,
  buildTaskPrompt,
  executeBoundedProcess,
  hostIdForPlatform,
  parseHarnessOutcome,
  sanitizeHarnessEnvironment,
} from "../src/index.mjs";

const slot = {
  slotId: "mgds.task@0.1.0::macos-arm64::codex::1337::1",
  campaignId: "mgds.campaign.p2@0.1.0",
  taskId: "mgds.task@0.1.0",
  taskHash: `sha256:${"a".repeat(64)}`,
  budgetHash: `sha256:${"b".repeat(64)}`,
  environmentHash: `sha256:${"c".repeat(64)}`,
  requiredEvidence: ["compile", "tests"],
  buildTarget: "desktop",
  host: "macos-arm64",
  harness: "codex",
  seed: 1337,
  repetition: 1,
};

test("host identity is exact and unsupported platforms fail closed", () => {
  assert.equal(hostIdForPlatform("darwin", "arm64"), "macos-arm64");
  assert.equal(hostIdForPlatform("linux", "x64"), "linux-x64");
  assert.equal(hostIdForPlatform("win32", "x64"), "windows-x64");
  assert.throws(() => hostIdForPlatform("darwin", "x64"), /unsupported campaign host/);
});

test("task prompt contains sealed public inputs without local paths or verdict authority", () => {
  const prompt = buildTaskPrompt({
    slot,
    task: {
      id: slot.taskId,
      terminal: { buildTarget: "desktop", exitUnlocked: true },
      evidence: ["compile", "tests"],
      budgets: { wallMinutes: 45, editors: 1, players: 1 },
    },
  });
  assert.match(prompt, /mgds\.task@0\.1\.0/);
  assert.match(prompt, /unity command/);
  assert.match(prompt, /1337/);
  assert.doesNotMatch(prompt, /\/Users\/|\/Volumes\/|cwd=|verdict|evaluator/i);
});

test("campaign slot seed overrides the task fixture seed", () => {
  const prompt = buildTaskPrompt({
    slot: { ...slot, seed: 7331 },
    task: { id: slot.taskId, seed: 1337, terminal: { buildTarget: "desktop" }, evidence: ["compile", "tests"], budgets: { wallMinutes: 45 } },
  });
  assert.match(prompt, /7331/);
});

test("Codex and Claude invocations disable private customization and persistence", () => {
  const codex = buildHarnessInvocation({ harness: "codex", model: "gpt-test", workspace: "/work/run", outputSchemaPath: "/work/schema.json", outputPath: "/work/out.json" });
  assert.equal(codex.command, "codex");
  assert.deepEqual(codex.args, ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "workspace-write", "--cd", "/work/run", "--model", "gpt-test", "--output-schema", "/work/schema.json", "--output-last-message", "/work/out.json", "-"]);

  const claude = buildHarnessInvocation({ harness: "claude-code", model: "claude-test", workspace: "/work/run", outputSchema: { type: "object" } });
  assert.equal(claude.command, "claude");
  assert.deepEqual(claude.args, ["--print", "--safe-mode", "--no-session-persistence", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Bash(unity *)", "--model", "claude-test", "--output-format", "json", "--json-schema", "{\"type\":\"object\"}"]);
});

test("bounded process execution streams stdin and captures finite output", async () => {
  const result = await executeBoundedProcess({
    command: process.execPath,
    args: ["-e", "process.stdin.setEncoding('utf8');let v='';process.stdin.on('data',c=>v+=c);process.stdin.on('end',()=>{process.stdout.write(v.toUpperCase());process.stderr.write('diagnostic')})"],
    cwd: process.cwd(),
    stdin: "bounded input",
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
    env: {},
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "BOUNDED INPUT");
  assert.equal(result.stderr, "diagnostic");
  assert.ok(result.durationMs > 0);
});

test("bounded process execution terminates time and output overruns", async () => {
  await assert.rejects(() => executeBoundedProcess({
    command: process.execPath,
    args: ["-e", "setInterval(()=>{},1000)"],
    cwd: process.cwd(),
    stdin: "",
    timeoutMs: 100,
    maxOutputBytes: 1024,
    env: {},
  }), /time budget exceeded/);
  await assert.rejects(() => executeBoundedProcess({
    command: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(2048))"],
    cwd: process.cwd(),
    stdin: "",
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
    env: {},
  }), /output budget exceeded/);
});

test("provider envelopes yield only an exact non-authoritative operational outcome", () => {
  const outcome = { schema: "mgds.harness-outcome/v1", status: "completed", changedFiles: 3, commandsRun: 4 };
  assert.deepEqual(parseHarnessOutcome({ harness: "codex", output: JSON.stringify(outcome) }), outcome);
  assert.deepEqual(parseHarnessOutcome({ harness: "claude-code", output: JSON.stringify({ structured_output: outcome, result: "discard me" }) }), outcome);
  assert.throws(() => parseHarnessOutcome({ harness: "codex", output: JSON.stringify({ ...outcome, verdict: "valid" }) }), /invalid harness outcome/);
  assert.throws(() => parseHarnessOutcome({ harness: "claude-code", output: JSON.stringify({ result: JSON.stringify(outcome) }) }), /structured output missing/);
});

test("harness environments retain runtime and relevant auth only", () => {
  const source = {
    PATH: "/bin",
    HOME: "/home/operator",
    TMPDIR: "/tmp/runtime",
    OPENAI_API_KEY: "openai-secret",
    ANTHROPIC_API_KEY: "anthropic-secret",
    CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
    AWS_SECRET_ACCESS_KEY: "drop-me",
    MGDS_UNRELATED: "drop-me-too",
  };
  assert.deepEqual(sanitizeHarnessEnvironment("codex", source), {
    PATH: "/bin",
    HOME: "/home/operator",
    TMPDIR: "/tmp/runtime",
    OPENAI_API_KEY: "openai-secret",
  });
  assert.deepEqual(sanitizeHarnessEnvironment("claude-code", source), {
    PATH: "/bin",
    HOME: "/home/operator",
    TMPDIR: "/tmp/runtime",
    ANTHROPIC_API_KEY: "anthropic-secret",
    CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
  });
});

test("harness records retain bounded provenance without model output", () => {
  const record = buildHarnessRecord({
    slot,
    model: "gpt-test",
    outcome: { schema: "mgds.harness-outcome/v1", status: "completed", changedFiles: 2, commandsRun: 7 },
    durationMs: 1234,
  });
  assert.deepEqual(record, {
    schema: "mgds.harness-record/v1",
    slotId: slot.slotId,
    host: "macos-arm64",
    harness: "codex",
    model: "gpt-test",
    status: "completed",
    changedFiles: 2,
    commandsRun: 7,
    durationMs: 1234,
    privateAffordances: false,
  });
});
