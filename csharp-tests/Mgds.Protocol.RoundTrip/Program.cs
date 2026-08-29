using System.Text.Json;
using System.Text.Json.Nodes;
using Mgds.Protocol.Generated;

var fixtureDocument = JsonNode.Parse(File.ReadAllText("fixtures/v0/evidence.valid.json"))!;
var artifactNode = fixtureDocument["artifact"]!;
var options = new JsonSerializerOptions { IncludeFields = true };
var artifact = artifactNode.Deserialize<MgdsArtifact>(options) ?? throw new InvalidOperationException("artifact did not deserialize");
var roundTrip = JsonSerializer.SerializeToNode(artifact, options) ?? throw new InvalidOperationException("artifact did not serialize");
if (!JsonNode.DeepEquals(artifactNode, roundTrip)) throw new InvalidOperationException($"round-trip mismatch: {roundTrip}");
Console.WriteLine("csharp round-trip: stable");
