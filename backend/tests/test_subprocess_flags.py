"""Every helper subprocess must start without a console window.

The packaged Windows launcher has no console, so a spawn that omits
NO_CONSOLE_WINDOW opens a console window for each tool it runs.
"""
from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path

import pytest

from subprocess_flags import NO_CONSOLE_WINDOW

BACKEND = Path(__file__).resolve().parents[1]
SPAWNERS = {"run", "Popen", "call", "check_call", "check_output"}
# Spawns that only run on macOS/Linux, where the flag means nothing.
POSIX_ONLY = {("open",), ("xdg-open",)}


def _spawn_calls():
    for path in sorted(BACKEND.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in SPAWNERS
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id == "subprocess"
            ):
                yield path.name, node


def _posix_only(call: ast.Call) -> bool:
    if not call.args or not isinstance(call.args[0], ast.List):
        return False
    first = call.args[0].elts[:1]
    return tuple(e.value for e in first if isinstance(e, ast.Constant)) in POSIX_ONLY


def test_every_helper_spawn_hides_its_console_window():
    missing = [
        f"{name}:{call.lineno}"
        for name, call in _spawn_calls()
        if not _posix_only(call)
        and not any(kw.arg == "creationflags" for kw in call.keywords)
    ]
    assert list(_spawn_calls()), "the scan found no subprocess calls; update the scanner"
    assert missing == []


@pytest.mark.skipif(sys.platform != "win32", reason="CREATE_NO_WINDOW is Windows-only")
def test_flag_is_create_no_window_on_windows():
    assert NO_CONSOLE_WINDOW == subprocess.CREATE_NO_WINDOW


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX value")
def test_flag_is_zero_elsewhere():
    assert NO_CONSOLE_WINDOW == 0
