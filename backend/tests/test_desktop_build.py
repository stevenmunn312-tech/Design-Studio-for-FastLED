from __future__ import annotations

import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from desktop import build  # noqa: E402


def test_require_executable_returns_resolved_launcher(monkeypatch):
    monkeypatch.setattr(build.shutil, "which", lambda name: rf"C:\Tools\{name}.cmd")

    assert build.require_executable("npm") == r"C:\Tools\npm.cmd"


def test_require_executable_reports_missing_command(monkeypatch):
    monkeypatch.setattr(build.shutil, "which", lambda _name: None)

    with pytest.raises(SystemExit, match="npm is missing from PATH"):
        build.require_executable("npm")


def test_build_frontend_uses_resolved_npm_command(monkeypatch, tmp_path):
    commands: list[list[str]] = []
    (tmp_path / "dist").mkdir()
    (tmp_path / "dist" / "index.html").write_text("ok", encoding="utf-8")
    monkeypatch.setattr(build, "ROOT", tmp_path)
    monkeypatch.setattr(build, "require_executable", lambda name: rf"C:\Tools\{name}.cmd")
    monkeypatch.setattr(build, "run", lambda args: commands.append(args))

    build.build_frontend(skip=False)

    assert commands == [[r"C:\Tools\npm.cmd", "run", "build"]]
