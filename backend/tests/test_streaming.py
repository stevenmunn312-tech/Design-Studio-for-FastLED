"""Live-stream serial-port ownership: the streaming session holds the port
open across many small requests, and every other consumer of that same port
(upload, upload-show, serial monitor) must back off with a 409 rather than
silently racing it — all exercised against a fake serial port."""
import app


def test_stream_start_then_frame_writes_bytes(client, fake_serial):
    r = client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    assert r.status_code == 200
    assert r.json()["ok"] is True

    r = client.post("/api/stream/frame", content=b"Ada\x00\x00\x00sync-bytes")
    assert r.status_code == 200
    assert fake_serial.instances[0].writes == [b"Ada\x00\x00\x00sync-bytes"]


def test_stream_start_reuses_same_port_and_baud(client, fake_serial):
    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    assert len(fake_serial.instances) == 1  # not reopened


def test_stream_start_reopens_on_port_change(client, fake_serial):
    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    client.post("/api/stream/start", json={"port": "COM8", "baud": 115200})
    assert len(fake_serial.instances) == 2
    assert fake_serial.instances[0].closed is True


def test_frame_without_start_is_conflict(client):
    r = client.post("/api/stream/frame", content=b"x")
    assert r.status_code == 409


def test_frame_after_stop_is_conflict(client, fake_serial):
    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    client.post("/api/stream/stop")
    r = client.post("/api/stream/frame", content=b"x")
    assert r.status_code == 409
    assert fake_serial.instances[0].closed is True


def test_upload_refuses_to_start_while_port_is_streaming(client, fake_serial, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    r = client.post("/api/upload", json={"ino": "void setup(){}", "port": "COM7"})
    assert r.status_code == 409
    assert "stream" in r.json()["error"]


def test_upload_on_a_different_port_is_unaffected_by_streaming(client, fake_serial, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", None)  # forces the missing-engine 400, not a real compile

    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    r = client.post("/api/upload", json={"ino": "void setup(){}", "port": "COM9"})
    # Missing-engine 400, not the streaming 409 — a different port is untouched
    # by the COM7 session.
    assert r.status_code == 400


def test_upload_show_refuses_to_start_while_port_is_streaming(client, fake_serial, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")

    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "x", "player": "y"},
    )
    assert r.status_code == 409


def test_serial_monitor_refuses_while_same_port_is_streaming(client, fake_serial):
    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    r = client.get("/api/serial/monitor", params={"port": "COM7"})
    assert r.status_code == 409


def test_frame_write_that_hangs_past_write_timeout_fails_fast_and_frees_the_port(client, fake_serial, monkeypatch):
    # Regression: a stalled receiver was observed to make Serial.write() block
    # past pyserial's own write_timeout entirely on Windows (a known
    # limitation with some USB-serial drivers) — the write held _stream_lock
    # forever, silently wedging the stream with no error and blocking every
    # later frame/start/stop request too. The app's own independent
    # _STREAM_WRITE_TIMEOUT_S watchdog must catch this and force the port
    # closed instead of hanging forever.
    monkeypatch.setattr(app, "_STREAM_WRITE_TIMEOUT_S", 0.05)
    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    fake_serial.instances[0].hang_seconds = 0.3  # comfortably longer than the watchdog

    r = client.post("/api/stream/frame", content=b"stuck-frame")
    assert r.status_code == 500
    assert "timed out" in r.json()["error"]

    # The port must be freed, not left wedged — a fresh frame is a clean 409
    # (not started), and start/stop aren't blocked by the orphaned write.
    r2 = client.post("/api/stream/frame", content=b"next-frame")
    assert r2.status_code == 409
    assert client.post("/api/stream/stop").status_code == 200


def test_stop_clears_state_so_monitor_is_allowed_again(client, fake_serial):
    client.post("/api/stream/start", json={"port": "COM7", "baud": 115200})
    client.post("/api/stream/stop")
    r = client.get("/api/stream/status")
    assert r.json() == {"ok": True, "streaming": False, "port": None, "baud": 0}
