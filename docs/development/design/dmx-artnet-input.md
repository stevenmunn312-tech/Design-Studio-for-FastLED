# DMX / Art-Net input — design note

Status: implemented (v1 shipped, hardware validation outstanding) · Owner: app ·
Date: 2026-07-28

Lets an external lighting desk or Art-Net controller drive a Studio graph:
a console pushes a universe, the graph reads channels out of it, and the same
wiring works in the browser preview and in generated firmware. This note locks
what v1 actually promises so later slices have a fixed thing to extend.

Shipped in `2ab9ca4` (#126) with the credential fix in `1fb7083` (#127). Written
after implementation, so it records the contract as built.

## The shape of the problem

DMX512 is 512 bytes arriving ~44×/second. Three things make it awkward for a
node graph:

1. **A universe is a buffer, not a value.** Exposing it as node outputs would
   mean 512 ports, or an arbitrary "first 8 channels" cut.
2. **Three runtimes, two transports.** The browser can't open a UDP socket or
   drive an RS-485 transceiver; the ESP32 can do both; and which one is in play
   depends on a node property, not on where the code runs.
3. **Preview must stay useful without hardware.** A designer wiring a DMX graph
   at a desk with no console attached still needs the node to behave sanely.

## Decisions

### One `dmx` port type carrying a whole universe

`src/state/dmx.ts` defines `DmxSnapshot` — `universe`, a 512-entry `channels`
array of 0–255 bytes, plus `valid` / `live` / `packetRate` / `lastPacketAt` /
`source`. The `dmx` `dataType` carries that object down one wire. Decoding is a
separate node's job.

Rejected: fanning the source node out into scalar outputs. Sixteen ports would
be arbitrary, 512 unusable, and either choice bakes a channel layout into the
node library instead of leaving it to the patch.

The diagnostic fields (`packetRate`, `lastPacketAt`, `source`, `live`) exist for
the node body's status readout. **They are deliberately not graph outputs** — a
patch that wants "is the desk alive" uses `DMXChannel.active` on a known channel.

### Source node + decoder node

- **`DMXInput`** (input category) — no inputs, one `dmx` output. Owns the
  transport choice (`inputMode`: `Art-Net` or `DMX512`) and its configuration.
- **`DMXChannel`** (signal category) — one `dmx` input, four outputs: `value`
  (0–1), `byte` (0–255), `active` (`byte >= activeThreshold`), and `changed`
  (this frame's byte differs from last frame's).

Channel numbers are 1-based in the UI, 0-based in the buffer; `clampDmxChannel`
holds the UI to 1–512 and both runtimes subtract one at the read site.

`changed` never fires on the first frame a node sees — the evaluator keeps a
per-instance `{ last, seen }` and firmware a `static bool _dmxSeen_<id>`, so a
patch can't get a spurious edge at boot from "0 → whatever the desk was already
sending."

### Preview goes through the helper; firmware talks to the wire

| | Preview (browser) | Firmware `Art-Net` | Firmware `DMX512` |
|---|---|---|---|
| Transport | helper UDP listener, polled | `WiFiUDP` on the sketch's Wi-Fi | `esp_dmx` on an RS-485 transceiver |
| Where | `backend/app.py` + `dmxStore.ts` | generated `loop()` | generated `loop()` |
| Filter | universe must match the node's | opcode `0x5000` + universe match | driver-level |
| Goes stale after | helper's own liveness check | 2000 ms without a packet | 1000 ms without a packet |
| Boards | any | ESP32 / ESP8266 | ESP32 only |

The helper (`/api/artnet/start|stop|status|snapshot`) owns a long-lived UDP
socket and a per-universe snapshot cache, exactly like the live-stream serial
port: the browser can't hold the socket, and reopening one per poll would drop
packets. `dmxStore.ts` polls status + snapshot every 350 ms and normalizes
whatever comes back through `normalizeDmxChannels`.

**Preview is Art-Net only, in both modes.** A node set to `DMX512` still shows
the helper's Art-Net feed if one is running, and its body says so outright
("Preview listens for Art-Net only; firmware uses the selected DMX512 pins").
The alternative — a helper-side USB-DMX dongle path — is a hardware-support
project, not a slice of this one.

### Parity rules

What preview and firmware **must** agree on, and where the tests live:

- Channel indexing, the 0–1 normalization (`byte / 255`), the `active`
  threshold comparison, and `changed`'s first-frame suppression.
- Universe filtering: a packet for a different universe is ignored, and a
  `DMXInput` whose universe doesn't match the live snapshot reads **blank**
  (all zeros, `valid: false`) rather than the wrong desk's data.
- Art-Net parsing: the `Art-Net\0` magic, opcode `0x5000`, the big-endian slot
  count at bytes 16–17, and the ≤512 clamp are implemented twice (Python and
  C++) against the same field offsets.

What deliberately **differs**:

- The DMX512 start code. `esp_dmx` hands back a packet whose byte 0 is the start
  code, so firmware copies from `_dmxRaw + 1`; Art-Net's payload begins at byte
  18 with no start code. Both land as "channel 1 is `channels[0]`."
- Liveness timeouts (1 s vs 2 s), which follow each transport's own refresh rate
  rather than a shared constant.
- Preview has no `DMX512` path at all, as above.

### Wi-Fi credentials never enter the project

`wifiSsid` / `wifiPassword` began as ordinary node properties, which put them in
project files, share links, and the helper-backed `Projects/` JSON mirror in
plain text. `#127` moved them to `src/state/networkCredentials.ts` — a
browser-local store keyed by node id, like a saved Wi-Fi password on a phone.
Codegen and `validateGraph` look them up by node id; `graphStore` migrates any
previously-saved values across on load and strips them from properties.

Generated firmware still embeds the plaintext credential, because there is no
other way for a sketch to join a network. That is a property of exporting
firmware, and the export/upload trust warning already covers "this code is going
to a device." What changed is that sharing a *graph* no longer shares a password.

The rest of the network config stays on the node: `wifiHostname`, `useDhcp`, and
`staticIp` / `staticGateway` / `staticSubnet` / `staticDns` (enabled only when
`useDhcp` is off), all gated by `isPropertyEnabled` so DMX512 mode doesn't show
Wi-Fi fields and vice versa.

**One sketch, one Wi-Fi connection.** `_wifiEnsureConnected()` is emitted once
and shared by every Art-Net `DMXInput` and every NTP `RTCInput`; the first
node's settings win. `validateGraph` warns when network-enabled nodes disagree
rather than silently picking one.

## Validation

`validateGraph.ts` blocks upload for: DMX512 on a non-ESP32 target (esp_dmx is
ESP32-only), Art-Net or NTP on a board with no Wi-Fi, and DMX UART pins that
collide with any other GPIO role — the DMX pins join the shared pin-conflict
namespace rather than getting their own check. Missing SSID and disagreeing
Wi-Fi settings are warnings. Each has a repair line in the Graph Health drawer.

## Deliberately out of v1

- **sACN / E1.31.** Art-Net first because it is what small controllers and
  desks default to; the snapshot type is transport-agnostic, so adding sACN is a
  listener plus a mode, not a data-model change.
- **DMX output / transmit and RDM.** Studio drives LEDs, not fixtures.
- **Multiple simultaneous universes.** Firmware gives each `DMXInput` its own
  buffer and socket, but **preview holds exactly one live universe**:
  `dmxStore` is a singleton, the last-mounted node's universe wins, and any
  other `DMXInput` previews blank. Two Art-Net nodes on the same UDP port will
  also collide in firmware. Single-source is the supported v1 shape.
- **A helper-side DMX dongle** for previewing real DMX512 without a board.

## Known warts

- `previewPort` is a misleading name: the Art-Net firmware branch binds its
  `WiFiUDP` socket to the same property, so it is the UDP port for both preview
  and firmware. Renaming it means a property migration for saved projects —
  worth doing, but not silently.

## Follow-ups

Tracked in `todo.md` under **Node additions worth considering → DMX/Art-Net
input node**:

- The docs/release sweep (node cards, README, CHANGELOG, support matrix, the
  Wi-Fi-credential privacy note).
- **Hardware validation — both passes.** One DMX512 run against a real
  transceiver and one Wi-Fi/Art-Net run against a real controller. Until then
  this stays experimental in `docs/release/beta-support-matrix.md`; everything
  above is verified only by unit, codegen, and backend tests.
