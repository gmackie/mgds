using NUnit.Framework;
namespace Mgds.GoldenArena.Tests { public sealed class GoldenArenaStateTests { [Test] public void KeyUnlocksExit() { var state = new GoldenArenaState(); state.Reset(1337); state.Apply("collect-key"); Assert.IsTrue(state.ExitUnlocked); Assert.AreEqual(1, state.InputSequence); } } }
