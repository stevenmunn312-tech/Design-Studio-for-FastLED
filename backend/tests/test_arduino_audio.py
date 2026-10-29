"""Arduino Player builds select the helper's pinned, privately cached library."""
from pathlib import Path

import firmware
import toolchain


def test_private_audio_checkout_is_pinned_and_reused(tmp_path, monkeypatch):
    library = tmp_path / "private" / "ESP32-audioI2S"
    monkeypatch.setattr(toolchain, "_ARDUINO_AUDIO_LIB_DIR", library)
    calls = []

    def run(label, args, **kwargs):
        calls.append(args)
        (library / "src").mkdir(parents=True)
        (library / "src/Audio.h").write_text("// pinned audio", encoding="utf-8")
        yield "cloned\n"
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", run)
    _, rc = firmware._drain_compile(toolchain._ensure_arduino_audio_lib())
    assert rc == 0
    assert calls[0][calls[0].index("--branch") + 1] == "3.0.12"
    assert calls[0][-1] == str(library)
    assert (library / ".fls-version").read_text(encoding="utf-8") == "3.0.12"
    assert firmware._drain_compile(toolchain._ensure_arduino_audio_lib()) == ([], 0)
    assert len(calls) == 1


def test_incomplete_audio_clone_is_retried_even_when_header_exists(tmp_path, monkeypatch):
    library = tmp_path / "private"
    monkeypatch.setattr(toolchain, "_ARDUINO_AUDIO_LIB_DIR", library)
    calls = []

    def run(*args, **kwargs):
        calls.append(1)
        (library / "src").mkdir(parents=True)
        (library / "src/Audio.h").touch()
        yield "partial clone\n"
        return 1 if len(calls) == 1 else 0

    monkeypatch.setattr(toolchain, "_run_phase", run)
    assert firmware._drain_compile(toolchain._ensure_arduino_audio_lib())[1] == 1
    assert not (library / ".fls-version").exists()
    assert firmware._drain_compile(toolchain._ensure_arduino_audio_lib())[1] == 0
    assert len(calls) == 2


def test_arduino_compile_selects_private_audio_only_for_player(tmp_path, monkeypatch):
    private = tmp_path / "private audio"
    monkeypatch.setattr(toolchain, "_ARDUINO_AUDIO_LIB_DIR", private)
    calls = []

    def ensure():
        calls.append("prepare")
        yield "ready\n"
        return 0

    def run(label, args, **kwargs):
        calls.append(args)
        yield "compiled\n"
        return 0

    monkeypatch.setattr(toolchain, "_ensure_arduino_audio_lib", ensure)
    monkeypatch.setattr(toolchain, "_run_phase", run)
    sketch = tmp_path / "sketch"
    sketch.mkdir()
    source = sketch / "sketch.ino"
    source.write_text("void setup() {}", encoding="utf-8")
    assert firmware._drain_compile(firmware._compile_upload("Test", sketch, "esp32:esp32:esp32s3", ""))[1] == (0, "compile")
    assert "--library" not in calls[0]
    calls.clear()
    source.write_text("#include <Audio.h>\nvoid setup() {}", encoding="utf-8")
    assert firmware._drain_compile(firmware._compile_upload("Test", sketch, "esp32:esp32:esp32s3", ""))[1] == (0, "compile")
    assert calls[0] == "prepare"
    assert calls[1][calls[1].index("--library") + 1] == str(private)
    assert Path(calls[1][-1]) == sketch


def test_audio_pin_changes_sketch_identity_without_touching_identical_rebuilds(tmp_path, monkeypatch):
    monkeypatch.setattr(firmware, "_SKETCH_DIR_ROOT", tmp_path)
    source = "#include <Audio.h>\nvoid setup() {}\n"
    with firmware._sketch_workspace("player", source) as directory:
        sketch = directory / "player.ino"
        assert sketch.read_text(encoding="utf-8") == "// FLS-PLAYER-AUDIO: 3.0.12\n" + source
        before = sketch.stat().st_mtime_ns
    with firmware._sketch_workspace("player", source):
        assert sketch.stat().st_mtime_ns == before
    monkeypatch.setattr(toolchain, "_PLAYER_AUDIO_VERSION", "3.0.13")
    with firmware._sketch_workspace("player", source):
        assert sketch.read_text(encoding="utf-8") == "// FLS-PLAYER-AUDIO: 3.0.13\n" + source


def test_bluetooth_libraries_are_pinned_sparse_and_reused(tmp_path, monkeypatch):
    a2dp = tmp_path / "private" / "ESP32-A2DP"
    tools = tmp_path / "private" / "arduino-audio-tools"
    monkeypatch.setattr(toolchain, "_ARDUINO_A2DP_LIB_DIR", a2dp)
    monkeypatch.setattr(toolchain, "_ARDUINO_AUDIO_TOOLS_LIB_DIR", tools)
    calls = []

    def run(label, args, **kwargs):
        calls.append(args)
        if "clone" in args:
            library = Path(args[-1])
            (library / "src").mkdir(parents=True)
            header = "BluetoothA2DPSink.h" if library == a2dp else "AudioTools.h"
            (library / "src" / header).write_text("// pinned", encoding="utf-8")
        yield "ok\n"
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", run)
    assert firmware._drain_compile(toolchain._ensure_arduino_bluetooth_libs())[1] == 0
    clones = [args for args in calls if "clone" in args]
    assert [args[args.index("--branch") + 1] for args in clones] == ["v1.8.9", "v1.2.6"]
    # audio-tools' examples pass Windows' path limit; only src/ is checked out.
    assert "--sparse" not in clones[0] and "--sparse" in clones[1]
    assert ["git", "-C", str(tools), "sparse-checkout", "set", "src"] in calls
    assert (a2dp / ".fls-version").read_text(encoding="utf-8") == "v1.8.9"
    assert (tools / ".fls-version").read_text(encoding="utf-8") == "v1.2.6"
    calls.clear()
    assert firmware._drain_compile(toolchain._ensure_arduino_bluetooth_libs()) == ([], 0)
    assert calls == []


def test_arduino_compile_selects_both_bluetooth_libraries(tmp_path, monkeypatch):
    monkeypatch.setattr(toolchain, "_ARDUINO_A2DP_LIB_DIR", tmp_path / "a2dp")
    monkeypatch.setattr(toolchain, "_ARDUINO_AUDIO_TOOLS_LIB_DIR", tmp_path / "tools")
    calls = []

    def ensure():
        calls.append("prepare")
        yield "ready\n"
        return 0

    def run(label, args, **kwargs):
        calls.append(args)
        yield "compiled\n"
        return 0

    monkeypatch.setattr(toolchain, "_ensure_arduino_bluetooth_libs", ensure)
    monkeypatch.setattr(toolchain, "_run_phase", run)
    sketch = tmp_path / "sketch"
    sketch.mkdir()
    (sketch / "sketch.ino").write_text('#include "BluetoothA2DPSink.h"\nvoid setup() {}', encoding="utf-8")
    assert firmware._drain_compile(firmware._compile_upload("Test", sketch, "esp32:esp32:esp32", ""))[1] == (0, "compile")
    assert calls[0] == "prepare"
    libraries = [calls[1][i + 1] for i, arg in enumerate(calls[1]) if arg == "--library"]
    assert libraries == [str(tmp_path / "a2dp"), str(tmp_path / "tools")]


def test_fbuild_refuses_a_bluetooth_player_before_taking_the_build_lock(monkeypatch):
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "fbuild")
    lines, (rc, phase) = firmware._drain_compile(firmware._compile_upload_fbuild(
        "Player", '#include "BluetoothA2DPSink.h"\nvoid setup() {}', "esp32:esp32:esp32", ""))
    assert (rc, phase) == (-1, "compile")
    assert "arduino-cli only" in "".join(lines)
