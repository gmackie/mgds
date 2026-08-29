#!/usr/bin/env python3
"""Run a local UPM package's tests from a disposable case-insensitive project."""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import tempfile


REPO = pathlib.Path(__file__).resolve().parent.parent


def dependencies_for(package: pathlib.Path) -> tuple[str, dict[str, str], dict[str, pathlib.Path]]:
    metadata = json.loads((package / "package.json").read_text())
    package_name = metadata["name"]
    dependencies: dict[str, str] = {package_name: f"file:{package_name}"}
    local_packages: dict[str, pathlib.Path] = {package_name: package.resolve()}
    pending = list((metadata.get("dependencies") or {}).items())
    expanded: set[str] = set()
    while pending:
        name, version = pending.pop(0)
        sibling = package.parent / name
        if not (sibling / "package.json").is_file():
            dependencies.setdefault(name, version)
            continue
        dependencies[name] = f"file:{name}"
        local_packages[name] = sibling.resolve()
        if name in expanded:
            continue
        expanded.add(name)
        sibling_metadata = json.loads((sibling / "package.json").read_text())
        pending.extend((sibling_metadata.get("dependencies") or {}).items())
    dependencies.setdefault("com.unity.test-framework", "1.6.0")
    return package_name, dependencies, local_packages


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--mode", default="EditMode")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()

    package = args.package.resolve()
    output = args.output.resolve()
    package_name, dependencies, local_packages = dependencies_for(package)
    project = pathlib.Path(tempfile.mkdtemp(prefix="mgds-unity-tests-"))
    try:
        (project / "Assets").mkdir()
        (project / "Packages").mkdir()
        (project / "ProjectSettings").mkdir()
        for name, source in local_packages.items():
            shutil.copytree(source, project / "Packages" / name)
        (project / "Packages" / "manifest.json").write_text(json.dumps({"dependencies": dependencies, "testables": [package_name]}, indent=2) + "\n")
        (project / "ProjectSettings" / "ProjectVersion.txt").write_text("m_EditorVersion: 6000.3.9f1\nm_EditorVersionWithRevision: 6000.3.9f1\n")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.unlink(missing_ok=True)
        command = [
            "unity", "test", str(project), "--mode", args.mode,
            "--output", str(output), "--editor-version", "6000.3.9f1",
            "--timeout", str(args.timeout), "--non-interactive",
        ]
        return subprocess.run(command, cwd=REPO, check=False, timeout=args.timeout + 60).returncode
    finally:
        shutil.rmtree(project, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
