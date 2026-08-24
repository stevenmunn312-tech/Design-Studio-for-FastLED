from types import SimpleNamespace

import app


def test_serial_ports_exposes_usb_identity(client, monkeypatch):
    from serial.tools import list_ports

    monkeypatch.setattr(app, "_ARDUINO_CLI", None)
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
