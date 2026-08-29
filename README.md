# Model Game Development Standard

MGDS is an open, Unity-specific research-preview standard for reproducible,
policy-governed model-driven game development. The normative contract and
reference implementation are under active construction.

The repository is private at the package-manager root so the workspace itself
cannot be published accidentally. Individual SDK and Unity packages will carry
their own explicit publication metadata.

## Foundation checks

```sh
pnpm install --frozen-lockfile
uv sync --frozen
pnpm check
```
