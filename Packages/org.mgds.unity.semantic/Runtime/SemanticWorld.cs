using System;
using System.Collections.Generic;
using System.Linq;

namespace Mgds.Unity.Semantic
{
    public readonly struct SemanticEvent
    {
        public SemanticEvent(long sequence, string kind, string entityId) { Sequence = sequence; Kind = kind; EntityId = entityId; }
        public long Sequence { get; }
        public string Kind { get; }
        public string EntityId { get; }
    }

    public sealed class SemanticWorld
    {
        readonly Dictionary<string, IReadOnlyDictionary<string, string>> entities = new(StringComparer.Ordinal);
        readonly Queue<SemanticEvent> events = new();
        readonly int eventCapacity;
        long sequence;

        public SemanticWorld(int eventCapacity = 1024)
        {
            if (eventCapacity < 1 || eventCapacity > 100000) throw new ArgumentOutOfRangeException(nameof(eventCapacity));
            this.eventCapacity = eventCapacity;
        }

        public void Upsert(string entityId, IReadOnlyDictionary<string, string> state)
        {
            if (string.IsNullOrWhiteSpace(entityId) || !entityId.StartsWith("ent_", StringComparison.Ordinal)) throw new ArgumentException("Opaque entity ID required.");
            entities[entityId] = new Dictionary<string, string>(state ?? new Dictionary<string, string>(), StringComparer.Ordinal);
            Record("entity.upserted", entityId);
        }

        public bool AssertEquals(string entityId, string key, string expected, out string actual)
        {
            actual = entities.TryGetValue(entityId, out var state) && state.TryGetValue(key, out var value) ? value : null;
            return string.Equals(actual, expected, StringComparison.Ordinal);
        }

        public IReadOnlyList<SemanticEvent> EventsAfter(long cursor, int limit)
        {
            if (limit < 1 || limit > 1000) throw new ArgumentOutOfRangeException(nameof(limit));
            return events.Where(x => x.Sequence > cursor).Take(limit).ToArray();
        }

        void Record(string kind, string entityId)
        {
            events.Enqueue(new SemanticEvent(++sequence, kind, entityId));
            while (events.Count > eventCapacity) events.Dequeue();
        }
    }
}
