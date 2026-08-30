using System;
using System.Linq;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Mgds.GoldenArena.Tests
{
    public sealed class GoldenArenaStateTests
    {
        [Test]
        public void KeyUnlocksExitAndEnteringCompletesTheTask()
        {
            var state = new GoldenArenaState();
            state.Reset(1337);
            state.Apply("collect-key");
            Assert.IsTrue(state.ExitUnlocked);
            Assert.IsFalse(state.Completed);
            state.Apply("enter-exit");
            Assert.IsTrue(state.Completed);
            Assert.AreEqual(2, state.InputSequence);
        }

        [Test]
        public void ExitCannotCompleteBeforeTheKeyAndUnknownActionsFailClosed()
        {
            var state = new GoldenArenaState();
            state.Reset(7331);
            state.Apply("enter-exit");
            Assert.IsFalse(state.Completed);
            Assert.Throws<ArgumentException>(() => state.Apply("invented-action"));
        }

        [Test]
        public void SceneFactoryCreatesDeterministicPlayableLandmarks()
        {
            var root = GoldenArenaSceneFactory.Create(424242);
            try
            {
                var names = root.GetComponentsInChildren<Transform>(true).Select(item => item.name).ToArray();
                CollectionAssert.IsSubsetOf(new[] { "Player", "Key", "Exit", "Floor", "Main Camera", "Directional Light" }, names);
                Assert.AreEqual(424242, root.GetComponent<GoldenArenaController>().State.Seed);
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }

        [Test]
        public void CheckedInArenaSceneContainsThePlayableWorld()
        {
            var scene = EditorSceneManager.OpenScene("Assets/Scenes/GoldenArena.unity", OpenSceneMode.Single);
            var names = scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<Transform>(true)).Select(item => item.name).ToArray();
            CollectionAssert.IsSubsetOf(new[] { "Player", "Key", "Exit", "Floor", "Main Camera", "Directional Light" }, names);
            Assert.IsTrue(scene.GetRootGameObjects().Single(root => root.name == "MGDS Golden Arena").GetComponent<GoldenArenaController>().IsConfigured);
        }
    }
}
