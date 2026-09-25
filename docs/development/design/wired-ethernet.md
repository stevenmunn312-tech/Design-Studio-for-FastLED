# Wired Ethernet — design note

Status: implemented, experimental (compiles; no bench row yet) · Owner: app ·
Date: 2026-09-25

Roadmap step 6 of the [hardware expansion roadmap](../plans/hardware-expansion-roadmap.md):
a W5500 module that carries the sketch's network over a cable instead of
Wi-Fi, for Art-Net receive and NTP time sync.

## The part

The **WIZnet WIZ850io** (`wiz850io-ethernet-module`): a W5500 with the RJ45
MagJack and its transformer on a 23 x 25 mm board, two 1x6 headers 20.32 mm
apart, 3.3 V only (up to about 141 mA with a 100 Mb/s link). It was chosen over
the common blue W5500 board because WIZnet publishes its board file, so the
model is source-backed like the Adafruit parts. The asset is built by
`Scripts/generate_ethernet_parts.py` in the Blender workspace from WIZnet's
Altium board (`WIZ850io_SCH_V110.PcbDoc`). The MagJack is the vendor's own
STEP body, extracted from that board file and tessellated by
`Scripts/step_to_stl.py`, because Blender cannot import STEP.

Only the jack is on the top side; the W5500, crystal, passives and both headers
are underneath. The render is turned 90 degrees clockwise from WIZnet's
drawing: RJ45 to the right, J1 (GND, GND, MOSI, SCLK, SCNn, INTn) along the
top, J2 (GND, 3V3D, 3V3D, NC, RSTn, MISO) along the bottom, pin 1 of each at
the right. The board itself prints no pin names.

## What it is in the graph

`EthernetModule` is a hardware-only part, like the SD card: no ports, no
evaluation, found by scanning the root graph. It carries no signal. What it
changes is how the two network users reach the network, not what any node
outputs. Art-Net `DMXInput` and NTP `RTCInput` keep their own hostname and
addressing settings, and the module only replaces the radio. `src/state/ethernetModule.ts`
owns the part list, its pin keys, and which chips it builds for.

With the module on the bench, the DMX and RTC node bodies stop asking for Wi-Fi
credentials, and validation stops warning about a missing SSID.

## Firmware

Art-Net and NTP call `_netEnsureConnected()` and `_netConnected()`, which were
`_wifi*` before this. Arduino-ESP32 3.x routes `WiFiUDP` sockets and SNTP over
whichever interface is up, so those two emitters needed no Ethernet code. Only
the bootstrap differs: `src/codegen/ethernetCpp.ts` emits `ETH.begin(ETH_PHY_W5500,
...)` on an `SPIClass`, sets the hostname and, when DHCP is off, `ETH.config`.
`_netConnected()` is `ETH.connected() && ETH.hasIP()`.

Two rules are load-bearing:

- **The module gets its own SPI host where the chip has one.** A colour panel
  drives the default `SPI` object, and `SPI.begin` takes pins only the first
  time it is called, so sharing that object means sharing pins. Where `HSPI`
  exists (classic ESP32, S2, S3) the module gets `SPIClass(HSPI)` and its pins
  are its own. The C3 and C6 have one general-purpose host, so the module shares
  `SPI`, and validation requires its SCLK and MOSI to match any SPI panel's.
  It is also why `busTopology.ts` gives the bus lines no shared SPI role:
  they default to exclusive pins. ESP8266 and non-Espressif targets are refused.
- **The interface starts in `setup()`, before the Art-Net socket opens.**
  `ETH.begin` creates the network interface the socket binds to. Starting it
  does not wait for a cable or an address.

Only the normal sketch has a network, so only `cppGenerator.ts` emits this.

## Validation

`ethernetValidationIssues` in `validateGraph.ts` is one walk projected into
the deploy gate and Graph Health:

- an unsupported board, when something uses the network (error);
- on a one-host chip, an SPI panel on different SCLK/MOSI pins (error);
- more than one module (error);
- a module nothing uses (warning — the build is correct, the part idle).

## Build Diagram

The module is drawn from its measured pads, powered from 3V3 (`3V3D`). Because
its headers are two rows, a pad in the top row sits over one in the bottom row.
`peripheralApproach` in `physicalDiagramLayout.ts` makes such a wire climb half
a pitch to the side, between the lower pads, and jog across under the part's
picture, rather than climbing through the lower pad and reading as landing
there. The ground stub hangs from the lowest GND pad (`peripheralGroundPadIndex`),
since a top-row stub would sit under the module.

## Not done

- A bench row: link up, DHCP and static addressing, Art-Net received over the
  cable, NTP sync, and cable pull/replug recovery. See the
  [support matrix](../../release/beta-support-matrix.md). The sketches compile
  on classic ESP32 and ESP32-C3 ([compile record](../ethernet-compile-checks.md));
  fbuild, S2/S3 and a C3 sharing its bus with a panel are not yet compiled.
- Other W5500 boards, and LAN8720/RMII boards such as the WT32-ETH01, which
  would be a board profile rather than a module.
- Networking in the show and SD-player generators, which have none today.
