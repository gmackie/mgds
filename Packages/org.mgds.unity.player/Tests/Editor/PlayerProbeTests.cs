using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using NUnit.Framework;

namespace Mgds.Unity.Player.Tests
{
    public sealed class PlayerProbeTests
    {
        const string Secret = "0123456789abcdef0123456789abcdef";

        [Test]
        public void SessionRequiresCredentialAllowlistAndBudget()
        {
            var session = new PlayerProbeSession("ses_fixture", Secret, new[] { "state.read" }, 1);
            Assert.Throws<UnauthorizedAccessException>(() => session.Authorize("wrong", "state.read"));
            Assert.Throws<UnauthorizedAccessException>(() => session.Authorize(Secret, "state.write"));
            StringAssert.StartsWith("hdl_fixture_0_", session.Authorize(Secret, "state.read"));
            Assert.Throws<InvalidOperationException>(() => session.Authorize(Secret, "state.read"));
        }

        [Test]
        public void ReloadAndCloseInvalidateHandles()
        {
            var session = new PlayerProbeSession("ses_fixture", Secret, new[] { "state.read" });
            session.InvalidateHandles();
            StringAssert.Contains("_1_", session.Authorize(Secret, "state.read"));
            session.Close();
            Assert.Throws<InvalidOperationException>(() => session.Authorize(Secret, "state.read"));
        }

        [Test]
        public void LoopbackProbeServesAuthenticatedBoundedRuntimeRequests()
        {
            var session = new PlayerProbeSession("ses_live", Secret, new[] { "state.read" }, 1);
            using var server = new PlayerProbeServer(session);
            server.Start();
            using var client = new TcpClient();
            client.Connect(IPAddress.Loopback, server.Port);
            using var stream = client.GetStream();
            var request = Encoding.UTF8.GetBytes($"{Secret}\tstate.read\n");
            stream.Write(request, 0, request.Length);
            using var reader = new StreamReader(stream, Encoding.UTF8, false, 1024, true);
            StringAssert.StartsWith("ok\thdl_live_0_1", reader.ReadLine());
            server.Stop();
            Assert.IsTrue(session.Closed);
        }
    }
}
