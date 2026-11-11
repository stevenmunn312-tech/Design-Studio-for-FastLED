"""The HUB75 DMA library is pinned for both engines and installed for Arduino CLI on first use."""

import json
import subprocess

import pytest

import toolchain

FOLDER = "ESP32_HUB75_LED_MATRIX_PANEL_DMA_Display"


def _mock_arduino_sketchbook(monkeypatch, tmp_path):
    monkeypatch.setattr(toolchain.subprocess, "run", lambda args, **kwargs: subprocess.CompletedProcess(
        args, 0, json.dumps({"config": {"directories": {"user": str(tmp_path)}}})))


def _library(tmp_path, version):
    library = tmp_path / "libraries" / FOLDER
    (library / "src").mkdir(parents=True)
    (library / "src" / toolchain._HUB75_HEADER).write_text("ok", encoding="utf-8")
    # The release writes a space after the equals sign.
    (library / "library.properties").write_text(f"version= {version}\n", encoding="utf-8")
    return library


def _installer(monkeypatch, rc=0):
    installs = []

    def fake_install(label, args):
        installs.append(args)
        yield "installed\n"
        return rc

    monkeypatch.setattr(toolchain, "_run_phase", fake_install)
    return installs


def test_arduino_hub75_skips_install_when_the_pinned_release_is_present(tmp_path, monkeypatch):
    _mock_arduino_sketchbook(monkeypatch, tmp_path)
    _library(tmp_path, toolchain._HUB75_VERSION)
    installs = _installer(monkeypatch)
    assert list(toolchain._ensure_arduino_hub75_lib()) == []
    assert installs == []


@pytest.mark.parametrize("version", [None, "3.0.13", "3.0.15"])
def test_arduino_hub75_installs_missing_or_wrong_version_without_dependencies(tmp_path, monkeypatch, version):
    _mock_arduino_sketchbook(monkeypatch, tmp_path)
    if version:
        _library(tmp_path, version)
    installs = _installer(monkeypatch)
    assert list(toolchain._ensure_arduino_hub75_lib()) == ["installed\n"]
    assert installs == [toolchain._ARDUINO_BASE + [
        "lib", "install", f"{toolchain._HUB75_ARDUINO_NAME}@{toolchain._HUB75_VERSION}", "--no-deps",
    ]]


def test_arduino_hub75_install_failure_names_the_command(tmp_path, monkeypatch):
    _mock_arduino_sketchbook(monkeypatch, tmp_path)
    _installer(monkeypatch, rc=1)
    output = list(toolchain._ensure_arduino_hub75_lib())
    assert output[0] == "installed\n"
    assert "--no-deps" in output[1] and toolchain._HUB75_VERSION in output[1]
