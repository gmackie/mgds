using System;
using NUnit.Framework;

namespace Mgds.Unity.Multiplayer.Tests
{
    public sealed class MultiplayerSessionTests
    {
        [Test]
        public void AllocationsAreUniqueBoundedAndReleasedOnClose()
        {
            var session = new MultiplayerSession("mps_fixture", 2, 21000);
            var first = session.Allocate();
            var second = session.Allocate();
            Assert.AreNotEqual(first.Id, second.Id);
            Assert.AreEqual(21000, first.Port);
            Assert.AreEqual(21001, second.Port);
            Assert.Throws<InvalidOperationException>(() => session.Allocate());
            session.Close();
            Assert.AreEqual(0, session.Players.Count);
            Assert.Throws<InvalidOperationException>(() => session.Allocate());
        }
    }
}
