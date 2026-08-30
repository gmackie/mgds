using UnityEngine;

namespace Mgds.GoldenArena
{
    public sealed class GoldenArenaController : MonoBehaviour
    {
        [SerializeField] GameObject keyObject;
        [SerializeField] GameObject exitObject;
        [SerializeField] Transform player;
        [SerializeField] int seed;
        public GoldenArenaState State { get; private set; } = new GoldenArenaState();
        public bool IsConfigured => player != null && keyObject != null && exitObject != null;

        public void Initialize(int seed, Transform playerTransform, GameObject key, GameObject exit)
        {
            this.seed = seed;
            State.Reset(seed);
            player = playerTransform;
            keyObject = key;
            exitObject = exit;
        }

        void Awake()
        {
            State.Reset(seed);
            if (!IsConfigured) return;
            ApplyColor(player.GetComponent<Renderer>(), new Color(0.2f, 0.55f, 1f));
            ApplyColor(keyObject.GetComponent<Renderer>(), new Color(1f, 0.72f, 0.08f));
            ApplyColor(exitObject.GetComponent<Renderer>(), new Color(0.75f, 0.15f, 0.18f));
        }

        void Update()
        {
            if (player == null || State.Completed) return;
            var movement = new Vector3(Input.GetAxisRaw("Horizontal"), 0f, Input.GetAxisRaw("Vertical"));
            player.position += Vector3.ClampMagnitude(movement, 1f) * (4f * Time.deltaTime);
            if (Input.GetKeyDown(KeyCode.E))
            {
                if (!State.KeyCollected && Vector3.Distance(player.position, keyObject.transform.position) <= 1.5f) ApplyAction("collect-key");
                else if (State.ExitUnlocked && Vector3.Distance(player.position, exitObject.transform.position) <= 1.75f) ApplyAction("enter-exit");
            }
        }

        public void ApplyAction(string action)
        {
            State.Apply(action);
            if (State.KeyCollected && keyObject != null) keyObject.SetActive(false);
            if (State.ExitUnlocked && exitObject != null) ApplyColor(exitObject.GetComponent<Renderer>(), new Color(0.2f, 0.9f, 0.35f));
        }

        void OnGUI()
        {
            var message = State.Completed ? "Arena complete" : State.ExitUnlocked ? "Exit unlocked — reach the green gate and press E" : "Collect the gold key — press E nearby";
            GUI.Box(new Rect(20, 20, 440, 44), $"MGDS Golden Arena · Seed {State.Seed} · {message}");
        }

        static void ApplyColor(Renderer renderer, Color color)
        {
            if (renderer == null) return;
            var block = new MaterialPropertyBlock();
            renderer.GetPropertyBlock(block);
            block.SetColor("_BaseColor", color);
            block.SetColor("_Color", color);
            renderer.SetPropertyBlock(block);
        }
    }

    public static class GoldenArenaSceneFactory
    {
        public static GameObject Create(int seed)
        {
            var root = new GameObject("MGDS Golden Arena");
            var floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "Floor"; floor.transform.SetParent(root.transform); floor.transform.localScale = new Vector3(1.2f, 1f, 1.2f);

            var player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "Player"; player.transform.SetParent(root.transform); player.transform.position = new Vector3(-4f, 1f, 0f);

            var key = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            key.name = "Key"; key.transform.SetParent(root.transform); key.transform.position = new Vector3(0f, 0.6f, 2f); key.transform.localScale = Vector3.one * 0.65f;

            var exit = GameObject.CreatePrimitive(PrimitiveType.Cube);
            exit.name = "Exit"; exit.transform.SetParent(root.transform); exit.transform.position = new Vector3(4f, 1.5f, 0f); exit.transform.localScale = new Vector3(0.4f, 3f, 3f);

            var cameraObject = new GameObject("Main Camera", typeof(Camera));
            cameraObject.tag = "MainCamera"; cameraObject.transform.SetParent(root.transform); cameraObject.transform.position = new Vector3(0f, 11f, -10f); cameraObject.transform.rotation = Quaternion.Euler(42f, 0f, 0f);

            var lightObject = new GameObject("Directional Light", typeof(Light));
            lightObject.transform.SetParent(root.transform); lightObject.transform.rotation = Quaternion.Euler(50f, -30f, 0f); lightObject.GetComponent<Light>().type = LightType.Directional;

            var controller = root.AddComponent<GoldenArenaController>();
            controller.Initialize(seed, player.transform, key, exit);
            return root;
        }
    }
}
