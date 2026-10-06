"""Live output from the studio: Adalight frames streamed over serial, and the
Art-Net/DMX listener behind the preview's DMX input.
"""
from __future__ import annotations

import asyncio
import socket
import threading
import time

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

router = APIRouter()

# ── Live streaming (Adalight) ─────────────────────────────────────────────────
# A lightweight alternative to a compile+flash cycle: once the tiny generic
# Adalight receiver sketch (src/codegen/sketches/streamReceiverGenerator.ts) is flashed
# once, the already-computed live-preview frames can be pushed straight to the
# board over the same serial port at interactive rates. Unlike every other
# serial use in this file, the port has to stay open *across* many small
# per-frame requests (reopening it every frame would blow the frame budget),
# so it's held in module state between /api/stream/start and /api/stream/stop
# rather than scoped to one request's generator lifetime.
_stream_lock = threading.Lock()
_stream_serial = None
_stream_port: str | None = None
_stream_baud: int = 0


def _stream_active() -> bool:
    return _stream_serial is not None


@router.post("/api/stream/start")
def stream_start(payload: dict = Body(...)):
    """Open (or reuse) a serial port for a live-streaming session.

    Body: {"port": "COM5", "baud": 115200}.
    """
    global _stream_serial, _stream_port, _stream_baud
    port = (payload.get("port") or "").strip()
    baud = int(payload.get("baud") or 115200)
    if not port:
        return JSONResponse({"ok": False, "error": "a serial port is required"}, status_code=400)
    try:
        import serial
    except ImportError:
        return JSONResponse({"ok": False, "error": "pyserial is not installed"}, status_code=500)
    with _stream_lock:
        if _stream_serial is not None:
            if _stream_port == port and _stream_baud == baud:
                return {"ok": True}
            try:
                _stream_serial.close()
            except Exception:
                pass
            _stream_serial = None
        try:
            # write_timeout bounds how long a write can block: without it pyserial
            # defaults to an indefinite blocking write, and if the receiver ever
            # falls behind (e.g. mid `FastLED.show()` with interrupts disabled)
            # long enough to back up the OS/driver output buffer, a write would
            # hang forever — see stream_frame's off-thread dispatch for why that
            # matters beyond just this one request.
            ser = serial.Serial(port, baud, timeout=0, write_timeout=1.0)
            # Avoid pulsing the common auto-reset lines on open — the receiver
            # sketch is already running, a reset would just show a black frame.
            ser.dtr = False
            ser.rts = False
        except Exception as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
        _stream_serial = ser
        _stream_port = port
        _stream_baud = baud
    return {"ok": True}


# A hard backstop above pyserial's own `write_timeout` (1.0s, set in
# stream_start). In practice a stalled receiver has been observed to make
# Serial.write() block far past that configured timeout on Windows — a known
# limitation of pyserial's overlapped-I/O write path with some USB-serial
# drivers, which don't reliably signal the timeout back through
# GetOverlappedResult when the device stops draining its input buffer. When
# that happens, `write_timeout` alone leaves the write hung forever, which
# used to wedge _stream_lock permanently (every later frame/stop/start request
# would then also block acquiring it) with no error ever surfacing — the
# stream just silently froze. This timeout is enforced independently at the
# asyncio layer, and closing the port's handle from here is what actually
# unblocks (or invalidates) the wedged write in its worker thread, since nothing
# else can interrupt a stuck blocking syscall in Python.
_STREAM_WRITE_TIMEOUT_S = 2.0


def _stream_write_sync(ser, body: bytes) -> None:
    """Blocking write on an already-open port object — runs in a worker
    thread. Takes `ser` directly (rather than reading the module global)
    so it never needs to hold `_stream_lock` for the write itself — only a
    quick snapshot/clear of the shared reference needs the lock, so one
    wedged write can't block every other stream request behind it."""
    ser.write(body)


async def _stream_fail(ser, error: str, status: int) -> JSONResponse:
    """A write failed or timed out — force the port closed and clear the
    session so the frontend's next frame/start sees a clean failure instead
    of silently going nowhere. Closing here (not from the possibly still-
    blocked write thread) is what lets an orphaned wedged write eventually
    unblock, since `Serial.close()` cancels a pending Windows overlapped I/O."""
    global _stream_serial
    with _stream_lock:
        if _stream_serial is ser:
            _stream_serial = None
    try:
        ser.close()
    except Exception:
        pass
    return JSONResponse({"ok": False, "error": error}, status_code=status)


@router.post("/api/stream/frame")
async def stream_frame(request: Request):
    """Write one pre-framed Adalight packet straight to the open stream port.

    The body is already the exact bytes to send (header + checksum + RGB data,
    built client-side by `src/utils/adalight.ts`) — this endpoint is deliberately
    just a thin pipe so per-frame overhead stays minimal.

    The write itself runs via `asyncio.to_thread` rather than inline: this
    process runs a single asyncio event loop, and `Serial.write()` can block
    for up to the port's `write_timeout` if the receiver falls behind. An
    inline blocking write would freeze every other request the helper is
    serving, not just this one — previously this could wedge live streaming
    silently (the frontend's fetch just never resolves) once enough backlog
    built up. `asyncio.wait_for` adds a second, independent bound on top of
    pyserial's own `write_timeout` — see `_STREAM_WRITE_TIMEOUT_S`.
    """
    body = await request.body()
    with _stream_lock:
        ser = _stream_serial
    if ser is None:
        return JSONResponse({"ok": False, "error": "stream not started"}, status_code=409)
    try:
        await asyncio.wait_for(asyncio.to_thread(_stream_write_sync, ser, body), timeout=_STREAM_WRITE_TIMEOUT_S)
    except asyncio.TimeoutError:
        return await _stream_fail(ser, "write timed out — the port may be wedged; stream stopped", 500)
    except Exception as e:
        return await _stream_fail(ser, str(e), 500)
    return {"ok": True}


@router.post("/api/stream/stop")
def stream_stop():
    global _stream_serial, _stream_port, _stream_baud
    with _stream_lock:
        if _stream_serial is not None:
            try:
                _stream_serial.close()
            except Exception:
                pass
        _stream_serial = None
        _stream_port = None
        _stream_baud = 0
    return {"ok": True}


@router.get("/api/stream/status")
def stream_status():
    return {"ok": True, "streaming": _stream_active(), "port": _stream_port, "baud": _stream_baud}


# ── Art-Net / DMX preview helper ─────────────────────────────────────────────
# The browser preview can't bind UDP sockets directly, so the local helper keeps
# one listener alive across requests and exposes cached universe snapshots over
# HTTP.
_ARTNET_LIVE_TTL_S = 2.0
_artnet_lock = threading.Lock()
_artnet_socket: socket.socket | None = None
_artnet_thread: threading.Thread | None = None
_artnet_stop_event: threading.Event | None = None
_artnet_port: int = 6454
_artnet_error: str | None = None
_artnet_snapshots: dict[int, dict] = {}


def _artnet_blank_channels() -> list[int]:
    return [0] * 512


def _artnet_last_packet_ms(snapshot: dict | None) -> int | None:
    if not snapshot or snapshot.get("last_packet_at") is None:
        return None
    return int(float(snapshot["last_packet_at"]) * 1000)


def _artnet_is_live(snapshot: dict | None, now: float | None = None) -> bool:
    if not snapshot or snapshot.get("last_packet_at") is None:
        return False
    now = time.time() if now is None else now
    return now - float(snapshot["last_packet_at"]) <= _ARTNET_LIVE_TTL_S


def _artnet_listening_locked() -> bool:
    return _artnet_socket is not None and _artnet_thread is not None and _artnet_thread.is_alive()


def _artnet_stop_listener(clear_error: bool = False) -> None:
    global _artnet_socket, _artnet_thread, _artnet_stop_event, _artnet_port, _artnet_snapshots, _artnet_error
    with _artnet_lock:
        sock = _artnet_socket
        thread = _artnet_thread
        stop_event = _artnet_stop_event
        _artnet_socket = None
        _artnet_thread = None
        _artnet_stop_event = None
        _artnet_snapshots = {}
        if clear_error:
            _artnet_error = None
    if stop_event is not None:
        stop_event.set()
    if sock is not None:
        try:
            sock.close()
        except Exception:
            pass
    if thread is not None and thread.is_alive():
        thread.join(timeout=1.0)


def _artnet_listener_loop(sock: socket.socket, stop_event: threading.Event) -> None:
    global _artnet_socket, _artnet_thread, _artnet_stop_event, _artnet_error
    try:
        while not stop_event.is_set():
            try:
                packet, _addr = sock.recvfrom(1024)
            except socket.timeout:
                continue
            except OSError:
                if stop_event.is_set():
                    break
                raise
            if len(packet) < 18 or not packet.startswith(b"Art-Net\x00"):
                continue
            opcode = packet[8] | (packet[9] << 8)
            if opcode != 0x5000:
                continue
            universe = packet[14] | (packet[15] << 8)
            count = min(((packet[16] << 8) | packet[17]), 512)
            if len(packet) < 18 + count:
                continue
            channels = _artnet_blank_channels()
            payload = packet[18:18 + count]
            channels[:len(payload)] = payload
            now = time.time()
            with _artnet_lock:
                previous = _artnet_snapshots.get(universe)
                prev_at = float(previous["last_packet_at"]) if previous and previous.get("last_packet_at") is not None else None
                packet_rate = (1.0 / max(0.001, now - prev_at)) if prev_at is not None else 0.0
                _artnet_snapshots[universe] = {
                    "channels": channels,
                    "last_packet_at": now,
                    "packet_rate": packet_rate,
                    "valid": True,
                }
                _artnet_error = None
    except Exception as exc:
        with _artnet_lock:
            _artnet_error = str(exc)
    finally:
        with _artnet_lock:
            if _artnet_socket is sock:
                _artnet_socket = None
            if _artnet_stop_event is stop_event:
                _artnet_stop_event = None
            _artnet_thread = None
        try:
            sock.close()
        except Exception:
            pass


@router.post("/api/artnet/start")
def artnet_start(payload: dict = Body(...)):
    global _artnet_socket, _artnet_thread, _artnet_stop_event, _artnet_port, _artnet_error
    port = int(payload.get("port") or 6454)
    if port < 1 or port > 65535:
        return JSONResponse({"ok": False, "error": "UDP port must be between 1 and 65535"}, status_code=400)
    with _artnet_lock:
        if _artnet_listening_locked() and _artnet_port == port:
            return {"ok": True}
    _artnet_stop_listener(clear_error=True)
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", port))
        sock.settimeout(0.25)
    except Exception as exc:
        try:
            sock.close()
        except Exception:
            pass
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    stop_event = threading.Event()
    thread = threading.Thread(target=_artnet_listener_loop, args=(sock, stop_event), daemon=True, name="artnet-listener")
    with _artnet_lock:
        _artnet_socket = sock
        _artnet_thread = thread
        _artnet_stop_event = stop_event
        _artnet_port = port
        _artnet_error = None
    thread.start()
    return {"ok": True}


@router.post("/api/artnet/stop")
def artnet_stop():
    _artnet_stop_listener(clear_error=True)
    return {"ok": True}


@router.get("/api/artnet/status")
def artnet_status(universe: int = 0):
    with _artnet_lock:
        snapshot = _artnet_snapshots.get(universe)
        listening = _artnet_listening_locked()
        port = _artnet_port
        error = _artnet_error
    return {
        "ok": True,
        "listening": listening,
        "port": port,
        "live": _artnet_is_live(snapshot),
        "packetRate": float(snapshot.get("packet_rate") or 0.0) if snapshot else 0.0,
        "lastPacketAt": _artnet_last_packet_ms(snapshot),
        "error": error,
    }


@router.get("/api/artnet/snapshot")
def artnet_snapshot(universe: int = 0):
    with _artnet_lock:
        snapshot = _artnet_snapshots.get(universe)
    return {
        "ok": True,
        "universe": universe,
        "valid": bool(snapshot and snapshot.get("valid")),
        "live": _artnet_is_live(snapshot),
        "packetRate": float(snapshot.get("packet_rate") or 0.0) if snapshot else 0.0,
        "lastPacketAt": _artnet_last_packet_ms(snapshot),
        "channels": list(snapshot["channels"]) if snapshot else _artnet_blank_channels(),
    }
