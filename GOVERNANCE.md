# MGDS governance

MGDS uses maintainer stewardship during the research preview. Governance must
keep the normative specification, schemas, reference implementation, fixtures,
and conformance reports aligned.

## Roles

- Maintainers merge changes and cut signed releases.
- Editors own normative language and registry consistency.
- Security maintainers receive private reports and may embargo fixes.
- Adapter authors and benchmark contributors do not grade their own submissions.

The initial maintainer set is recorded by the repository host. Adding or removing
a maintainer requires a public RFC and two maintainer approvals. No single vendor,
agent provider, engine integration, or benchmark author can unilaterally redefine
a stable conformance requirement.

## Decisions

Routine implementation changes need one approval. Normative schemas, capability
semantics, evaluator authority, privacy, signing, compatibility, governance, and
release gates need two maintainer approvals and an accepted RFC. Security fixes
may be merged privately, but their public release must document the affected
versions and conformance impact.

## Releases and appeals

A release is valid only when its manifest identifies every normative input and
required automated gate. Results can be appealed with a reproducible evidence
bundle; an uninvolved maintainer decides the appeal. Material evaluator defects
invalidate affected results rather than being silently re-scored.
