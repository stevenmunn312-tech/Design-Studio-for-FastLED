"""`/api/compile-check` — the live controller-capacity meter's compile-only
endpoint. The real compile is faked out (no subprocess/hardware involved);
these tests cover the JSON assembly around whichever engine ran."""
import app


def test_compile_check_returns_measured_sizes_on_success(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        assert port == ""  # capacity check never uploads
        yield "Flash: 4.45KB / 31.50KB (14.1%)\n"
        yield "RAM:   367 bytes / 2.00KB (17.9%)\n"
        return 0, "compile"

    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile_upload_fbuild)

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
    monkeypatch.setattr(app, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")

    def fake_compile_upload(label, sketch_dir, fqbn, port):
        assert port == ""
        yield "region `.text' overflowed by 512 bytes\n"
        return 1, "compile"

    monkeypatch.setattr(app, "_compile_upload", fake_compile_upload)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "arduino:avr:uno"})
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
    monkeypatch.setattr(app, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")

    def fake_compile_upload(label, sketch_dir, fqbn, port):
        assert port == ""
        yield "Sketch uses 39308 bytes (122%) of program storage space. Maximum is 32256 bytes.\n"
        yield "region `.text' overflowed by 7052 bytes\n"
        return 1, "compile"

    monkeypatch.setattr(app, "_compile_upload", fake_compile_upload)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "arduino:avr:uno"})
    data = r.json()
    assert data["ok"] is False
    assert data["overflow"] is True
    assert data["flash"] == {"usedBytes": 39308, "percent": 122, "limitBytes": 32256}


def test_compile_check_surfaces_over_100_percent_usage_on_fbuild_overflow(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "Flash: 38.39KB / 31.50KB (121.9%)\n"
        yield "region `.text' overflowed by 7052 bytes\n"
        return 1, "compile"

    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile_upload_fbuild)

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
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "Memory: 8.00MB Flash, 320.00KB RAM\n"
        yield "ld.exe: region `dram0_0_seg' overflowed by 8734704 bytes\n"
        return 1, "compile"

    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    data = r.json()
    assert data["ok"] is False
    assert data["overflow"] is True
    ram_max = 320 * 1024
    assert data["ram"]["percent"] == round((ram_max + 8734704) / ram_max * 100)
    assert data["flash"] is None


def test_compile_check_reports_generic_error_when_not_overflow(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "some unrelated compile error\n"
        return 1, "compile"

    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile_upload_fbuild)

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
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "another fbuild build is still running\n"
        return -1, "busy"

    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    data = r.json()
    assert data["ok"] is False
    assert data["busy"] is True
    assert data["overflow"] is False
    assert "compile failed" not in data["error"].lower()


def test_compile_check_marks_a_real_compile_failure_as_not_busy(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        yield "some unrelated compile error\n"
        return 1, "compile"

    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    assert r.json()["busy"] is False


def test_compile_check_400_when_engine_missing(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", None)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    assert r.status_code == 400
    assert r.json()["ok"] is False


def test_compile_check_400_when_ino_blank(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    r = client.post("/api/compile-check", json={"ino": "   ", "fqbn": "esp32:esp32:esp32s3"})
    assert r.status_code == 400
