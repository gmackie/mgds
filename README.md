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
pnpm campaign:plan
# Intentionally exits non-zero until all external P2 gates are satisfied:
pnpm release:p2:check
```

`campaign:plan` seals the task, benchmark policy, golden-project lockfiles, and
Unity toolchain into a deterministic 90-slot Codex/Claude × host × seed ×
repetition matrix. `campaign:evaluate` accepts only records matching those
sealed slots and fails on missing fairness, cleanup, provenance, or threshold
evidence. Every accepted run needs an evaluator signature from an externally
pinned key, and each host/harness pair needs a signed 240-minute soak record.
The evaluator signature covers the complete run provenance record. Evidence
bundle bytes are resolved through `results/p2/evidence.json`, hashed,
schema-validated, privacy-checked, and replayed before aggregation. Each bundle
must contain the task-declared compile, tests, event-ledger, screenshot, and
player-build evidence roles; summary flags cannot substitute for replay.
The release gate also requires `MGDS_RELEASE_SOURCE_DIGEST` so GitHub
host attestations, independent review, and the final release signature are
pinned to one clean source commit with tracked release inputs.
Review approval, reviewer/release public keys, and the final signature live as
detached content-addressed artifacts under ignored `artifacts/release/p2/`, so
approving or signing a commit never changes that commit.
The release signature binds the candidate, recomputed campaign, verified host
provenance, review report, and trust fingerprints as one release subject. The
authority registries are deliberately empty until governance appoints them;
their trusted fingerprints must be supplied out of band.

Start with [the quickstart](docs/quickstart.html), then read
[adapter authoring](docs/adapter-authoring.html),
[result reproduction](docs/result-reproduction.html), and the
[known limitations](security/known-limitations.html).
