"""A build whose engine binary is absent must say so, not crash.

Every HTTP entry point checks for the engine and answers 400, but the two
compile generators are also called directly — `scripts/compile-fixtures/compile-display-smoke.py`
runs the display fixture matrix through them — and neither checked. Found by
running that matrix: with fbuild off PATH, `_FBUILD_BIN` is None and building
its argument list raised `TypeError: sequence item 0: expected str instance,
NoneType found` from inside `_run_phase`, losing the run and the reason for it.
arduino-cli did not crash but reported "failed to launch compile", naming the
subcommand as though it were the missing program.
"""
import firmware
import toolchain


def drain(generator):
    lines = []
    try:
        while True:
            lines.append(next(generator))
    except StopIteration as stop:
        return "".join(lines), stop.value


def test_fbuild_refuses_without_its_binary(monkeypatch):
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", None)

    text, result = drain(firmware._compile_upload_fbuild("Smoke", "// sketch", "esp32:esp32:esp32s3", "", 16))

    assert result == (-1, "compile")
    assert "fbuild was not found" in text
    assert "pip install fbuild" in text
    assert "Nothing was compiled or sent to the board." in text


def test_fbuild_refusal_does_not_take_the_build_lock(monkeypatch):
    """A build that cannot run must not make the next one queue behind it."""
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", None)
    drain(firmware._compile_upload_fbuild("Smoke", "// sketch", "esp32:esp32:esp32s3", "", 16))

    token = toolchain._fbuild_build_lock.acquire(0, toolchain._FBUILD_LOCK_STALE_S)
    assert token is not None
    toolchain._fbuild_build_lock.release(token)


def test_arduino_cli_refuses_without_its_binary(monkeypatch, tmp_path):
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", None)
    monkeypatch.setattr(toolchain, "_ARDUINO_BASE", [])
    (tmp_path / "smoke.ino").write_text("// sketch", encoding="utf-8")

    text, result = drain(firmware._compile_upload("Smoke", tmp_path, "esp32:esp32:esp32s3", ""))

    assert result == (-1, "compile")
    assert "arduino-cli was not found" in text
    # The old message named the subcommand instead of the program.
    assert "failed to launch compile" not in text


def test_run_phase_cannot_raise_on_an_unresolved_binary():
    """The one phase runner both engines call, guarded at the funnel too."""
    text, rc = drain(toolchain._run_phase("Smoke · compile", [None, "build"]))

    assert rc == -1
    assert "no build tool to run" in text
