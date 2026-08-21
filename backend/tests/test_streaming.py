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


def test_serial_monitor_releases_a_quiet_port_when_cancelled(fake_serial):
    # A generator can only be closed at a `yield`. The monitor used to yield
    # only when the board sent something, so a *silent* board left the loop
    # spinning inside ser.read() with no cancellation point: the browser
    # aborted, the port stayed open, and the next flash died with
    # "Access is denied". Seen on 2026-08-16 — a freshly flashed provisioner
    # says almost nothing, which is precisely when it bit.
    import asyncio

    response = app.serial_monitor("COM7", 115200)

    async def drive():
        body = response.body_iterator
        first = await body.__anext__()
        assert b"connected to COM7" in first
        # Several turns of a quiet board must still produce cancellation points.
        for _ in range(3):
            assert await body.__anext__() == b""
        port = fake_serial.instances[-1]
        assert port.closed is False
        await body.aclose()   # what Starlette does when the client disconnects
        return port

    port = asyncio.run(drive())
    assert port.closed is True, "the port must be released as soon as the client goes away"


def test_the_monitor_does_not_reset_the_board_it_attaches_to(fake_serial):
    """DTR/RTS must be clear at the moment the port opens, not a line later.

    Windows asserts both on open, and on an ESP32 they drive the auto-reset
    circuit — EN and GPIO0. On a native USB-Serial/JTAG part the ROM reads that
    combination as "enter download mode". Observed on an ESP32-S3: attaching the
    monitor reset the board into `boot:0x0 (DOWNLOAD(USB/UART0))`, waiting for a
    download that was never coming, while the freshly flashed sketch never ran.
    Clearing the lines after `serial.Serial(port, ...)` is too late — the pulse
    has already happened.
    """
    import asyncio

    response = app.serial_monitor("COM7", 115200)

    async def exercise():
        body = response.body_iterator
        await body.__anext__()          # "[serial] connected…"
        opened = fake_serial.instances[-1]
        assert opened.opened, "the port was opened"
        assert opened.dtr_at_open is False, "DTR was clear when the port opened"
        assert opened.rts_at_open is False, "RTS was clear when the port opened"
        await body.aclose()

    asyncio.run(exercise())
    app._release_monitor("COM7")


def test_release_monitor_closes_a_held_port(fake_serial):
    # The frontend already aborts the monitor before every upload, but that
    # abort does not guarantee the helper lets go: Starlette only notices a
    # dropped client when a body write fails, and a quiet board never causes
    # one. Reclaiming the handle explicitly is what makes the next flash work.
    import asyncio

    response = app.serial_monitor("COM7", 115200)

    async def exercise():
        body = response.body_iterator
        await body.__anext__()          # "[serial] connected…"
        port = fake_serial.instances[-1]
        assert port.closed is False

        assert app._release_monitor("COM9") is False, "must not touch a different port"
        assert port.closed is False
        assert app._release_monitor("COM7") is True
        assert port.closed is True
        # Idempotent: a second upload must not fail because the first reclaimed it.
        assert app._release_monitor("COM7") is False

        # The stream notices the closed handle and ends cleanly rather than
        # raising into the response body.
        chunk = await body.__anext__()
        assert b"released for upload" in chunk
        await body.aclose()

    asyncio.run(exercise())


def test_board_list_is_skipped_while_a_flash_holds_the_port(client, monkeypatch):
    # `arduino-cli board list` OPENS every serial port to identify what is on
    # it, holding each for seconds. Landing inside an esptool connect kills the
    # flash with a bare "Access is denied" that looks like a stuck monitor, a
    # wedged driver or a dead board. Measured on 2026-08-16: the probe held
    # COM4 for ~4s, and the frontend polls this endpoint.
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    called = []
    monkeypatch.setattr(app.subprocess, "run",
                        lambda *a, **k: called.append(a) or subprocess_result())

    def subprocess_result():
        class R:
            returncode = 0
            stdout = "{}"
        return R()

    r = client.get("/api/serial/ports")
    assert r.status_code == 200
    assert called, "board list should run when nothing is flashing"

    called.clear()
    with app._flashing():
        r = client.get("/api/serial/ports")
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert not called, "board list must not open ports during a flash"

    # And it resumes once the flash finishes.
    r = client.get("/api/serial/ports")
    assert called, "board list should resume after the flash"


def test_flash_guard_nests_for_the_three_phase_show_upload():
    # upload-show flashes provisioner, transfers, then flashes the player.
    # An inner phase finishing must not clear the guard for the outer one.
    assert app._flash_in_progress() is False
    with app._flashing():
        with app._flashing():
            assert app._flash_in_progress() is True
        assert app._flash_in_progress() is True, "inner exit must not release the outer guard"
    assert app._flash_in_progress() is False
