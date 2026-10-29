"""`/api/compile-check` — the live controller-capacity meter's compile-only
endpoint. The real compile is faked out (no subprocess/hardware involved);
these tests cover the JSON assembly around whichever engine ran."""
import firmware
import toolchain


def test_compile_check_returns_measured_sizes_on_success(client, monkeypatch):
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        assert port == ""  # capacity check never uploads
        yield "Flash: 4.45KB / 31.50KB (14.1%)\n"
        yield "RAM:   367 bytes / 2.00KB (17.9%)\n"
        return 0, "compile"

    monkeypatch.setattr(firmware, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["overflow"] is False
    assert data["engine"] == "fbuild"
    assert data["target"] == "esp32:esp32:esp32s3"
    assert data["flash"]["percent"] == 14
    assert data["ram"]["percent"] == 18
    assert data["error"] is None


def test_compile_check_flags_overflow_on_arduino_cli(client, monkeypatch, tmp_path):
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(firmware, "_SKETCH_DIR_ROOT", tmp_path / "sketches")

    def fake_compile_upload(
        label, sketch_dir, fqbn, port, output_dir=None, usb_cdc=False,
        flash_mb=None,
    ):
        assert port == ""
        assert flash_mb == 16
        yield "region `.text' overflowed by 512 bytes\n"
        return 1, "compile"

    monkeypatch.setattr(firmware, "_compile_upload", fake_compile_upload)

    r = client.post("/api/compile-check", json={
        "ino": "void setup(){}", "fqbn": "arduino:avr:uno", "flashMb": 16,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is False
    assert data["overflow"] is True
    assert "too large" in data["error"].lower()


def test_compile_check_surfaces_the_over_100_percent_usage_on_overflow(client, monkeypatch, tmp_path):
    # The toolchain often still prints its usage line before the linker
    # rejects an over-capacity build — surfacing that percentage (even over
    # 100%) is what lets the frontend show "flash 122%" instead of a bare
    # "won't fit", so the size-report regexes must not be gated on success.
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(firmware, "_SKETCH_DIR_ROOT", tmp_path / "sketches")

    def fake_compile_upload(
        label, sketch_dir, fqbn, port, output_dir=None, usb_cdc=False,
        flash_mb=None,
    ):
        assert port == ""
        yield "Sketch uses 39308 bytes (122%) of program storage space. Maximum is 32256 bytes.\n"
        yield "region `.text' overflowed by 7052 bytes\n"
        return 1, "compile"

    monkeypatch.setattr(firmware, "_compile_upload", fake_compile_upload)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "arduino:avr:uno"})
    data = r.json()
    assert data["ok"] is False
    assert data["overflow"] is True
    assert data["flash"] == {"usedBytes": 39308, "percent": 122, "limitBytes": 32256}


def test_compile_check_surfaces_over_100_percent_usage_on_fbuild_overflow(client, monkeypatch):
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "Flash: 38.39KB / 31.50KB (121.9%)\n"
        yield "region `.text' overflowed by 7052 bytes\n"
        return 1, "compile"

    monkeypatch.setattr(firmware, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "arduino:avr:uno"})
    data = r.json()
    assert data["ok"] is False
    assert data["overflow"] is True
    assert data["flash"]["percent"] == 122
    assert data["log"] is not None


def test_compile_check_estimates_percentage_on_a_hard_linker_overflow(client, monkeypatch):
    # The realistic case: a genuine ESP32 RAM/flash overflow is a hard ld
    # failure with no "Flash:"/"RAM:" summary at all (ld never gets that far).
    # The endpoint should still derive a percentage from the linker's own
    # "overflowed by N bytes" message rather than falling back to a bare
    # "won't fit".
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "Memory: 8.00MB Flash, 320.00KB RAM\n"
        yield "ld.exe: region `dram0_0_seg' overflowed by 8734704 bytes\n"
        return 1, "compile"

    monkeypatch.setattr(firmware, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    data = r.json()
    assert data["ok"] is False
    assert data["overflow"] is True
    ram_max = 320 * 1024
    assert data["ram"]["percent"] == round((ram_max + 8734704) / ram_max * 100)
    assert data["flash"] is None


def test_compile_check_reports_generic_error_when_not_overflow(client, monkeypatch):
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "some unrelated compile error\n"
        return 1, "compile"

    monkeypatch.setattr(firmware, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    data = r.json()
    assert data["ok"] is False
    assert data["overflow"] is False
    assert "compile failed" in data["error"].lower()


def test_compile_check_does_not_blame_the_sketch_for_a_build_lock_timeout(client, monkeypatch):
    # Builds are serialized on one shared project directory, so a check that
    # collides with the user's own Upload can wait out the timeout without
    # compiling anything. That came back as a plain compile failure, so the
    # capacity meter read "Compile failed - see helper log" for a design that
    # had never been built - beside an Upload that then succeeded. The upload
    # path already refuses to blame the sketch for this (`_upload_result_lines`
    # with phase "busy"); the meter must too.
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "another fbuild build is still running\n"
        return -1, "busy"

    monkeypatch.setattr(firmware, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    data = r.json()
    assert data["ok"] is False
    assert data["busy"] is True
    assert data["overflow"] is False
    assert "compile failed" not in data["error"].lower()


def test_compile_check_marks_a_real_compile_failure_as_not_busy(client, monkeypatch):
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "some unrelated compile error\n"
        return 1, "compile"

    monkeypatch.setattr(firmware, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    assert r.json()["busy"] is False


def test_compile_check_400_when_engine_missing(client, monkeypatch):
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", None)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    assert r.status_code == 400
    assert r.json()["ok"] is False


def test_compile_check_400_when_ino_blank(client, monkeypatch):
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")

    r = client.post("/api/compile-check", json={"ino": "   ", "fqbn": "esp32:esp32:esp32s3"})
    assert r.status_code == 400


def test_compile_check_measures_the_player_in_the_player_workspace(client, monkeypatch, tmp_path):
    # The SD player uploads from its own sketch folder; a capacity check that
    # compiled it anywhere else would leave that upload a cold arduino-cli
    # cache, which keys on the folder's path.
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(firmware, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    seen = []

    def fake_compile_upload(
        label, sketch_dir, fqbn, port, output_dir=None, usb_cdc=False,
        flash_mb=None,
    ):
        seen.append(sketch_dir.name)
        yield "Sketch uses 1000 bytes (1%) of program storage space. Maximum is 100000 bytes.\n"
        return 0, "compile"

    monkeypatch.setattr(firmware, "_compile_upload", fake_compile_upload)

    client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3", "sketch": "player"})
    client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3", "sketch": "../x"})
    assert seen == [firmware.PLAYER_SKETCH, toolchain.SKETCH, toolchain.SKETCH]


def test_compile_check_reads_fbuilds_size_cache_on_a_no_op_rebuild(client, monkeypatch, tmp_path):
    # Nothing changed since the last compile: fbuild relinks nothing and
    # prints no "Flash:"/"RAM:" line, but it keeps the sizes of the image it
    # measured last time in `.firmware_size_cache.json`. Without that fallback
    # a successful check reported no sizes and the capacity meter went blank.
    import json
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(toolchain, "_FBUILD_PROJECT_DIR", tmp_path)
    env = toolchain._fbuild_env_for_fqbn("esp32:esp32:esp32", None, False)
    release = tmp_path / ".fbuild" / "build" / env / "release"
    release.mkdir(parents=True)
    (release / ".firmware_size_cache.json").write_text(json.dumps({
        "version": 2,
        "elf_stamp": {"len": 1, "modified_secs": 1, "modified_nanos": 0},
        "size_info": {"text": 1, "data": 1, "bss": 1,
                      "total_flash": 481164, "total_ram": 32880,
                      "max_flash": 3145728, "max_ram": 327680},
    }))

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "Nothing to do: build is up to date\n"
        return 0, "compile"

    monkeypatch.setattr(firmware, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32"})
    data = r.json()
    assert data["ok"] is True
    assert data["flash"] == {"usedBytes": 481164, "limitBytes": 3145728, "percent": 15}
    assert data["ram"] == {"usedBytes": 32880, "limitBytes": 327680, "percent": 10}
