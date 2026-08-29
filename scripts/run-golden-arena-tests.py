#!/usr/bin/env python3
"""Run golden-arena tests from a disposable case-insensitive project."""
from __future__ import annotations
import argparse, json, pathlib, shutil, subprocess, tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, default=REPO / "artifacts/unity/golden-arena.xml")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    source = REPO / "benchmarks/golden-arena"
    project = pathlib.Path(tempfile.mkdtemp(prefix="mgds-golden-arena-"))
    try:
        shutil.copytree(source, project, dirs_exist_ok=True)
        manifest_path = project / "Packages/manifest.json"
        manifest = json.loads(manifest_path.read_text())
        for name in ("org.mgds.unity.core", "org.mgds.unity.editor", "org.mgds.unity.player", "org.mgds.unity.semantic"):
            shutil.copytree(REPO / "Packages" / name, project / "Packages" / name)
            manifest["dependencies"][name] = f"file:{name}"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        (project / "Packages/packages-lock.json").unlink(missing_ok=True)
        output = args.output.resolve(); output.parent.mkdir(parents=True, exist_ok=True); output.unlink(missing_ok=True)
        command = ["unity", "test", str(project), "--mode", "EditMode", "--output", str(output), "--editor-version", "6000.3.9f1", "--timeout", str(args.timeout), "--non-interactive"]
        return subprocess.run(command, cwd=REPO, timeout=args.timeout + 60, check=False).returncode
    finally:
        shutil.rmtree(project, ignore_errors=True)

if __name__ == "__main__": raise SystemExit(main())
