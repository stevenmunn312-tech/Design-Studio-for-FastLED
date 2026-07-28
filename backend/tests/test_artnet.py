"""Art-Net preview helper: keep one UDP listener alive, cache per-universe
snapshots, and expose them over HTTP for the browser preview."""
import socket
import time


def _free_udp_port() -> int:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    return port


def _artnet_dmx_packet(universe: int, channels: bytes) -> bytes:
    payload = channels[:512]
    length = len(payload)
    return b"".join([
        b"Art-Net\x00",
        bytes((0x00, 0x50)),   # OpDmx (little-endian)
        bytes((0x00, 0x0E)),   # protocol version
        bytes((0x00, 0x00)),   # sequence, physical
        bytes((universe & 0xFF, (universe >> 8) & 0x7F)),
        bytes(((length >> 8) & 0xFF, length & 0xFF)),
        payload,
    ])


def _wait_for_valid_snapshot(client, universe: int, timeout_s=1.5):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        res = client.get("/api/artnet/snapshot", params={"universe": universe})
        body = res.json()
        if body["valid"]:
            return body
        time.sleep(0.02)
    raise AssertionError("timed out waiting for Art-Net snapshot")


def test_artnet_listener_receives_and_caches_a_universe_snapshot(client):
    port = _free_udp_port()
    universe = 7

    r = client.post("/api/artnet/start", json={"port": port})
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.sendto(_artnet_dmx_packet(universe, bytes([10, 20, 30, 40])), ("127.0.0.1", port))
    finally:
        sock.close()

    snapshot = _wait_for_valid_snapshot(client, universe)
    assert snapshot["universe"] == universe
    assert snapshot["valid"] is True
    assert snapshot["live"] is True
    assert snapshot["channels"][:6] == [10, 20, 30, 40, 0, 0]
    assert snapshot["packetRate"] >= 0
    assert snapshot["lastPacketAt"] is not None

    status = client.get("/api/artnet/status", params={"universe": universe}).json()
    assert status["ok"] is True
    assert status["listening"] is True
    assert status["port"] == port
    assert status["live"] is True
    assert status["packetRate"] >= 0


def test_artnet_stop_clears_listener_state_and_snapshot_cache(client):
    port = _free_udp_port()
    universe = 3
    client.post("/api/artnet/start", json={"port": port})

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.sendto(_artnet_dmx_packet(universe, bytes([255])), ("127.0.0.1", port))
    finally:
        sock.close()
    _wait_for_valid_snapshot(client, universe)

    stopped = client.post("/api/artnet/stop")
    assert stopped.status_code == 200
    assert stopped.json() == {"ok": True}

    status = client.get("/api/artnet/status", params={"universe": universe}).json()
    assert status == {
        "ok": True,
        "listening": False,
        "port": port,
        "live": False,
        "packetRate": 0.0,
        "lastPacketAt": None,
        "error": None,
    }

    snapshot = client.get("/api/artnet/snapshot", params={"universe": universe}).json()
    assert snapshot["valid"] is False
    assert snapshot["live"] is False
    assert snapshot["packetRate"] == 0.0
    assert snapshot["lastPacketAt"] is None
    assert snapshot["channels"] == [0] * 512
