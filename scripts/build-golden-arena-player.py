#!/usr/bin/env python3
"""Build Golden Arena from a disposable case-insensitive project and hash its output."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, shutil, subprocess, tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent

def sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, default=REPO / "artifacts/unity/golden-arena-player.json")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    source = REPO / "benchmarks/golden-arena"
    project = pathlib.Path(tempfile.mkdtemp(prefix="mgds-golden-build-"))
    try:
        shutil.copytree(source, project, dirs_exist_ok=True)
        manifest_path = project / "Packages/manifest.json"
        manifest = json.loads(manifest_path.read_text())
        for name in ("org.mgds.unity.core", "org.mgds.unity.editor", "org.mgds.unity.player", "org.mgds.unity.semantic"):
            shutil.copytree(REPO / "Packages" / name, project / "Packages" / name)
            manifest["dependencies"][name] = f"file:{name}"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        (project / "Packages/packages-lock.json").unlink(missing_ok=True)
        build = project / "Build/GoldenArena.app"
        command = ["unity", "build", str(project), "--target", "StandaloneOSX", "--output-path", str(build), "--editor-version", "6000.3.9f1", "--no-tail"]
        result = subprocess.run(command, cwd=REPO, timeout=args.timeout, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode != 0:
            return result.returncode
        files = []
        for path in sorted(item for item in build.rglob("*") if item.is_file()):
            content = path.read_bytes()
            files.append({"name": path.relative_to(build.parent).as_posix(), "hash": sha256(content), "size": len(content)})
        identities = [{"name": item["name"], "hash": item["hash"]} for item in files]
        report = {"schema": "mgds.player-build-smoke/v1", "status": "pass", "buildTarget": "desktop", "artifactHash": sha256(json.dumps(identities, sort_keys=True, separators=(",", ":")).encode()), "files": files}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"status": "pass", "files": len(files), "artifactHash": report["artifactHash"]}))
        return 0
    finally:
        shutil.rmtree(project, ignore_errors=True)

if __name__ == "__main__": raise SystemExit(main())
