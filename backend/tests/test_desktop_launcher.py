from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from desktop import launcher  # noqa: E402


def test_default_data_dir_uses_native_user_locations(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))

    assert launcher.default_data_dir("Windows") == tmp_path / "local" / "Design Studio for FastLED"
    assert launcher.default_data_dir("Linux") == tmp_path / "xdg" / "design-studio-for-fastled"
    assert launcher.default_data_dir("Darwin").parts[-2:] == (
        "Application Support", "Design Studio for FastLED",
    )


def test_configure_environment_keeps_mutable_state_outside_bundle(monkeypatch, tmp_path):
    bundle = tmp_path / "installed"
    tools = bundle / "tools"
    tools.mkdir(parents=True)
    fbuild = tools / ("fbuild.exe" if os.name == "nt" else "fbuild")
    fbuild.write_bytes(b"tool")
    data = tmp_path / "user-data"

    monkeypatch.setattr(launcher, "install_dir", lambda: bundle)
    for key in ("FLS_DATA_DIR", "FLS_PATTERNS_DIR", "FLS_PROJECTS_DIR", "FBUILD_BIN"):
        monkeypatch.delenv(key, raising=False)
    old_path = os.environ.get("PATH", "")

    assert launcher.configure_environment(data) == data.resolve()
    assert os.environ["FLS_DATA_DIR"] == str(data.resolve())
    assert os.environ["FLS_PATTERNS_DIR"] == str(data.resolve() / "My Patterns")
    assert os.environ["FLS_PROJECTS_DIR"] == str(data.resolve() / "Projects")
    assert os.environ["FBUILD_BIN"] == str(fbuild)
    assert os.environ["PATH"].split(os.pathsep, 1) == [str(tools), old_path]


def test_app_version_reads_package_metadata():
    import json

    expected = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    assert launcher.app_version() == expected
