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


def test_windows_launcher_is_built_without_a_console_and_with_the_icon(monkeypatch):
    monkeypatch.setattr(build.os, "name", "nt")
    args = build.launcher_platform_args()
    assert args[0] == "--windowed"
    assert Path(args[args.index("--icon") + 1]).is_file()

    monkeypatch.setattr(build.os, "name", "posix")
    assert build.launcher_platform_args() == ["--console"]


def test_msix_version_has_four_parts_and_a_zero_store_revision():
    assert build.msix_version("0.7.0") == "0.7.0.0"
    assert build.msix_version("1.2.3-beta.1") == "1.2.3.0"
    with pytest.raises(SystemExit):
        build.msix_version("1.2")


def test_appx_manifest_is_valid_xml_naming_files_that_exist():
    import xml.etree.ElementTree as ET

    text = build.render_appx_manifest("Vendor.App", 'CN=A & B, O="Q"', "A & B", "0.7.0")
    ns = {
        "m": "http://schemas.microsoft.com/appx/manifest/foundation/windows10",
        "uap": "http://schemas.microsoft.com/appx/manifest/uap/windows10",
    }
    root = ET.fromstring(text)
    identity = root.find("m:Identity", ns)
    assert identity.get("Name") == "Vendor.App"
    assert identity.get("Publisher") == 'CN=A & B, O="Q"'
    assert identity.get("Version") == "0.7.0.0"
    assert root.find("m:Properties/m:PublisherDisplayName", ns).text == "A & B"

    app = root.find("m:Applications/m:Application", ns)
    assert app.get("Executable") == f"{build.APP_NAME}.exe"
    visuals = app.find("uap:VisualElements", ns)
    logos = [root.find("m:Properties/m:Logo", ns).text, visuals.get("Square150x150Logo"),
             visuals.get("Square44x44Logo"), visuals.find("uap:DefaultTile", ns).get("Wide310x150Logo")]
    for logo in logos:
        assert (build.ASSETS / "msix" / Path(logo.replace("\\", "/")).name).is_file(), logo
