// Generated from schemas/v0 by tools/codegen/generate.mjs. Do not edit.
using System;
using System.Collections.Generic;

namespace Mgds.Protocol.Generated
{
    [Serializable]
    public sealed class MgdsResource
    {
        public string id = string.Empty;
        public string projectScope = string.Empty;
        public long generation;
        public string kind = string.Empty;
        public string displayLabel = string.Empty;
        public string contentHash = string.Empty;
    }

    [Serializable]
    public sealed class MgdsCapability
    {
        public string id = string.Empty;
        public string summary = string.Empty;
        public Dictionary<string, object> inputSchema = new();
        public Dictionary<string, object> outputSchema = new();
        public List<string> preconditions = new();
        public List<string> effects = new();
        public string risk = string.Empty;
        public Dictionary<string, object> authority = new();
        public Dictionary<string, object> units = new();
        public string idempotency = string.Empty;
        public bool deprecated;
    }

    [Serializable]
    public sealed class MgdsManifest
    {
        public string schemaVersion = string.Empty;
        public Dictionary<string, object> adapter = new();
        public Dictionary<string, object> project = new();
        public List<MgdsCapability> capabilities = new();
    }

    [Serializable]
    public sealed class MgdsProcedure
    {
        public string id = string.Empty;
        public string capabilityId = string.Empty;
        public string idempotency = string.Empty;
        public string idempotencyKey = string.Empty;
        public Dictionary<string, object> inputs = new();
        public long timeoutSeconds;
        public Dictionary<string, object> requestedBudget = new();
    }

    [Serializable]
    public sealed class MgdsJob
    {
        public string id = string.Empty;
        public string procedureId = string.Empty;
        public string projectScope = string.Empty;
        public string state = string.Empty;
        public long attempt;
        public string createdAt = string.Empty;
        public string updatedAt = string.Empty;
        public string terminalError = string.Empty;
        public string resultHash = string.Empty;
    }

    [Serializable]
    public sealed class MgdsEvent
    {
        public string jobId = string.Empty;
        public long sequence;
        public string type = string.Empty;
        public string at = string.Empty;
        public string @from = string.Empty;
        public string to = string.Empty;
        public long attempt;
        public Dictionary<string, object> payload = new();
    }

    [Serializable]
    public sealed class MgdsPolicy
    {
        public long version;
        public string defaultDecision = string.Empty;
        public List<Dictionary<string, object>> grants = new();
    }

    [Serializable]
    public sealed class MgdsApproval
    {
        public string id = string.Empty;
        public string requestHash = string.Empty;
        public string projectScope = string.Empty;
        public string riskCeiling = string.Empty;
        public string approverRef = string.Empty;
        public string expiresAt = string.Empty;
        public string signature = string.Empty;
    }

    [Serializable]
    public sealed class MgdsLease
    {
        public string id = string.Empty;
        public string projectScope = string.Empty;
        public string holder = string.Empty;
        public long generation;
        public List<string> capabilityIds = new();
        public string issuedAt = string.Empty;
        public string expiresAt = string.Empty;
    }

    [Serializable]
    public sealed class MgdsBudget
    {
        public long wallTimeSeconds;
        public long cpuTimeSeconds;
        public long artifactBytes;
        public long networkRequests;
        public long retries;
    }

    [Serializable]
    public sealed class MgdsTask
    {
        public string id = string.Empty;
        public string title = string.Empty;
        public string description = string.Empty;
        public List<string> requiredCapabilities = new();
        public string fixtureHash = string.Empty;
        public string inputsHash = string.Empty;
        public string evaluatorProfile = string.Empty;
        public long seed;
    }

    [Serializable]
    public sealed class MgdsRun
    {
        public string id = string.Empty;
        public string taskId = string.Empty;
        public string taskHash = string.Empty;
        public string controllerDigest = string.Empty;
        public string adapterDigest = string.Empty;
        public string evaluatorDigest = string.Empty;
        public string policyHash = string.Empty;
        public string unityVersion = string.Empty;
        public Dictionary<string, object> agent = new();
        public long seed;
        public string startedAt = string.Empty;
    }

    [Serializable]
    public sealed class MgdsArtifact
    {
        public string id = string.Empty;
        public string logicalName = string.Empty;
        public string mediaType = string.Empty;
        public string sha256 = string.Empty;
        public long bytes;
        public bool truncated;
    }

    [Serializable]
    public sealed class MgdsEvidence
    {
        public string runId = string.Empty;
        public List<string> artifacts = new();
        public string eventsHash = string.Empty;
        public string redactionVersion = string.Empty;
    }

    [Serializable]
    public sealed class MgdsResult
    {
        public string runId = string.Empty;
        public string verdict = string.Empty;
        public Dictionary<string, object> evaluator = new();
        public Dictionary<string, object> scores = new();
        public string evidenceHash = string.Empty;
        public List<string> limitations = new();
    }

    [Serializable]
    public sealed class MgdsConformance
    {
        public string id = string.Empty;
        public string profile = string.Empty;
        public Dictionary<string, object> subject = new();
        public List<Dictionary<string, object>> clauses = new();
        public Dictionary<string, object> summary = new();
        public string createdAt = string.Empty;
    }

}
