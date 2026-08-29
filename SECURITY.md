# Security policy

MGDS is a research preview that can execute code and Unity operations inside a
declared sandbox. Conformance does not make arbitrary project code safe. Do not
run untrusted projects with ambient credentials, production network access, or
release signing authority.

## Supported versions

Only the latest signed preview release and the current development branch
receive security fixes during v0. Each release records its exact schema,
controller, adapter, evaluator, Unity, and dependency identities.

## Private vulnerability reporting

Use the repository host's private vulnerability reporting feature. If that
feature is unavailable, contact a maintainer through a previously verified
private channel and request a disclosure channel before sending details.

Do not include credentials, tokens, private project data, or personal information
in a report. Use the synthetic abuse fixtures or a minimal public
reproduction. Do not open a public issue for an unpatched privilege bypass,
secret leak, evaluator-integrity failure, or dependency-compromise report.

Include:

- affected released version and immutable component identities;
- threat-model identifier and violated trust boundary;
- minimal synthetic reproduction and expected/actual error code;
- impact, required authority, and whether the behavior is remotely reachable;
- suggested embargo constraints, if any.

## Response targets

Maintainers acknowledge a complete private report within three business days,
triage severity within seven, and publish a remediation or status update within
thirty. Active exploitation, credential exposure, or result-integrity compromise
may require immediate package withdrawal and key rotation.

## Release-blocking classes

Unresolved critical or high findings block P2. A privilege bypass, secret or
identity leak, duplicate irreversible mutation, unsigned component substitution,
or forged evaluator result invalidates affected conformance and benchmark runs.
