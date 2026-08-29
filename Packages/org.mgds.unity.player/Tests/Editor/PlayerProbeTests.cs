using System;
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
    }
}
