using System;
using Unity.Pipeline.Commands;

namespace Mgds.Unity.Core
{
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
    public sealed class MgdsCommandAttribute : CliCommandAttribute
    {
        public MgdsCommandAttribute(string capabilityId, string name, string description)
            : base(name, description)
        {
            if (string.IsNullOrWhiteSpace(capabilityId))
            {
                throw new ArgumentException("Capability ID is required.", nameof(capabilityId));
            }

            CapabilityId = capabilityId;
        }

        public string CapabilityId { get; }
    }

    [AttributeUsage(AttributeTargets.Parameter | AttributeTargets.Field | AttributeTargets.Property)]
    public sealed class MgdsArgAttribute : CliArgAttribute
    {
        public MgdsArgAttribute(string name, string description)
            : base(name, description)
        {
        }
    }
}
