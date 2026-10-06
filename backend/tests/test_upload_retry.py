"""Upload retries must flash the previously compiled firmware without a build."""
import pytest

import firmware
import toolchain


@pytest.fixture(autouse=True)
def clear_compiled_uploads():
    firmware._compiled_uploads.clear()
    yield
    firmware._compiled_uploads.clear()


@pytest.mark.parametrize("engine", ["arduino-cli", "fbuild"])
def test_failed_flash_retries_without_compiling(engine, tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "arduino-cli")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "fbuild")
    monkeypatch.setattr(toolchain, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(toolchain, "_write_fbuild_main", lambda ino: None)
    monkeypatch.setattr(toolchain, "_fbuild_env_for_fqbn", lambda *args: "arduino_avr_uno")

    def phase(label, args, **kwargs):
        calls.append(args)
        yield f"=== {label} ===\n"
        return 1 if "upload" in args or "deploy" in args else 0

    monkeypatch.setattr(toolchain, "_run_phase", phase)
    sketch = tmp_path / "sketch"
    sketch.mkdir()
    (sketch / "sketch.ino").write_text("void setup(){}", encoding="utf-8")

    def run(reuse=False, source="void setup(){}", fqbn="arduino:avr:uno"):
        if engine == "fbuild":
            return firmware._drain_compile(firmware._compile_upload_fbuild(
                "Sketch", source, fqbn, "COM7", reuse_compiled=reuse))
        (sketch / "sketch.ino").write_text(source, encoding="utf-8")
        return firmware._drain_compile(firmware._compile_upload(
            "Sketch", sketch, fqbn, "COM7", reuse_compiled=reuse))

    lines, result = run()
    assert result == (1, "upload")
    assert "[compiled] firmware ready" in "".join(lines)
    assert len(calls) == 2
    lines, result = run(reuse=True)
    assert result == (1, "upload")
    assert len(calls) == 3
    assert "deploy" in calls[-1] or "upload" in calls[-1]
    assert "skipping compilation" in "".join(lines)

    # A different program or board must never flash the old artifact.
    lines, result = run(reuse=True, source="void setup(){ delay(1); }")
    assert result == (-1, "upload")
    assert len(calls) == 3
    assert "no longer available" in "".join(lines)
    lines, result = run(reuse=True, fqbn="arduino:avr:nano")
    assert result == (-1, "upload")
    assert len(calls) == 3

    # Another successful build replaces the workspace's compiled program.
    run(source="void setup(){ delay(1); }")
    assert len(calls) == 5
    assert run(reuse=True)[1] == (-1, "upload")
    assert len(calls) == 5


@pytest.mark.parametrize("engine", ["arduino-cli", "fbuild"])
def test_failed_compile_cannot_be_reused(engine, tmp_path, monkeypatch):
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "arduino-cli")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "fbuild")
    monkeypatch.setattr(toolchain, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(toolchain, "_write_fbuild_main", lambda ino: None)
    monkeypatch.setattr(toolchain, "_fbuild_env_for_fqbn", lambda *args: "arduino_avr_uno")
    calls = []

    def phase(label, args, **kwargs):
        calls.append(args)
        yield "compile error\n"
        return 1

    monkeypatch.setattr(toolchain, "_run_phase", phase)
    sketch = tmp_path / "sketch"
    sketch.mkdir()
    (sketch / "sketch.ino").write_text("void setup(){}", encoding="utf-8")

    def run(reuse):
        if engine == "fbuild":
            return firmware._drain_compile(firmware._compile_upload_fbuild(
                "Sketch", "void setup(){}", "arduino:avr:uno", "COM7", reuse_compiled=reuse))
        return firmware._drain_compile(firmware._compile_upload(
            "Sketch", sketch, "arduino:avr:uno", "COM7", reuse_compiled=reuse))

    assert run(False)[1] == (1, "compile")
    assert run(True)[1] == (-1, "upload")
    assert len(calls) == 1
