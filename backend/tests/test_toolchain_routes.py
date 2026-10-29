"""The arduino-cli management routes: locating a binary and upgrading cores."""
import toolchain


def _phase_recorder(monkeypatch):
    phases: list[tuple[str, list[str]]] = []

    def fake_run_phase(label, args, sink=None, cwd=None, tool_env=None):
        phases.append((label, list(args)))
        yield f"[{label}]\n"
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", fake_run_phase)
    return phases


def test_core_upgrade_with_no_cores_named_upgrades_every_installed_core(client, monkeypatch):
    # `cores` was reassigned inside the streaming generator, which made it a
    # local there and turned the omit-cores path into an UnboundLocalError.
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(toolchain, "_installed_cores",
                        lambda: [("arduino:avr", "1.8.6", "1.8.7"), ("esp32:esp32", "3.3.0", "3.3.11")])
    phases = _phase_recorder(monkeypatch)

    r = client.post("/api/core/upgrade", json={})
    assert r.status_code == 200
    assert "Update complete" in r.text
    labels = [label for label, _args in phases]
    assert labels[0] == "update index"
    assert any("arduino:avr" in label for label in labels)
    assert any("esp32:esp32" in label for label in labels)


def test_core_upgrade_honours_the_cores_it_was_given(client, monkeypatch):
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(toolchain, "_installed_cores", lambda: [("esp32:esp32", "3.3.0", "3.3.11")])
    phases = _phase_recorder(monkeypatch)

    r = client.post("/api/core/upgrade", json={"cores": ["arduino:avr"]})
    assert r.status_code == 200
    labels = [label for label, _args in phases]
    assert any("arduino:avr" in label for label in labels)
    assert not any("esp32:esp32" in label for label in labels)


def _no_real_config(monkeypatch):
    monkeypatch.setattr(toolchain, "_load_config", lambda: {})
    monkeypatch.setattr(toolchain, "_save_config", lambda cfg: None)
    monkeypatch.setattr(toolchain, "_refresh_cli", lambda: None)


def test_locate_runs_only_a_file_named_arduino_cli(client, monkeypatch, tmp_path):
    # Every localhost origin is trusted, so this route must not become a way
    # to execute an arbitrary program with a `version` argument.
    _no_real_config(monkeypatch)
    ran: list[list[str]] = []

    class Done:
        returncode = 0
        stdout = "arduino-cli Version: 1.3.1"
        stderr = ""

    def fake_run(args, **kwargs):
        ran.append(list(args))
        return Done()

    monkeypatch.setattr(toolchain.subprocess, "run", fake_run)
    other = tmp_path / "format-disk.exe"
    other.write_bytes(b"MZ")
    r = client.post("/api/arduino-cli/locate", json={"path": str(other)})
    assert r.status_code == 400
    assert "arduino-cli" in r.json()["error"]
    assert ran == []

    folder = tmp_path / "arduino-cli"
    folder.mkdir()
    r = client.post("/api/arduino-cli/locate", json={"path": str(folder)})
    assert r.status_code == 400
    assert ran == []

    cli = tmp_path / "Arduino-CLI.exe"
    cli.write_bytes(b"MZ")
    quoted = '"' + str(cli) + '"'
    r = client.post("/api/arduino-cli/locate", json={"path": quoted})
    assert r.status_code == 200
    assert r.json()["version"] == "arduino-cli Version: 1.3.1"
    assert ran == [[str(cli), "version"]]
