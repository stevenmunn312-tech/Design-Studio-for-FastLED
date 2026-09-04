"""Arduino Player builds select the helper's pinned, privately cached library."""
from pathlib import Path

import app


def test_private_audio_checkout_is_pinned_and_reused(tmp_path, monkeypatch):
    library = tmp_path / "private" / "ESP32-audioI2S"
    monkeypatch.setattr(app, "_ARDUINO_AUDIO_LIB_DIR", library)
    calls = []

    def run(label, args, **kwargs):
        calls.append(args)
        (library / "src").mkdir(parents=True)
        (library / "src/Audio.h").write_text("// pinned audio", encoding="utf-8")
        yield "cloned\n"
        return 0

    monkeypatch.setattr(app, "_run_phase", run)
    _, rc = app._drain_compile(app._ensure_arduino_audio_lib())
    assert rc == 0
    assert calls[0][calls[0].index("--branch") + 1] == "3.0.12"
    assert calls[0][-1] == str(library)
    assert (library / ".fls-version").read_text(encoding="utf-8") == "3.0.12"
    assert app._drain_compile(app._ensure_arduino_audio_lib()) == ([], 0)
    assert len(calls) == 1


def test_incomplete_audio_clone_is_retried_even_when_header_exists(tmp_path, monkeypatch):
    library = tmp_path / "private"
    monkeypatch.setattr(app, "_ARDUINO_AUDIO_LIB_DIR", library)
    calls = []

    def run(*args, **kwargs):
        calls.append(1)
        (library / "src").mkdir(parents=True)
        (library / "src/Audio.h").touch()
        yield "partial clone\n"
        return 1 if len(calls) == 1 else 0

    monkeypatch.setattr(app, "_run_phase", run)
    assert app._drain_compile(app._ensure_arduino_audio_lib())[1] == 1
    assert not (library / ".fls-version").exists()
    assert app._drain_compile(app._ensure_arduino_audio_lib())[1] == 0
    assert len(calls) == 2


def test_arduino_compile_selects_private_audio_only_for_player(tmp_path, monkeypatch):
    private = tmp_path / "private audio"
    monkeypatch.setattr(app, "_ARDUINO_AUDIO_LIB_DIR", private)
    calls = []

    def ensure():
        calls.append("prepare")
        yield "ready\n"
        return 0

    def run(label, args, **kwargs):
        calls.append(args)
        yield "compiled\n"
        return 0

    monkeypatch.setattr(app, "_ensure_arduino_audio_lib", ensure)
    monkeypatch.setattr(app, "_run_phase", run)
    sketch = tmp_path / "sketch"
    sketch.mkdir()
    source = sketch / "sketch.ino"
    source.write_text("void setup() {}", encoding="utf-8")
    assert app._drain_compile(app._compile_upload("Test", sketch, "esp32:esp32:esp32s3", ""))[1] == (0, "compile")
    assert "--library" not in calls[0]
    calls.clear()
    source.write_text("#include <Audio.h>\nvoid setup() {}", encoding="utf-8")
    assert app._drain_compile(app._compile_upload("Test", sketch, "esp32:esp32:esp32s3", ""))[1] == (0, "compile")
    assert calls[0] == "prepare"
    assert calls[1][calls[1].index("--library") + 1] == str(private)
    assert Path(calls[1][-1]) == sketch


def test_audio_pin_changes_sketch_identity_without_touching_identical_rebuilds(tmp_path, monkeypatch):
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path)
    source = "#include <Audio.h>\nvoid setup() {}\n"
    with app._sketch_workspace("player", source) as directory:
        sketch = directory / "player.ino"
        assert sketch.read_text(encoding="utf-8") == "// FLS-PLAYER-AUDIO: 3.0.12\n" + source
        before = sketch.stat().st_mtime_ns
    with app._sketch_workspace("player", source):
        assert sketch.stat().st_mtime_ns == before
    monkeypatch.setattr(app, "_PLAYER_AUDIO_VERSION", "3.0.13")
    with app._sketch_workspace("player", source):
        assert sketch.read_text(encoding="utf-8") == "// FLS-PLAYER-AUDIO: 3.0.13\n" + source
