# Generated from schemas/v0 by tools/codegen/generate.mjs. Do not edit.
from typing import NotRequired, TypedDict

MgdsResource = TypedDict(
    "MgdsResource",
    {
    "id": str,
    "projectScope": str,
    "generation": int,
    "kind": str,
    "displayLabel": NotRequired[str],
    "contentHash": NotRequired[str],
    },
)

MgdsCapability = TypedDict(
    "MgdsCapability",
    {
    "id": str,
    "summary": str,
    "inputSchema": dict[str, object],
    "outputSchema": dict[str, object],
    "preconditions": list[str],
    "effects": list[str],
    "risk": str,
    "authority": dict[str, object],
    "units": dict[str, object],
    "idempotency": str,
    "deprecated": NotRequired[bool],
    },
)

MgdsManifest = TypedDict(
    "MgdsManifest",
    {
    "schemaVersion": str,
    "adapter": dict[str, object],
    "project": dict[str, object],
    "capabilities": list[dict[str, object]],
    },
)

MgdsProcedure = TypedDict(
    "MgdsProcedure",
    {
    "id": str,
    "capabilityId": str,
    "idempotency": str,
    "idempotencyKey": NotRequired[str],
    "inputs": dict[str, object],
    "timeoutSeconds": int,
    "requestedBudget": NotRequired[dict[str, object]],
    },
)

MgdsJob = TypedDict(
    "MgdsJob",
    {
    "id": str,
    "procedureId": str,
    "projectScope": str,
    "state": str,
    "attempt": int,
    "createdAt": str,
    "updatedAt": str,
    "terminalError": NotRequired[str],
    "resultHash": NotRequired[str],
    },
)

MgdsEvent = TypedDict(
    "MgdsEvent",
    {
    "jobId": str,
    "sequence": int,
    "type": str,
    "at": str,
    "from": NotRequired[str],
    "to": NotRequired[str],
    "attempt": NotRequired[int],
    "payload": NotRequired[dict[str, object]],
    },
)

MgdsPolicy = TypedDict(
    "MgdsPolicy",
    {
    "version": int,
    "defaultDecision": str,
    "grants": list[dict[str, object]],
    },
)

MgdsApproval = TypedDict(
    "MgdsApproval",
    {
    "id": str,
    "requestHash": str,
    "projectScope": str,
    "riskCeiling": str,
    "approverRef": str,
    "expiresAt": str,
    "signature": str,
    },
)

MgdsLease = TypedDict(
    "MgdsLease",
    {
    "id": str,
    "projectScope": str,
    "holder": str,
    "generation": int,
    "capabilityIds": list[str],
    "issuedAt": str,
    "expiresAt": str,
    },
)

MgdsBudget = TypedDict(
    "MgdsBudget",
    {
    "wallTimeSeconds": int,
    "cpuTimeSeconds": NotRequired[int],
    "artifactBytes": int,
    "networkRequests": int,
    "retries": int,
    },
)

MgdsTask = TypedDict(
    "MgdsTask",
    {
    "id": str,
    "title": str,
    "description": str,
    "requiredCapabilities": list[str],
    "fixtureHash": str,
    "inputsHash": str,
    "evaluatorProfile": str,
    "seed": NotRequired[int],
    },
)

MgdsRun = TypedDict(
    "MgdsRun",
    {
    "id": str,
    "taskId": str,
    "taskHash": str,
    "controllerDigest": str,
    "adapterDigest": str,
    "evaluatorDigest": str,
    "policyHash": str,
    "unityVersion": str,
    "agent": dict[str, object],
    "seed": int,
    "startedAt": str,
    },
)

MgdsArtifact = TypedDict(
    "MgdsArtifact",
    {
    "id": str,
    "logicalName": str,
    "mediaType": str,
    "sha256": str,
    "bytes": int,
    "truncated": NotRequired[bool],
    },
)

MgdsEvidence = TypedDict(
    "MgdsEvidence",
    {
    "runId": str,
    "artifacts": list[str],
    "eventsHash": str,
    "redactionVersion": str,
    },
)

MgdsResult = TypedDict(
    "MgdsResult",
    {
    "runId": str,
    "verdict": str,
    "evaluator": dict[str, object],
    "scores": dict[str, object],
    "evidenceHash": str,
    "limitations": NotRequired[list[str]],
    },
)

MgdsConformance = TypedDict(
    "MgdsConformance",
    {
    "id": str,
    "profile": str,
    "subject": dict[str, object],
    "clauses": list[dict[str, object]],
    "summary": dict[str, object],
    "createdAt": str,
    },
)
