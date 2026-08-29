using Mgds.Unity.Core;

namespace Mgds.Unity.Core.Editor
{
    public static class CoreFixtureCommands
    {
        [MgdsCommand(
            "mgds.unity.editor.health.get@0.1.0",
            "mgds_health",
            "Return the bounded MGDS adapter health snapshot.",
            MainThreadRequired = false,
            Tags = new[] { "mgds/core", "observability/health" })]
        public static string Health()
        {
            return "ok";
        }
    }
}
