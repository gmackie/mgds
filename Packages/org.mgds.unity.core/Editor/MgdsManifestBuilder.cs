using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Mgds.Unity.Core;
using UnityEditor;

namespace Mgds.Unity.Core.Editor
{
    public sealed class MgdsManifestSnapshot
    {
        public MgdsManifestSnapshot(string json, string projectScope, long generation, IReadOnlyList<string> capabilityIds)
        {
            Json = json;
            ProjectScope = projectScope;
            Generation = generation;
            CapabilityIds = capabilityIds;
        }

        public string Json { get; }
        public string ProjectScope { get; }
        public long Generation { get; }
        public IReadOnlyList<string> CapabilityIds { get; }
    }

    public static class MgdsManifestBuilder
    {
        public static MgdsManifestSnapshot Discover(string projectScope, long generation)
        {
            if (string.IsNullOrEmpty(projectScope) || !projectScope.StartsWith("prj_", StringComparison.Ordinal) || generation < 0)
            {
                throw new ArgumentException("Opaque project scope and non-negative generation are required.");
            }

            var capabilities = TypeCache.GetMethodsWithAttribute<MgdsCommandAttribute>()
                .Select(method => method.GetCustomAttributes(typeof(MgdsCommandAttribute), false)
                    .Cast<MgdsCommandAttribute>()
                    .Single()
                    .CapabilityId)
                .Distinct(StringComparer.Ordinal)
                .OrderBy(id => id, StringComparer.Ordinal)
                .ToArray();
            var json = BuildJson(projectScope, generation, capabilities);
            return new MgdsManifestSnapshot(json, projectScope, generation, capabilities);
        }

        static string BuildJson(string projectScope, long generation, IEnumerable<string> capabilities)
        {
            var builder = new StringBuilder();
            builder.Append("{\"schemaVersion\":\"0.1.0\",\"project\":{\"scope\":\"")
                .Append(projectScope)
                .Append("\",\"generation\":")
                .Append(generation)
                .Append("},\"capabilities\":[");
            var separator = string.Empty;
            foreach (var capability in capabilities)
            {
                builder.Append(separator).Append('"').Append(capability).Append('"');
                separator = ",";
            }

            return builder.Append("]}").ToString();
        }
    }
}
