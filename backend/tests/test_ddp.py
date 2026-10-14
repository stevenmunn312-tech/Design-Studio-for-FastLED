"""DDP preview helper: a UDP listener that keeps the latest pixel bytes, at
their packet offsets, for the browser's DDP Input node to poll."""
import base64
import socket
import time

from streaming import _parse_ddp_packet


def _free_udp_port() -> int:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    return port


def _ddp_packet(offset: int, data: bytes, push: bool = True) -> bytes:
    flags = 0x40 | (0x01 if push else 0)
    return bytes([flags, 0, 1, 1]) + offset.to_bytes(4, "big") + len(data).to_bytes(2, "big") + data


def test_ddp_parser_reads_offset_and_bytes():
    assert _parse_ddp_packet(_ddp_packet(6, bytes([1, 2, 3]))) == (6, bytes([1, 2, 3]))
    assert _parse_ddp_packet(b"\x00" * 12) is None
    timecoded = bytes([0x50, 0, 1, 1]) + (0).to_bytes(4, "big") + (3).to_bytes(2, "big") + b"\x00\x00\x00\x00" + bytes([9, 8, 7])
    assert _parse_ddp_packet(timecoded) == (0, bytes([9, 8, 7]))


def test_ddp_listener_assembles_packets_into_one_frame(client):
    port = _free_udp_port()
    assert client.post("/api/ddp/start", json={"port": port}).json() == {"ok": True}
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.sendto(_ddp_packet(0, bytes([255, 0, 0, 0, 255, 0])), ("127.0.0.1", port))
        sock.sendto(_ddp_packet(6, bytes([0, 0, 255])), ("127.0.0.1", port))
    finally:
        sock.close()

    deadline = time.time() + 1.5
    body = None
    while time.time() < deadline:
        body = client.get("/api/ddp/frame", params={"pixels": 4}).json()
        if body["valid"] and base64.b64decode(body["pixels"])[6:9] == bytes([0, 0, 255]):
            break
        time.sleep(0.02)
    assert body is not None and body["live"] is True
    assert base64.b64decode(body["pixels"]) == bytes([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0])

    assert client.post("/api/ddp/stop").json() == {"ok": True}
    stopped = client.get("/api/ddp/frame", params={"pixels": 1}).json()
    assert stopped["listening"] is False
    assert stopped["valid"] is False
    assert base64.b64decode(stopped["pixels"]) == bytes(3)
