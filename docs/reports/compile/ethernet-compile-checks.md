# Wired-Ethernet firmware compile checks

> **Status: complete.** All eight fixtures pass on Arduino CLI as of
> 8 October 2026: the WIZ850io Art-Net, NTP and static-address sketches on
> classic ESP32, the module on ESP32-S2 and ESP32-S3, a C3 on its own bus and
> a C3 sharing that bus with a colour panel, and the Wi-Fi guard. This is
> compile evidence only; the module remains experimental in the
> [support matrix](../../release/beta-support-matrix.md) until its recorded
> bench run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each Art-Net fixture reads universe 0, channel 1 and uses it as LED-output
brightness; the NTP fixture maps the synced clock's seconds to brightness. The
`wifi` fixture is the same Art-Net graph without the module, guarding the
Wi-Fi bootstrap that was renamed to `_netEnsureConnected`/`_netConnected`.
See [wired Ethernet](../../design/wired-ethernet.md).

| Fixture | What it covers | Target | Module pins (SCLK, MOSI, MISO, SCNn, INTn, RSTn) |
| --- | --- | --- | --- |
| `artnet` | Art-Net over the W5500, `SPIClass(HSPI)` | `esp32:esp32:esp32` | library defaults 25, 26, 35, 32, 33, 27 |
| `ntp` | NTP time sync over the W5500 | `esp32:esp32:esp32` | library defaults |
| `static` | Art-Net with `ETH.config` static addressing | `esp32:esp32:esp32` | library defaults |
| `c3` | Art-Net on a one-host chip, sharing `SPI` | `esp32:esp32:esp32c3` | 4, 6, 5, 7, 10, 3 |
| `c3-panel` | `c3` with an ST7789 panel on the same SCLK and MOSI, its own select | `esp32:esp32:esp32c3` | 4, 6, 5, 7, 10, 3 |
| `s2` | Art-Net on ESP32-S2's `HSPI` | `esp32:esp32:esp32s2` | 36, 35, 37, 34, 33, 38 |
| `s3` | Art-Net on ESP32-S3's `HSPI`, a panel on the default SPI pins beside it | `esp32:esp32:esp32s3` | 16, 17, 18, 15, 21, 47 |
| `wifi` | The same Art-Net graph on Wi-Fi (guard) | `esp32:esp32:esp32` | no module |

The S2 and S3 pins avoid the SPI flash and PSRAM lines the classic defaults
fall on there. Every fixture except the classic ones names its board profile
(ESP32-C3-DevKitM-1, ESP32-S2-DevKitC-1, ESP32-S3-DevKitC-1).

Fixture generation refuses a set where any graph fails the deploy gate or its
board's pin checks for its target, where an Ethernet sketch lacks exactly one
`ETH.begin(ETH_PHY_W5500, ...)` or still calls `WiFi.begin` (or the guard does
the reverse), or where a panel fixture's `setup()` does not start the network
before the panel's `SPI.begin`. That order matters on the C3: `SPI.begin` takes
pins only the first time, and the panel's call names no MISO.

## Reproduce

From the repository root:

```powershell
python scripts/compile-fixtures/compile-matrix.py --only ethernet/
```

That regenerates the fixtures and compiles them one at a time on Arduino CLI
through `compile-presence-smoke.py --label ethernet`, which uses the helper's
real `_compile_upload` path in its own arduino-cli workspace and never
flashes. `backend/sketches/` is gitignored, so this page is the durable result.

## Results, 8 October 2026

Toolchain: arduino-cli 1.5.1 and ESP32 core 3.3.11, with the helper's
`huge_app` partition on every target.

| Fixture | Target | Source | Result | Flash | RAM |
| --- | --- | --- | --- | --- | --- |
| artnet | `esp32:esp32:esp32` | `e6d6f05d` | pass | 654,203 / 3,145,728 (20%) | 36,480 / 327,680 (11%) |
| ntp | `esp32:esp32:esp32` | `570d8bf8` | pass | 656,959 / 3,145,728 (20%) | 35,920 / 327,680 (10%) |
| static | `esp32:esp32:esp32` | `0785b376` | pass | 657,071 / 3,145,728 (20%) | 36,480 / 327,680 (11%) |
| wifi | `esp32:esp32:esp32` | `ea5c6f2b` | pass | 1,013,099 / 3,145,728 (32%) | 51,776 / 327,680 (15%) |
| c3 | `esp32:esp32:esp32c3` | `25120aae` | pass | 720,234 / 3,145,728 (22%) | 26,644 / 327,680 (8%) |
| c3-panel | `esp32:esp32:esp32c3` | `c1eb4bed` | pass | 722,680 / 3,145,728 (22%) | 26,756 / 327,680 (8%) |
| s2 | `esp32:esp32:esp32s2` | `f359437f` | pass | 626,766 / 3,145,728 (19%) | 30,768 / 327,680 (9%) |
| s3 | `esp32:esp32:esp32s3` | `5f1fbbff` | pass | 675,067 / 3,145,728 (21%) | 34,808 / 327,680 (10%) |

What the numbers show:

- The four classic sources are unchanged since 25 September. `ntp` and `wifi`
  are byte-identical; `artnet` and `static` are 64 bytes larger with the same
  source, so the difference comes from outside the sketch.
- The same Art-Net graph is about 360 KB of flash and 15 KB of RAM smaller over
  Ethernet than over Wi-Fi: with a module on the bench the sketch never starts
  the radio, so the Wi-Fi driver is not linked.
- On the C3 the shared panel costs 2,446 bytes of flash and 112 bytes of RAM.

Writing the `c3-panel` fixture found a validation defect: on a one-host chip
the Ethernet check required the panel to share the module's SCLK and MOSI,
while the pin-collision walk refused that sharing as a mixed-role collision,
so no C3 or C6 with a panel and a module could pass the deploy gate. Fixed in
`f35e377a`; the module's bus lines now take SPI roles on a one-host chip.

Seven of the eight fixtures also passed on fbuild 2.5.37 the same morning, all
but `s3`, before fbuild was put on hold. They are not part of this record's
result.

## Not covered

- Anything on hardware: link-up, DHCP, Art-Net over the cable, NTP sync and
  cable recovery are the bench row.
- ESP32-C6, which takes the C3's shared-bus branch.
