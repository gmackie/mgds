using System;
using System.Collections.Generic;

namespace Mgds.Unity.Player
{
    public sealed class PlayerProbeSession
    {
        readonly HashSet<string> allowed;
        readonly int maxRequests;
        int requestCount;

        public PlayerProbeSession(string opaqueSessionId, string secret, IEnumerable<string> allowedCapabilities, int maxRequests = 1024)
        {
            if (string.IsNullOrWhiteSpace(opaqueSessionId) || !opaqueSessionId.StartsWith("ses_", StringComparison.Ordinal)) throw new ArgumentException("Opaque session ID required.");
            if (string.IsNullOrWhiteSpace(secret) || secret.Length < 32) throw new ArgumentException("A 256-bit session secret is required.");
            if (maxRequests < 1 || maxRequests > 100000) throw new ArgumentOutOfRangeException(nameof(maxRequests));
            SessionId = opaqueSessionId;
            Secret = secret;
            allowed = new HashSet<string>(allowedCapabilities ?? Array.Empty<string>(), StringComparer.Ordinal);
            this.maxRequests = maxRequests;
        }

        public string SessionId { get; }
        internal string Secret { get; }
        public long Generation { get; private set; }
        public bool Closed { get; private set; }

        public string Authorize(string presentedSecret, string capabilityId)
        {
            if (Closed) throw new InvalidOperationException("Session is closed.");
            if (!ConstantTimeEquals(Secret, presentedSecret)) throw new UnauthorizedAccessException("Invalid session credential.");
            if (!allowed.Contains(capabilityId)) throw new UnauthorizedAccessException("Capability is not allowlisted.");
            if (++requestCount > maxRequests) throw new InvalidOperationException("Request budget exhausted.");
            return $"hdl_{SessionId.Substring(4)}_{Generation}_{requestCount}";
        }

        public void InvalidateHandles() => Generation++;
        public void Close() { Closed = true; Generation++; }

        static bool ConstantTimeEquals(string left, string right)
        {
            if (right == null || left.Length != right.Length) return false;
            var diff = 0;
            for (var i = 0; i < left.Length; i++) diff |= left[i] ^ right[i];
            return diff == 0;
        }
    }
}
