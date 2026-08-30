using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

namespace Mgds.GoldenArena.Editor
{
    public static class GoldenArenaSceneBuilder
    {
        public static void Build()
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GoldenArenaSceneFactory.Create(1337);
            if (!EditorSceneManager.SaveScene(scene, "Assets/Scenes/GoldenArena.unity")) throw new IOException("Unable to save golden arena scene.");
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/GoldenArena.unity", true) };
            AssetDatabase.SaveAssets();
        }
    }
}
