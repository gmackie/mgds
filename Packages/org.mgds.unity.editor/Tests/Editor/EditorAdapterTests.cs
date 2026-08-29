using System;
using System.Linq;
using Mgds.Unity.Core;
using NUnit.Framework;
using UnityEditor;

namespace Mgds.Unity.Editor.Tests
{
    public sealed class EditorAdapterTests
    {
        [Test]
        public void CatalogIsStableUniqueAndCoversRequiredSurfaces()
        {
            var ids = EditorCapabilityCatalog.All.Select(x => x.Id).ToArray();
            CollectionAssert.IsOrdered(ids);
            Assert.AreEqual(ids.Length, ids.Distinct().Count());
            CollectionAssert.IsSubsetOf(new[] { "read", "write", "build", "capture", "runtime-write", "execution" }, EditorCapabilityCatalog.All.Select(x => x.Risk).Distinct().ToArray());
            Assert.IsTrue(ids.Any(x => x.Contains("profiler")));
            Assert.IsTrue(ids.Any(x => x.Contains("coverage")));
        }

        [TestCase("/tmp/outside")]
        [TestCase("Assets/../ProjectSettings")]
        [TestCase("Packages/org.example/file")]
        public void AssetPathGuardRejectsBoundaryEscapes(string value)
        {
            Assert.Throws<ArgumentException>(() => EditorCapabilityCatalog.RequireProjectAssetPath(value));
        }

        [Test]
        public void CommandsRemainDiscoverableThroughCompatibilityAttribute()
        {
            Assert.IsTrue(TypeCache.GetMethodsWithAttribute<MgdsCommandAttribute>()
                .Any(x => x.DeclaringType == typeof(EditorCapabilityCatalog)));
        }
    }
}
