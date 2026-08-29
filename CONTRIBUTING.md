# Contributing to MGDS

MGDS is a public interoperability and evaluation standard. Contributions must
preserve portability across adapters, deterministic evidence, and deny-by-default
authority boundaries.

## Contribution flow

1. Open an issue describing the user-visible contract or defect.
2. For normative behavior, open an RFC before implementation.
3. Write a failing fixture or test, record the expected failure, then implement.
4. Run `pnpm check` and `uvx reuse lint` from a clean checkout.
5. Submit one reviewable change per plan task with provenance for new assets.

Changes to schemas, evaluators, policy, redaction, signing, or compatibility are
security-sensitive and require two maintainer approvals. Report undisclosed
vulnerabilities through the private process in `SECURITY.md`, not an issue.

## Developer Certificate of Origin

All commits must be made under the Developer Certificate of Origin 1.1. By
contributing, you certify that you have the right to submit the work under the
repository licenses. Use a `Signed-off-by` trailer with a name and email you are
authorized to disclose publicly.

## Compatibility

Public capability identifiers are append-only within a stable major version.
Breaking behavior needs a new version, migration notes, negative fixtures, and a
deprecation window. Conformance claims require immutable inputs and complete
evidence; local success alone is not a release claim.
