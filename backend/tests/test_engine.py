"""Build-engine selection and FQBN <-> fbuild-environment translation — pure
logic, no subprocess/hardware involved."""
import app


def test_active_engine_prefers_fbuild_when_no_saved_preference(monkeypatch):
    monkeypatch.setattr(app, "_load_config", lambda: {})
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    assert app._active_engine() == "fbuild"


def test_active_engine_falls_back_to_arduino_cli_when_fbuild_missing(monkeypatch):
    monkeypatch.setattr(app, "_load_config", lambda: {})
    monkeypatch.setattr(app, "_FBUILD_BIN", None)
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    assert app._active_engine() == "arduino-cli"


def test_active_engine_honours_saved_preference_when_available(monkeypatch):
    monkeypatch.setattr(app, "_load_config", lambda: {"engine": "arduino-cli"})
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    assert app._active_engine() == "arduino-cli"


def test_active_engine_ignores_saved_preference_when_unavailable(monkeypatch):
    # Saved "fbuild" but fbuild isn't actually installed -> falls through to
    # the default logic rather than reporting an engine that can't run.
    monkeypatch.setattr(app, "_load_config", lambda: {"engine": "fbuild"})
    monkeypatch.setattr(app, "_FBUILD_BIN", None)
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    assert app._active_engine() == "arduino-cli"


def test_active_engine_returns_arduino_cli_when_neither_installed(monkeypatch):
    monkeypatch.setattr(app, "_load_config", lambda: {})
    monkeypatch.setattr(app, "_FBUILD_BIN", None)
    monkeypatch.setattr(app, "_ARDUINO_CLI", None)
    assert app._active_engine() == "arduino-cli"


def test_parse_fqbn_splits_base_and_psram_option():
    assert app._parse_fqbn("esp32:esp32:esp32s3") == ("esp32:esp32:esp32s3", None)
    assert app._parse_fqbn("esp32:esp32:esp32s3:PSRAM=opi") == ("esp32:esp32:esp32s3", "opi")
    assert app._parse_fqbn("esp32:esp32:esp32s3:PSRAM=enabled") == ("esp32:esp32:esp32s3", "qspi")
    assert app._parse_fqbn("arduino:avr:uno") == ("arduino:avr:uno", None)


def test_parse_fqbn_ignores_unknown_menu_option():
    base, psram = app._parse_fqbn("esp32:esp32:esp32s3:CPUFreq=240")
    assert base == "esp32:esp32:esp32s3"
    assert psram is None


def test_env_id_slugifies_and_suffixes():
    assert app._env_id("esp32:esp32:esp32s3") == "esp32_esp32_esp32s3"
    assert app._env_id("esp32:esp32:esp32s3", "opi") == "esp32_esp32_esp32s3_opi"


def test_fbuild_env_for_fqbn_known_board_with_psram():
    assert app._fbuild_env_for_fqbn("esp32:esp32:esp32s3:PSRAM=opi") == "esp32_esp32_esp32s3_opi"


def test_fbuild_env_for_fqbn_unknown_board_returns_none():
    assert app._fbuild_env_for_fqbn("someone:elses:board") is None


def test_fbuild_env_for_fqbn_drops_unsupported_psram_option():
    # esp32:esp32:esp32 only maps "qspi", not "opi" -> build without PSRAM
    # rather than fail outright.
    env = app._fbuild_env_for_fqbn("esp32:esp32:esp32:PSRAM=opi")
    assert env == "esp32_esp32_esp32"


def test_write_fbuild_ini_emits_a_section_per_board_and_psram_variant(tmp_path, monkeypatch):
    ini_path = tmp_path / "platformio.ini"
    monkeypatch.setattr(app, "_FBUILD_INI_PATH", ini_path)

    app._write_fbuild_ini()
    text = ini_path.read_text(encoding="utf-8")

    for base_fqbn, meta in app._PIO_BOARDS.items():
        assert f"[env:{app._env_id(base_fqbn)}]" in text
        assert f"board = {meta['board']}" in text
        for psram_id in meta.get("psram_memory_type", {}):
            assert f"[env:{app._env_id(base_fqbn, psram_id)}]" in text

    # ESP32 boards get the CORE_DEBUG_LEVEL workaround; non-espressif boards don't.
    assert "-DCORE_DEBUG_LEVEL=0" in text
    uno_section = text.split("[env:arduino_avr_uno]")[1].split("[env:")[0]
    assert "CORE_DEBUG_LEVEL" not in uno_section
