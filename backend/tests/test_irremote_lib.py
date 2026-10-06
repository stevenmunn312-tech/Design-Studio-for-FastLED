"""Arduino-IRremote is pinned and stays out of sketches that do not decode IR."""

from contextlib import nullcontext
from pathlib import Path
import json
import subprocess

import pytest

import firmware
import toolchain


def test_irremote_pin_matches_the_codegen_constant():
    source = Path(__file__).resolve().parents[2] / "src" / "codegen" / "peripherals" / "irRemoteCpp.ts"
    text = source.read_text(encoding="utf-8")
    assert f"'{toolchain._IRREMOTE_VERSION}'" in text


def test_irremote_checkout_accepts_only_the_pinned_release(tmp_path):
    library = tmp_path / "IRremote"
    header = library / "src" / "IRremote.hpp"
    header.parent.mkdir(parents=True)
    header.write_text("ok", encoding="utf-8")
    (library / "library.properties").write_text("name=IRremote\nversion=4.7.0\n", encoding="utf-8")
    assert toolchain._irremote_checkout_matches_pin(library) is False
    (library / "library.properties").write_text(
        f"name=IRremote\nversion={toolchain._IRREMOTE_VERSION}\n",
        encoding="utf-8",
    )
    assert toolchain._irremote_checkout_matches_pin(library) is True


def _mock_arduino_sketchbook(monkeypatch, tmp_path):
    monkeypatch.setattr(toolchain, "_ARDUINO_BASE", ["arduino-cli", "--config-file", "custom.yaml"])
    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, json.dumps({
            "config": {"directories": {"user": str(tmp_path)}},
        }))

    monkeypatch.setattr(toolchain.subprocess, "run", fake_run)
    return calls


def test_arduino_irremote_skips_install_and_rechecks_removed_library(tmp_path, monkeypatch):
    calls = _mock_arduino_sketchbook(monkeypatch, tmp_path)
    library = tmp_path / "libraries" / "IRremote"
    header = library / "src" / "IRremote.hpp"
    header.parent.mkdir(parents=True)
    header.write_text("ok", encoding="utf-8")
    (library / "library.properties").write_text(
        f"version={toolchain._IRREMOTE_VERSION}\n", encoding="utf-8",
    )
    installs = []

    def fake_install(label, args):
        installs.append(args)
        yield "installed\n"
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", fake_install)
    for _ in range(2):
        assert list(toolchain._ensure_arduino_irremote_lib()) == []
    assert installs == []
    assert calls == [toolchain._ARDUINO_BASE + ["config", "dump", "--format", "json"]] * 2
    header.unlink()
    assert list(toolchain._ensure_arduino_irremote_lib()) == ["installed\n"]
    assert installs == [toolchain._ARDUINO_BASE + [
        "lib", "install", f"IRremote@{toolchain._IRREMOTE_VERSION}", "--no-deps",
    ]]


@pytest.mark.parametrize("version", [None, "4.7.0", "4.8.0"])
def test_arduino_irremote_installs_missing_or_wrong_version(tmp_path, monkeypatch, version):
    _mock_arduino_sketchbook(monkeypatch, tmp_path)
    if version:
        library = tmp_path / "libraries" / "IRremote"
        (library / "src").mkdir(parents=True)
        (library / "src" / "IRremote.hpp").write_text("ok", encoding="utf-8")
        (library / "library.properties").write_text(f"version={version}\n", encoding="utf-8")

    def fake_install(label, args):
        yield "installed\n"
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", fake_install)
    assert list(toolchain._ensure_arduino_irremote_lib()) == ["installed\n"]


@pytest.mark.parametrize("output", ["invalid json", "[]", '{"config": null}', '{"directories": {}}'])
def test_arduino_irremote_config_failure_preserves_install_error(monkeypatch, output):
    monkeypatch.setattr(toolchain.subprocess, "run", lambda *args, **kwargs:
        subprocess.CompletedProcess(args, 0, output))

    def failed_install(label, args):
        yield "install failed\n"
        return 1

    monkeypatch.setattr(toolchain, "_run_phase", failed_install)
    generator = toolchain._ensure_arduino_irremote_lib()
    assert next(generator) == "install failed\n"
    assert "[error] failed to install Arduino-IRremote" in next(generator)
    with pytest.raises(StopIteration) as stopped:
        next(generator)
    assert stopped.value.value == 1


def test_compile_upload_fbuild_vendors_irremote_only_when_sketch_includes_it(monkeypatch):
    monkeypatch.setattr(toolchain, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(toolchain, "_fbuild_env_for_fqbn", lambda fqbn, flash_mb=None, usb_cdc=False: "esp32_esp32_esp32s3")
    monkeypatch.setattr(toolchain, "_write_fbuild_main", lambda ino: None)
    # This orchestration test must not move the developer's real cached libs.
    monkeypatch.setattr(toolchain, "_fbuild_libraries_for_sketch", lambda ino: nullcontext())
    calls = []
    monkeypatch.setattr(toolchain, "_ensure_fbuild_irremote_lib", lambda: calls.append(1) or iter(()))

    def fake_run_phase(label, args, sink=None, cwd=None, tool_env=None):
        if sink is not None:
            sink.append("Flash: 1.00KB / 10.00KB (10.0%)\n")
        yield "ok\n"
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", fake_run_phase)

    list(firmware._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", ""))
    assert calls == []

    list(firmware._compile_upload_fbuild(
        "Test", '#include <IRremote.hpp>\nvoid setup(){}', "esp32:esp32:esp32s3", "",
    ))
    assert calls == [1]


def test_irremote_pin_changes_sketch_identity(tmp_path, monkeypatch):
    monkeypatch.setattr(firmware, "_SKETCH_DIR_ROOT", tmp_path)
    source = "#include <IRremote.hpp>\nvoid setup() {}\n"
    with firmware._sketch_workspace("pattern", source) as directory:
        sketch = directory / "pattern.ino"
        assert sketch.read_text(encoding="utf-8") == f"// FLS-IRREMOTE: {toolchain._IRREMOTE_VERSION}\n" + source
        before = sketch.stat().st_mtime_ns
    with firmware._sketch_workspace("pattern", source):
        assert sketch.stat().st_mtime_ns == before
    plain = "void setup() {}\n"
    with firmware._sketch_workspace("plain", plain) as directory:
        assert (directory / "plain.ino").read_text(encoding="utf-8") == plain
