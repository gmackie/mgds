import { spawn } from "node:child_process";

import { assertPublishable } from "@mgds/redaction";

export function hostIdForPlatform(platform = process.platform, architecture = process.arch) {
  const host = {
    "darwin:arm64": "macos-arm64",
    "linux:x64": "linux-x64",
    "win32:x64": "windows-x64",
  }[`${platform}:${architecture}`];
  if (!host) throw new Error(`unsupported campaign host: ${platform}/${architecture}`);
  return host;
}

export function buildTaskPrompt({ slot, task }) {
  if (!slot || !task || task.id !== slot.taskId || !/^sha256:[a-f0-9]{64}$/.test(slot.taskHash ?? "")) {
    throw new Error("sealed slot and matching task are required");
  }
  const publicTask = {
    id: task.id,
    taskHash: slot.taskHash,
    seed: slot.seed,
    repetition: slot.repetition,
    terminal: task.terminal,
    evidence: task.evidence,
    budgets: task.budgets,
  };
  assertPublishable(publicTask);
  return [
    "Implement the following immutable MGDS Unity task in the current workspace.",
    "Use only repository files and published MGDS/Unity interfaces.",
    "Use the Unity CLI for editor operations, for example unity command, unity test, and unity build.",
    "Do not access parent directories, credentials, user configuration, network services, or private tools.",
    "Do not decide whether the task passed. Finish with a short structured operational outcome only.",
    JSON.stringify(publicTask),
  ].join("\n");
}

export function buildHarnessInvocation({ harness, model, workspace, outputSchemaPath, outputPath, outputSchema }) {
  for (const [name, value] of Object.entries({ model, workspace })) requireArgument(name, value);
  if (harness === "codex") {
    requireArgument("outputSchemaPath", outputSchemaPath);
    requireArgument("outputPath", outputPath);
    return {
      command: "codex",
      args: ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "workspace-write", "--cd", workspace, "--model", model, "--output-schema", outputSchemaPath, "--output-last-message", outputPath, "-"],
    };
  }
  if (harness === "claude-code") {
    if (!outputSchema || typeof outputSchema !== "object" || Array.isArray(outputSchema)) throw new Error("Claude output schema is required");
    return {
      command: "claude",
      args: ["--print", "--safe-mode", "--no-session-persistence", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Bash(unity *)", "--model", model, "--output-format", "json", "--json-schema", JSON.stringify(outputSchema)],
    };
  }
  throw new Error(`unsupported harness: ${harness}`);
}

export async function executeBoundedProcess({ command, args, cwd, stdin, timeoutMs, maxOutputBytes, env }) {
  requireArgument("command", command);
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new Error("process arguments must be strings");
  requireArgument("cwd", cwd);
  if (typeof stdin !== "string") throw new Error("process stdin must be text");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("positive process timeout required");
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) throw new Error("positive output budget required");
  if (!env || typeof env !== "object" || Array.isArray(env)) throw new Error("explicit process environment required");

  const startedAt = performance.now();
  const child = spawn(command, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  let outputBytes = 0;
  let failure = null;
  let terminating = false;

  const terminate = (error) => {
    if (terminating) return;
    terminating = true;
    failure = error;
    if (process.platform !== "win32" && child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
    } else child.kill("SIGTERM");
    const force = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform !== "win32" && child.pid) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        } else child.kill("SIGKILL");
      }
    }, 1_000);
    force.unref();
  };
  const collect = (target) => (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > maxOutputBytes) terminate(new Error("harness output budget exceeded"));
    else target.push(chunk);
  };
  child.stdout.on("data", collect(stdout));
  child.stderr.on("data", collect(stderr));
  const timeout = setTimeout(() => terminate(new Error("harness time budget exceeded")), timeoutMs);
  timeout.unref();

  return await new Promise((resolve, reject) => {
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timeout);
      if (failure) return reject(failure);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
      });
    });
    child.stdin.end(stdin);
  });
}

export function parseHarnessOutcome({ harness, output }) {
  if (typeof output !== "string" || Buffer.byteLength(output) > 64 * 1024) throw new Error("invalid harness outcome");
  let parsed;
  try { parsed = JSON.parse(output); } catch { throw new Error("invalid harness outcome"); }
  let outcome = parsed;
  if (harness === "claude-code") {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.structured_output) throw new Error("Claude structured output missing");
    outcome = parsed.structured_output;
  } else if (harness !== "codex") throw new Error(`unsupported harness: ${harness}`);
  const keys = Object.keys(outcome ?? {}).sort();
  if (
    !outcome || typeof outcome !== "object" || Array.isArray(outcome)
    || JSON.stringify(keys) !== JSON.stringify(["changedFiles", "commandsRun", "schema", "status"])
    || outcome.schema !== "mgds.harness-outcome/v1"
    || !["completed", "blocked"].includes(outcome.status)
    || !Number.isInteger(outcome.changedFiles) || outcome.changedFiles < 0 || outcome.changedFiles > 10_000
    || !Number.isInteger(outcome.commandsRun) || outcome.commandsRun < 0 || outcome.commandsRun > 10_000
  ) throw new Error("invalid harness outcome");
  assertPublishable(outcome);
  return structuredClone(outcome);
}

export function buildHarnessRecord({ slot, model, outcome, durationMs }) {
  requireArgument("slotId", slot?.slotId);
  requireArgument("host", slot?.host);
  requireArgument("harness", slot?.harness);
  requireArgument("model", model);
  if (!outcome || !["completed", "blocked"].includes(outcome.status) || !Number.isInteger(outcome.changedFiles) || !Number.isInteger(outcome.commandsRun) || !Number.isInteger(durationMs) || durationMs < 1) {
    throw new Error("valid harness outcome and duration are required");
  }
  const record = {
    schema: "mgds.harness-record/v1",
    slotId: slot.slotId,
    host: slot.host,
    harness: slot.harness,
    model,
    status: outcome.status,
    changedFiles: outcome.changedFiles,
    commandsRun: outcome.commandsRun,
    durationMs,
    privateAffordances: false,
  };
  assertPublishable(record);
  return record;
}

export function sanitizeHarnessEnvironment(harness, source = process.env) {
  if (!["codex", "claude-code"].includes(harness) || !source || typeof source !== "object") throw new Error("supported harness and source environment required");
  const base = ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "WINDIR", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "CODEX_HOME"];
  const auth = harness === "codex" ? ["OPENAI_API_KEY"] : ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"];
  return Object.fromEntries([...base, ...auth].flatMap((name) => typeof source[name] === "string" && source[name].length > 0 ? [[name, source[name]]] : []));
}

function requireArgument(name, value) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000\r\n]/.test(value)) throw new Error(`${name} must be one non-empty argument`);
}
