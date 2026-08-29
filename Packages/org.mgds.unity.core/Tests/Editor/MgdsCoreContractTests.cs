using System.Linq;
using System.Reflection;
using Mgds.Unity.Core;
using Mgds.Unity.Core.Editor;
using NUnit.Framework;
using Unity.Pipeline.Commands;
using UnityEditor;

namespace Mgds.Unity.Tests
{
    public sealed class MgdsCoreContractTests
    {
        [Test]
        public void CompatibilityAttributesExposePinnedPipelineMetadata()
        {
            var method = typeof(CoreFixtureCommands).GetMethod(nameof(CoreFixtureCommands.Health));
            var command = method.GetCustomAttribute<CliCommandAttribute>();
            Assert.AreEqual("mgds_health", command.Name);
            Assert.IsFalse(command.MainThreadRequired);
            Assert.AreEqual("0.5.0-exp.1", UnityPipelineCompatibility.PackageVersion);
        }

        [Test]
        public void ManifestDiscoveryIsStableSortedAndProjectScoped()
        {
            var first = MgdsManifestBuilder.Discover("prj_01K3YXA0J3V6J2HM8Q4W", 7);
            var second = MgdsManifestBuilder.Discover("prj_01K3YXA0J3V6J2HM8Q4W", 7);
            Assert.AreEqual(first.Json, second.Json);
            Assert.AreEqual(7, first.Generation);
            CollectionAssert.IsOrdered(first.CapabilityIds);
            Assert.IsTrue(first.CapabilityIds.Contains("mgds.unity.editor.health.get@0.1.0"));
        }

        [Test]
        public void CompatibilityCommandsRemainVisibleToUnityTypeCache()
        {
            Assert.IsTrue(TypeCache.GetMethodsWithAttribute<CliCommandAttribute>()
                .Any(method => method.DeclaringType == typeof(CoreFixtureCommands)));
        }
    }
}
