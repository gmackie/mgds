# Model Game Development Standard

MGDS is an open, Unity-specific research-preview standard for reproducible,
policy-governed model-driven game development. It provides a transport-neutral
job protocol, controller, policy and evidence layers, CLI/MCP projections,
Unity reference packages, a GMacko compatibility bridge, a golden benchmark
arena, and deterministic conformance reports.

The repository is private at the package-manager root so the workspace itself
cannot be published accidentally. Individual SDK and Unity packages will carry
their own explicit publication metadata.

## Current scope

- Unity `6000.3.9f1` and `com.unity.pipeline@0.5.0-exp.1` are pinned.
- `org.mgds.unity.core`, `.editor`, `.player`, `.semantic`, and `.multiplayer`
  implement the open reference adapter.
- T0 covers manifest discovery, bounds, cancellation, privacy, and evidence.
- The benchmark and project profiles separate disposable research runs from
  state-preserving work on real projects.
- Codex and Claude Code harnesses use the same published projections and sealed
  task envelope.

The repository is a P2 engineering candidate, not a signed P2 release. The
independent security review, cross-platform Unity campaign, release-authority
signature, and external clean-room P3 implementation remain explicit gates.

## Checks

```sh
pnpm install --frozen-lockfile
uv sync --frozen
pnpm check
pnpm conformance:t0
pnpm unity:test
```

Start with [the quickstart](docs/quickstart.html), then read
[adapter authoring](docs/adapter-authoring.html),
[result reproduction](docs/result-reproduction.html), and the
[known limitations](security/known-limitations.html).
