using System.Collections.Generic;
using NUnit.Framework;

namespace Mgds.Unity.Semantic.Tests
{
    public sealed class SemanticWorldTests
    {
        [Test]
        public void EntitiesAssertionsAndCursorEventsAreStable()
        {
            var world = new SemanticWorld(2);
            world.Upsert("ent_player", new Dictionary<string, string> { ["health"] = "100" });
            Assert.IsTrue(world.AssertEquals("ent_player", "health", "100", out var actual));
            Assert.AreEqual("100", actual);
            var first = world.EventsAfter(0, 10);
            Assert.AreEqual(1, first.Count);
            Assert.AreEqual("entity.upserted", first[0].Kind);
            Assert.AreEqual(0, world.EventsAfter(first[0].Sequence, 10).Count);
        }

        [Test]
        public void EventBufferIsBounded()
        {
            var world = new SemanticWorld(2);
            world.Upsert("ent_a", new Dictionary<string, string>());
            world.Upsert("ent_b", new Dictionary<string, string>());
            world.Upsert("ent_c", new Dictionary<string, string>());
            var events = world.EventsAfter(0, 10);
            Assert.AreEqual(2, events.Count);
            Assert.AreEqual("ent_b", events[0].EntityId);
        }
    }
}
