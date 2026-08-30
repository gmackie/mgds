using System;
using System.Net;
using System.Net.Sockets;

namespace Mgds.Unity.Multiplayer
{
    public static class MultiplayerReadinessProbe
    {
        public static bool IsReady(PlayerAllocation allocation, TimeSpan timeout)
        {
            if (string.IsNullOrWhiteSpace(allocation.Id) || !allocation.Id.StartsWith("ply_", StringComparison.Ordinal)) throw new ArgumentException("Opaque player identity required.", nameof(allocation));
            if (allocation.Port < 1024 || allocation.Port > 65535) throw new ArgumentOutOfRangeException(nameof(allocation));
            if (timeout <= TimeSpan.Zero || timeout > TimeSpan.FromSeconds(30)) throw new ArgumentOutOfRangeException(nameof(timeout));
            try
            {
                using var client = new TcpClient(AddressFamily.InterNetwork);
                var task = client.ConnectAsync(IPAddress.Loopback, allocation.Port);
                return task.Wait(timeout) && client.Connected;
            }
            catch { return false; }
        }
    }
}
