"""sACN (E1.31) on the same preview listener as Art-Net: one UDP socket parses
either protocol by its header, and an sACN start joins the universe's
multicast group so a multicast sender reaches it."""
import socket
import time

from streaming import _parse_dmx_packet, sacn_multicast_group


def _free_udp_port() -> int:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    return port


def _sacn_data_packet(universe: int, channels: bytes) -> bytes:
    payload = channels[:512]
    dmp_count = len(payload) + 1  # start code + channels
    root = bytearray(126 + len(payload))
    root[0:2] = (0x00, 0x10)                     # preamble size
    root[2:4] = (0x00, 0x00)                     # post-amble size
    root[4:16] = b"ASC-E1.17\x00\x00\x00"        # ACN packet identifier
    root[16:18] = (0x70 | (((len(root) - 16) >> 8) & 0x0F), (len(root) - 16) & 0xFF)
    root[18:22] = (0, 0, 0, 4)                   # root vector: E1.31 data
    root[22:38] = b"\x01" * 16                   # CID
    root[38:40] = (0x70 | (((len(root) - 38) >> 8) & 0x0F), (len(root) - 38) & 0xFF)
    root[40:44] = (0, 0, 0, 2)                   # framing vector: DMP
    root[44:108] = b"Studio test source".ljust(64, b"\x00")
    root[108] = 100                              # priority
    root[109:111] = (0, 0)                       # sync address
    root[111] = 0                                # sequence
    root[112] = 0                                # options
    root[113:115] = ((universe >> 8) & 0xFF, universe & 0xFF)
    root[115:117] = (0x70 | (((len(root) - 115) >> 8) & 0x0F), (len(root) - 115) & 0xFF)
    root[117] = 2                                # DMP vector
    root[118] = 0xA1                             # address & data type
    root[119:121] = (0, 0)                       # first property address
    root[121:123] = (0, 1)                       # address increment
    root[123:125] = ((dmp_count >> 8) & 0xFF, dmp_count & 0xFF)
    root[125] = 0                                # DMX start code
    root[126:] = payload
    return bytes(root)


def test_sacn_parser_reads_universe_and_channels():
    parsed = _parse_dmx_packet(_sacn_data_packet(12, bytes([7, 8, 9])))
    assert parsed == (12, bytes([7, 8, 9]))
    assert _parse_dmx_packet(b"nonsense" * 20) is None
    assert sacn_multicast_group(1) == "239.255.0.1"
    assert sacn_multicast_group(300) == "239.255.1.44"


def test_sacn_packets_fill_the_same_snapshot_cache(client):
    port = _free_udp_port()
    universe = 5
    r = client.post("/api/artnet/start", json={"port": port, "protocol": "sACN", "universe": universe})
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.sendto(_sacn_data_packet(universe, bytes([11, 22, 33])), ("127.0.0.1", port))
    finally:
        sock.close()

    deadline = time.time() + 1.5
    body = None
    while time.time() < deadline:
        body = client.get("/api/artnet/snapshot", params={"universe": universe}).json()
        if body["valid"]:
            break
        time.sleep(0.02)
    assert body is not None and body["valid"] is True
    assert body["channels"][:4] == [11, 22, 33, 0]
    client.post("/api/artnet/stop")
