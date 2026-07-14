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


def test_fbuild_size_report_keeps_sane_ram_percentage():
    report = app._fbuild_size_report([
        "Flash: 4.45KB / 31.50KB (14.1%)\n",
        "RAM:   367 bytes / 2.00KB (17.9%)\n",
    ])

    assert report == {"flash": 14, "ram": 17}


def test_fbuild_size_report_ignores_impossible_successful_esp32_ram_percentage():
    report = app._fbuild_size_report([
        "Flash: 665.41KB / 8.00MB (8.1%)\n",
        "RAM:   1.28MB / 320.00KB (409.2%)\n",
        "build succeeded in 150.2s (flash: 681375 bytes, ram: 1340869 bytes)\n",
    ])

    assert report == {"flash": 8, "ram": None}


def test_size_bytes_report_extracts_used_limit_and_percent():
    report = app._size_bytes_report([
        "Sketch uses 25972 bytes (10%) of program storage space. Maximum is 253952 bytes.\n",
        "Global variables use 1568 bytes (19%) of dynamic memory, leaving 6624 bytes for "
        "local variables. Maximum is 8192 bytes.\n",
    ])

    assert report["flash"] == {"usedBytes": 25972, "percent": 10, "limitBytes": 253952}
    assert report["ram"] == {"usedBytes": 1568, "percent": 19, "limitBytes": 8192}


def test_size_bytes_report_returns_none_for_missing_lines():
    assert app._size_bytes_report(["Compiling sketch...\n"]) == {"flash": None, "ram": None}


def test_fbuild_size_bytes_report_converts_units_to_bytes():
    report = app._fbuild_size_bytes_report([
        "Flash: 4.45KB / 31.50KB (14.1%)\n",
        "RAM:   367 bytes / 2.00KB (17.9%)\n",
    ])

    assert report["flash"] == {"usedBytes": round(4.45 * 1024), "percent": 14, "limitBytes": round(31.50 * 1024)}
    assert report["ram"] == {"usedBytes": 367, "percent": 18, "limitBytes": round(2.00 * 1024)}


def test_fbuild_size_bytes_report_drops_impossible_ram_percentage():
    report = app._fbuild_size_bytes_report([
        "Flash: 665.41KB / 8.00MB (8.1%)\n",
        "RAM:   1.28MB / 320.00KB (409.2%)\n",
    ])

    assert report["flash"]["percent"] == 8
    assert report["ram"] is None


def test_drain_compile_collects_lines_and_return_value():
    def gen():
        yield "a\n"
        yield "b\n"
        return 0, "compile"

    lines, result = app._drain_compile(gen())

    assert lines == ["a\n", "b\n"]
    assert result == (0, "compile")
