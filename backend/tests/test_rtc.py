import serial

import app as app_module


class RtcSerial:
    instances = []

    def __init__(self, port, baud, timeout=0, write_timeout=None):
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.write_timeout = write_timeout
        self.dtr = True
        self.rts = True
        self.writes = []
        self.closed = False
        type(self).instances.append(self)

    def reset_input_buffer(self):
        pass

    def write(self, value):
        self.writes.append(value)

    def flush(self):
        pass

    def readline(self):
        return b"FLS_RTC_OK\n"

    def close(self):
        self.closed = True


def test_set_rtc_sends_one_validated_command(client, monkeypatch):
    RtcSerial.instances = []
    monkeypatch.setattr(serial, "Serial", RtcSerial)
    monkeypatch.setattr(app_module.time, "sleep", lambda _seconds: None)

    response = client.post("/api/rtc/set", json={
        "port": "COM7",
        "dateTime": "2026-08-21 13:45:09",
    })

    assert response.status_code == 200
    assert response.json() == {"ok": True, "dateTime": "2026-08-21 13:45:09"}
    device = RtcSerial.instances[0]
    assert device.writes == [b"FLS_RTC_SET 2026-08-21 13:45:09\n"]
    assert device.dtr is False
    assert device.rts is False
    assert device.closed is True


def test_set_rtc_rejects_an_impossible_calendar_time(client):
    response = client.post("/api/rtc/set", json={
        "port": "COM7",
        "dateTime": "2026-02-31 12:00:00",
    })
    assert response.status_code == 400
    assert response.json()["error"] == "dateTime is not a real calendar time"
