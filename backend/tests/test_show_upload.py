"""Music-sync `/api/upload-show` failure phases: provisioner compile fail,
provisioner upload fail, SD-transfer fail, player compile fail, player upload
fail, and the full success path — each must stop at the right step and never
run a step that would touch hardware once an earlier one has failed.

`_compile_upload_fbuild`/`_serial_send`/`_ensure_fbuild_audio_lib` are all
generator functions (their real implementations `yield` progress lines and
`return` a result captured via `yield from`), so the fakes below must also be
generator functions — a plain `return` without any `yield` in the body would
make `yield from fake(...)` blow up with "not iterable" the moment app.py
tries to delegate to it.
"""
import app


def _fake_generator(result):
    def gen(*args, **kwargs):
        if False:
            yield  # pragma: no cover — makes `gen` a generator function
        return result
    return gen


def _compile_sequence(results: dict):
    """results: {label: (rc, phase)}. Fakes `_compile_upload_fbuild`, tracking
    which labels were actually invoked."""
    calls = []

    def fake(label, ino, fqbn, port):
        calls.append(label)
        if False:
            yield  # pragma: no cover
        return results[label]

    fake.calls = calls
    return fake


def test_upload_show_reports_when_no_port_given(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    r = client.post(
        "/api/upload-show",
        data={"meta": "{}", "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert r.status_code == 200
    assert "a serial port is required" in r.text


def test_provisioner_compile_failure_stops_before_sd_transfer(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Provisioner": (1, "compile")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)

    def _boom(*a, **kw):
        raise AssertionError("SD transfer must not start when the provisioner failed to compile")
    monkeypatch.setattr(app, "_serial_send", _boom)

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Provisioner build failed" in r.text
    assert "nothing was flashed" in r.text
    assert fake_compile.calls == ["Provisioner"]


def test_provisioner_upload_failure_stops_before_sd_transfer(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Provisioner": (1, "upload")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)

    def _boom(*a, **kw):
        raise AssertionError("SD transfer must not start when the provisioner failed to flash")
    monkeypatch.setattr(app, "_serial_send", _boom)

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Provisioner flash failed" in r.text
    assert "download mode" in r.text
    assert fake_compile.calls == ["Provisioner"]


def test_sd_transfer_failure_stops_before_player_build(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Provisioner": (0, "upload")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(False))

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "SD transfer failed" in r.text
    assert "not flashing the player" in r.text
    assert fake_compile.calls == ["Provisioner"]  # Player build never attempted


def test_player_compile_failure_message(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Provisioner": (0, "upload"), "Player": (1, "compile")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(True))

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Player build failed" in r.text
    assert "still running the provisioner" in r.text
    assert fake_compile.calls == ["Provisioner", "Player"]


def test_player_upload_failure_message(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Provisioner": (0, "upload"), "Player": (1, "upload")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(True))

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Player flash failed" in r.text
    assert "download mode" in r.text
    assert fake_compile.calls == ["Provisioner", "Player"]


def test_full_pipeline_success(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Provisioner": (0, "upload"), "Player": (0, "upload")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(True))

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "All done" in r.text
    assert fake_compile.calls == ["Provisioner", "Player"]
