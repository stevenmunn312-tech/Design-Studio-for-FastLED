from types import SimpleNamespace

import toolchain


def test_serial_ports_exposes_usb_identity(client, monkeypatch):
    from serial.tools import list_ports

    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", None)
    monkeypatch.setattr(list_ports, "comports", lambda: [SimpleNamespace(
        device="COM7",
        description="USB JTAG/serial debug unit",
        vid=0x303A,
        pid=0x1001,
        serial_number="ABC123",
        manufacturer="Espressif",
        product="USB JTAG/serial debug unit",
        interface="CDC",
        location="1-4",
        hwid="USB VID:PID=303A:1001 SER=ABC123",
    )])

    response = client.get("/api/serial/ports")

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "ports": [{
            "address": "COM7",
            "label": "COM7 (USB JTAG/serial debug unit)",
            "protocol": "serial",
            "boards": [],
            "vid": 0x303A,
            "pid": 0x1001,
            "serialNumber": "ABC123",
            "manufacturer": "Espressif",
            "product": "USB JTAG/serial debug unit",
            "interface": "CDC",
            "location": "1-4",
            "hwid": "USB VID:PID=303A:1001 SER=ABC123",
        }],
    }


def test_quick_scan_never_runs_board_list(client, monkeypatch):
    # The Upload tab polls with ?quick=1; `board list` opens every port, so a
    # poll must not reach it or it would fight the serial monitor.
    import subprocess
    from serial.tools import list_ports

    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "/fake/arduino-cli")
    calls = []
    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: calls.append(args) or SimpleNamespace(stdout="{}"))
    monkeypatch.setattr(list_ports, "comports", lambda: [SimpleNamespace(
        device="COM5", description="USB-SERIAL CH340", vid=None, pid=None, serial_number=None,
        manufacturer=None, product=None, interface=None, location=None, hwid=None,
    )])

    response = client.get("/api/serial/ports?quick=1")

    assert response.status_code == 200
    assert [port["address"] for port in response.json()["ports"]] == ["COM5"]
    assert calls == []
