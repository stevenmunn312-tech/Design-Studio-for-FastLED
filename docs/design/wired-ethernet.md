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
addressing settings, and the module only replaces the radio. `src/state/peripherals/ethernetModule.ts`
owns the part list, its pin keys, and which chips it builds for.

With the module on the bench, the DMX and RTC node bodies stop asking for Wi-Fi
credentials, and validation stops warning about a missing SSID.

## Firmware

Art-Net and NTP call `_netEnsureConnected()` and `_netConnected()`, which were
`_wifi*` before this. Arduino-ESP32 3.x routes `WiFiUDP` sockets and SNTP over
whichever interface is up, so those two emitters needed no Ethernet code. Only
the bootstrap differs: `src/codegen/peripherals/ethernetCpp.ts` emits `ETH.begin(ETH_PHY_W5500,
...)` on an `SPIClass`, sets the hostname and, when DHCP is off, `ETH.config`.
`_netConnected()` is `ETH.connected() && ETH.hasIP()`.

Two rules are load-bearing:

- **The module gets its own SPI host where the chip has one.** A colour panel
  drives the default `SPI` object, and `SPI.begin` takes pins only the first
  time it is called, so sharing that object means sharing pins. Where `HSPI`
  exists (classic ESP32, S2, S3) the module gets `SPIClass(HSPI)` and its pins
  are its own. The C3 and C6 have one general-purpose host, so the module shares
  `SPI`, and validation requires its SCLK and MOSI to match any SPI panel's.
  The pin-collision walk follows the same rule: `collectPinUses` gives the
  module's SCLK, MOSI, MISO and SCNn SPI roles only on a one-host chip, so a
  panel may share the bus lines there but needs its own chip select, and on a
  chip with a second host every module pin stays exclusive. Both read
  `ethernetSpiHostForFqbn`, which treats an unchosen board as one with a
  second host. ESP8266 and non-Espressif targets are refused.
- **The interface starts in `setup()`, before the Art-Net socket opens.**
  `ETH.begin` creates the network interface the socket binds to. Starting it
  does not wait for a cable or an address.

Only the normal sketch has a network, so only `cppGenerator.ts` emits this.

## Ethernet built into the board

The WT32-ETH01 carries a LAN8720A on the ESP32's own EMAC, so its Ethernet is a
fact of the board profile (`onboardEthernet` in `boardProfiles.ts`), not a part
on the bench. `wiredNetworkIn` in `ethernetModule.ts` answers which cable the
network uses: the selected board's own port first, otherwise an Ethernet module.
The generator, the SSID checks and the DMX and RTC node bodies all ask it, so a
WT32 needs no Wi-Fi credentials and no module.

`onboardEthernetBootstrapCpp` emits `ETH.begin(ETH_PHY_LAN8720, 1, 23, 18, 16,
ETH_CLOCK_GPIO0_IN)`, the wiring in the core's `wt32-eth01` variant, and shares
the hostname, static address and `_netConnected()` tail with the W5500 path.
There is no `SPIClass` and no user pin. The ten RMII and PHY pins are reserved
in the board's pin safety and GPIO table, and GPIO0, which carries the PHY's
50 MHz clock, is on the header for flashing only.

A W5500 module on a WT32 is never started, so validation warns that it is idle
and the module's pins, which land on RMII lines by default, are refused by the
ordinary pin checks.

## Validation

`ethernetValidationIssues` in `validateGraph.ts` is one walk projected into
the deploy gate and Graph Health:

- an unsupported board, when something uses the network (error);
- a module on a board with Ethernet built in (warning — the board's own port
  carries the network);
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
  [support matrix](../release/beta-support-matrix.md). The sketches compile
  on classic ESP32, ESP32-S2, ESP32-S3, and ESP32-C3 alone or sharing its bus
  with a panel ([compile record](../reports/compile/ethernet-compile-checks.md)).
- Other W5500 boards, and LAN8720/RMII boards other than the WT32-ETH01.
- Networking in the show and SD-player generators, which have none today.
