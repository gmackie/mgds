using System;

namespace Mgds.GoldenArena
{
    [Serializable]
    public sealed class GoldenArenaState
    {
        public int Seed { get; private set; }
        public bool KeyCollected { get; private set; }
        public bool ExitUnlocked => KeyCollected;
        public bool Completed { get; private set; }
        public long InputSequence { get; private set; }
        public void Reset(int seed) { Seed = seed; KeyCollected = false; Completed = false; InputSequence = 0; }
        public void Apply(string action)
        {
            if (action != "collect-key" && action != "enter-exit") throw new ArgumentException("Unknown golden-arena action.", nameof(action));
            InputSequence++;
            if (action == "collect-key") KeyCollected = true;
            else if (ExitUnlocked) Completed = true;
        }
    }
}
