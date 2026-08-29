using System;
using System.Collections.Generic;
using System.Linq;
using Mgds.Unity.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Mgds.Unity.Editor
{
    public sealed class EditorCapabilityDescriptor
    {
        public EditorCapabilityDescriptor(string id, bool mutates, string risk)
        {
            Id = id;
            Mutates = mutates;
            Risk = risk;
        }

        public string Id { get; }
        public bool Mutates { get; }
        public string Risk { get; }
    }

    public static class EditorCapabilityCatalog
    {
        static readonly EditorCapabilityDescriptor[] Items =
        {
            new("mgds.unity.editor.assets.inspect@0.1.0", false, "read"),
            new("mgds.unity.editor.assets.modify@0.1.0", true, "write"),
            new("mgds.unity.editor.build.run@0.1.0", true, "build"),
            new("mgds.unity.editor.capture.frame@0.1.0", false, "capture"),
            new("mgds.unity.editor.compile.await@0.1.0", false, "read"),
            new("mgds.unity.editor.coverage.collect@0.1.0", false, "read"),
            new("mgds.unity.editor.health.get@0.1.0", false, "read"),
            new("mgds.unity.editor.input.inject@0.1.0", true, "runtime-write"),
            new("mgds.unity.editor.logs.read@0.1.0", false, "read"),
            new("mgds.unity.editor.objects.inspect@0.1.0", false, "read"),
            new("mgds.unity.editor.objects.modify@0.1.0", true, "write"),
            new("mgds.unity.editor.play.control@0.1.0", true, "runtime-write"),
            new("mgds.unity.editor.profiler.capture@0.1.0", false, "capture"),
            new("mgds.unity.editor.scenes.inspect@0.1.0", false, "read"),
            new("mgds.unity.editor.scenes.modify@0.1.0", true, "write"),
            new("mgds.unity.editor.selection.inspect@0.1.0", false, "read"),
            new("mgds.unity.editor.tests.run@0.1.0", true, "execution")
        };

        public static IReadOnlyList<EditorCapabilityDescriptor> All => Items;

        public static string RequireProjectAssetPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !path.StartsWith("Assets/", StringComparison.Ordinal) ||
                path.Contains("..", StringComparison.Ordinal) || System.IO.Path.IsPathRooted(path))
                throw new ArgumentException("Path must be a normalized project-local Assets path.", nameof(path));
            return path.Replace('\\', '/');
        }

        [MgdsCommand("mgds.unity.editor.scenes.inspect@0.1.0", "mgds_scene_snapshot", "Return a bounded active-scene snapshot.")]
        public static string SceneSnapshot()
        {
            var scene = SceneManager.GetActiveScene();
            var roots = scene.IsValid() ? scene.GetRootGameObjects().Select(x => x.name).OrderBy(x => x, StringComparer.Ordinal).Take(256) : Enumerable.Empty<string>();
            return JsonUtility.ToJson(new SceneSnapshotPayload(scene.name ?? string.Empty, scene.path ?? string.Empty, roots.ToArray()));
        }

        [MgdsCommand("mgds.unity.editor.play.control@0.1.0", "mgds_play_set", "Enter or exit play mode through the editor scheduler.")]
        public static bool SetPlaying([MgdsArg("playing", "Requested play state.", Required = true)] bool playing)
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
                throw new InvalidOperationException("Editor is not stable enough to change play state.");
            EditorApplication.isPlaying = playing;
            return true;
        }

        [Serializable]
        sealed class SceneSnapshotPayload
        {
            public SceneSnapshotPayload(string name, string path, string[] roots)
            {
                this.name = name;
                this.path = path;
                this.roots = roots;
            }
            public string name;
            public string path;
            public string[] roots;
        }
    }
}
