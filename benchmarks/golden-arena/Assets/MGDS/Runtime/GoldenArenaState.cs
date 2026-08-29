using System;

namespace Mgds.GoldenArena
{
    [Serializable]
    public sealed class GoldenArenaState
    {
        public int Seed { get; private set; }
        public bool KeyCollected { get; private set; }
        public bool ExitUnlocked => KeyCollected;
        public long InputSequence { get; private set; }
        public void Reset(int seed) { Seed = seed; KeyCollected = false; InputSequence = 0; }
        public void Apply(string action) { InputSequence++; if (action == "collect-key") KeyCollected = true; }
    }
}
