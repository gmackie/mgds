using System;
using System.Collections.Generic;

namespace Mgds.Unity.Multiplayer
{
    public readonly struct PlayerAllocation
    {
        public PlayerAllocation(string id, int port) { Id = id; Port = port; }
        public string Id { get; }
        public int Port { get; }
    }

    public sealed class MultiplayerSession
    {
        readonly List<PlayerAllocation> players = new();
        readonly int maxPlayers;
        readonly int basePort;

        public MultiplayerSession(string sessionId, int maxPlayers = 8, int basePort = 19000)
        {
            if (string.IsNullOrWhiteSpace(sessionId) || !sessionId.StartsWith("mps_", StringComparison.Ordinal)) throw new ArgumentException("Opaque multiplayer session ID required.");
            if (maxPlayers < 1 || maxPlayers > 32) throw new ArgumentOutOfRangeException(nameof(maxPlayers));
            if (basePort < 1024 || basePort + maxPlayers > 65535) throw new ArgumentOutOfRangeException(nameof(basePort));
            SessionId = sessionId;
            this.maxPlayers = maxPlayers;
            this.basePort = basePort;
        }

        public string SessionId { get; }
        public bool Closed { get; private set; }
        public IReadOnlyList<PlayerAllocation> Players => players;

        public PlayerAllocation Allocate()
        {
            if (Closed) throw new InvalidOperationException("Session is closed.");
            if (players.Count >= maxPlayers) throw new InvalidOperationException("Player limit reached.");
            var slot = players.Count;
            var allocation = new PlayerAllocation($"ply_{SessionId.Substring(4)}_{slot}", basePort + slot);
            players.Add(allocation);
            return allocation;
        }

        public void Close() { Closed = true; players.Clear(); }
    }
}
