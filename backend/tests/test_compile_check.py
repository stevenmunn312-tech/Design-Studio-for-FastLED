"""`/api/compile-check` — the live controller-capacity meter's compile-only
endpoint. The real compile is faked out (no subprocess/hardware involved);
these tests cover the JSON assembly around whichever engine ran."""
import app


def test_compile_check_returns_measured_sizes_on_success(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port):
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


def test_compile_check_flags_overflow_on_arduino_cli(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(app, "_make_sketch", lambda name, ino: ("/tmp/fake_work", "/tmp/fake_work/sketch"))
    monkeypatch.setattr(app.shutil, "rmtree", lambda *a, **k: None)

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
    assert data["log"] is not None


def test_compile_check_reports_generic_error_when_not_overflow(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    def fake_compile_upload_fbuild(label, ino, fqbn, port):
        yield "some unrelated compile error\n"
        return 1, "compile"

    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile_upload_fbuild)

    r = client.post("/api/compile-check", json={"ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3"})
    data = r.json()
    assert data["ok"] is False
    assert data["overflow"] is False
    assert "compile failed" in data["error"].lower()


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
