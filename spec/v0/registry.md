# MGDS v0 registry policy

This registry owns normative identifiers. Registration requires a schema,
semantic description, authority and risk classification, compatibility range,
positive and negative fixtures, privacy review, and deterministic discovery.

## Reserved namespaces

| Namespace | Owner | Purpose |
| --- | --- | --- |
| `mgds.core.*` | MGDS maintainers | Transport-independent resources, jobs, policy, evidence, and conformance |
| `mgds.unity.*` | MGDS maintainers | Normative Unity capabilities and profiles |
| `org.mgds.unity.*` | MGDS maintainers | Open Unity reference UPM packages |
| `vendor.<dns-name>.*` | Registering vendor | Vendor extension capabilities |
| `project.<project-id>.*` | Project owner | Project-local L2 semantic capabilities |

Identifiers are lowercase ASCII segments separated by dots and end with an
explicit semantic version at the capability boundary. A name cannot be reused
with different semantics. Additive optional fields follow the containing schema
compatibility policy; changed behavior requires a new capability version.

## Collision policy

MGDS documentation and implementations must name the concept they mean rather
than reuse an overloaded Unity or agent-framework term.

| Overloaded term | Required MGDS wording |
| --- | --- |
| Unity CLI | Unity CLI transport, or MGDS controller |
| Pipeline | Unity Pipeline package, Unity adapter, or execution lifecycle |
| Agent | model harness, gameplay entity, or ML-Agents behavior |
| environment | project workspace, evaluation sandbox, or learning environment |
| command | capability, procedure, CLI subcommand, MCP tool, or player action |
| runtime | player probe, development player, or controller runtime |
| PlayMode | Editor play state or Unity Test Framework platform |
| MCP server | MCP projection and its owning controller/adapter |
| driver | Unity adapter or external device driver |
| state | one of the four named MGDS state planes |
| standard | normative MGDS clause or an explicitly named external standard |

## Registration lifecycle

1. Submit an RFC with the proposed identifier and namespace owner.
2. Add valid and invalid schema fixtures plus implementation-neutral semantics.
3. Add conformance clauses, threat classification, and privacy bounds.
4. Demonstrate deterministic discovery in the reference test kit.
5. Record compatibility and deprecation metadata in the version registry.

Experimental identifiers use a vendor or project namespace. They do not become
normative merely because the reference implementation ships them.
