"""Pololu VL53L0X is pinned and stays out of sketches that do not range with it."""

from pathlib import Path

import app as app_module


def test_vl53l0x_pin_matches_the_codegen_constant():
    source = Path(__file__).resolve().parents[2] / "src" / "codegen" / "distanceSensorCpp.ts"
    text = source.read_text(encoding="utf-8")
    assert f"'{app_module._VL53L0X_VERSION}'" in text
    assert app_module._VL53L0X_INCLUDE in text


def test_vl53l0x_checkout_accepts_only_the_pinned_release(tmp_path):
    library = tmp_path / "VL53L0X"
    library.mkdir()
    (library / "VL53L0X.h").write_text("ok", encoding="utf-8")
    (library / "library.properties").write_text("name=VL53L0X\nversion=1.3.0\n", encoding="utf-8")
    assert app_module._vl53l0x_checkout_matches_pin(library) is False
    (library / "library.properties").write_text(
        f"name=VL53L0X\nversion={app_module._VL53L0X_VERSION}\n",
        encoding="utf-8",
    )
    assert app_module._vl53l0x_checkout_matches_pin(library) is True


def test_compile_upload_fbuild_vendors_vl53l0x_only_when_sketch_includes_it(monkeypatch):
    monkeypatch.setattr(app_module, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app_module, "_fbuild_env_for_fqbn", lambda fqbn, flash_mb=None, usb_cdc=False: "esp32_esp32_esp32s3")
    monkeypatch.setattr(app_module, "_write_fbuild_main", lambda ino: None)
    calls = []
    monkeypatch.setattr(app_module, "_ensure_fbuild_vl53l0x_lib", lambda: calls.append(1) or iter(()))

    def fake_run_phase(label, args, sink=None, cwd=None, tool_env=None):
        if sink is not None:
            sink.append("Flash: 1.00KB / 10.00KB (10.0%)\n")
        yield "ok\n"
        return 0

    monkeypatch.setattr(app_module, "_run_phase", fake_run_phase)

    list(app_module._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", ""))
    assert calls == []

    list(app_module._compile_upload_fbuild(
        "Test", "#include <VL53L0X.h>\nvoid setup(){}", "esp32:esp32:esp32s3", "",
    ))
    assert calls == [1]


def test_vl53l0x_pin_changes_sketch_identity(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "_SKETCH_DIR_ROOT", tmp_path)
    source = "#include <VL53L0X.h>\nvoid setup() {}\n"
    with app_module._sketch_workspace("laser", source) as directory:
        sketch = directory / "laser.ino"
        assert sketch.read_text(encoding="utf-8") == f"// FLS-VL53L0X: {app_module._VL53L0X_VERSION}\n" + source
    plain = "void setup() {}\n"
    with app_module._sketch_workspace("plain", plain) as directory:
        assert (directory / "plain.ino").read_text(encoding="utf-8") == plain
