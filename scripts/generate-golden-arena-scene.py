#!/usr/bin/env python3
"""Generate the checked-in Golden Arena scene through Unity on a disposable volume."""
from __future__ import annotations
import json, pathlib, shutil, subprocess, tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent
SOURCE = REPO / "benchmarks/golden-arena"

def main() -> int:
    project = pathlib.Path(tempfile.mkdtemp(prefix="mgds-golden-scene-"))
    try:
        shutil.copytree(SOURCE, project, dirs_exist_ok=True)
        manifest_path = project / "Packages/manifest.json"
        manifest = json.loads(manifest_path.read_text())
        for name in ("org.mgds.unity.core", "org.mgds.unity.editor", "org.mgds.unity.player", "org.mgds.unity.semantic"):
            shutil.copytree(REPO / "Packages" / name, project / "Packages" / name)
            manifest["dependencies"][name] = f"file:{name}"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        (project / "Packages/packages-lock.json").unlink(missing_ok=True)
        command = [
            "unity", "run", str(project), "--editor-version", "6000.3.9f1", "--timeout", "300", "--",
            "-nographics", "-executeMethod", "Mgds.GoldenArena.Editor.GoldenArenaSceneBuilder.Build",
        ]
        result = subprocess.run(command, cwd=REPO, timeout=360, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode != 0:
            return result.returncode
        for relative in ("Assets/Scenes/GoldenArena.unity", "Assets/Scenes/GoldenArena.unity.meta", "ProjectSettings/EditorBuildSettings.asset"):
            target = SOURCE / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(project / relative, target)
        return 0
    finally:
        shutil.rmtree(project, ignore_errors=True)

if __name__ == "__main__": raise SystemExit(main())
