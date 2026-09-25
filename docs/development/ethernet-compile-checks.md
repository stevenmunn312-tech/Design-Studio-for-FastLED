# Wired-Ethernet firmware compile checks

> **Status: complete.** The WIZ850io Art-Net, NTP and static-address sketches
> passed on classic ESP32, the shared-SPI sketch passed on ESP32-C3, and the
> Wi-Fi guard passed, on 25 September 2026. This is compile evidence only; the
> module remains experimental in the [support matrix](../release/beta-support-matrix.md)
> until its recorded bench run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each Art-Net fixture reads universe 0, channel 1 and uses it as LED-output
brightness; the NTP fixture maps the synced clock's seconds to brightness. The
module uses the library default pins on classic ESP32 (SCLK 25, MOSI 26,
MISO 35, SCNn 32, INTn 33, RSTn 27) and C3-safe pins on the C3 (4, 6, 5, 7, 10,
3). The `wifi` fixture is the same Art-Net graph without the module, guarding
the Wi-Fi bootstrap that was renamed to `_netEnsureConnected`/`_netConnected`.
Fixture generation refuses any set where an Ethernet sketch lacks exactly one
`ETH.begin(ETH_PHY_W5500, ...)` or still calls `WiFi.begin`, or the guard does
the reverse. See [wired Ethernet](design/wired-ethernet.md).

| Fixture | What it covers | Target | Result |
| --- | --- | --- | --- |
| `artnet` | Art-Net over the W5500, `SPIClass(HSPI)` | `esp32:esp32:esp32` | **Pass** |
| `ntp` | NTP time sync over the W5500 | `esp32:esp32:esp32` | **Pass** |
| `static` | Art-Net with `ETH.config` static addressing | `esp32:esp32:esp32` | **Pass** |
| `c3` | Art-Net on a one-host chip, sharing `SPI` | `esp32:esp32:esp32c3` | **Pass** |
| `wifi` | The same Art-Net graph on Wi-Fi (guard) | `esp32:esp32:esp32` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:ethernet-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/ethernet-fixtures/artnet.ino --fqbn esp32:esp32:esp32 --tag esp32 --label ethernet
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/ethernet-fixtures/ntp.ino --fqbn esp32:esp32:esp32 --tag esp32 --label ethernet
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/ethernet-fixtures/static.ino --fqbn esp32:esp32:esp32 --tag esp32 --label ethernet
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/ethernet-fixtures/c3.ino --fqbn esp32:esp32:esp32c3 --tag esp32c3 --label ethernet
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/ethernet-fixtures/wifi.ino --fqbn esp32:esp32:esp32 --tag esp32 --label ethernet
```

The runner is shared with the [presence-sensor](presence-sensor-compile-checks.md)
and [light-sensor](light-sensor-compile-checks.md) checks; `--label ethernet`
gives these fixtures their own arduino-cli workspace. It uses the helper's real
`_compile_upload` path and never flashes. `backend/sketches/` is gitignored, so
this page is the durable result.

## Results, 25 September 2026

Toolchain: arduino-cli 1.5.1 and ESP32 core 3.3.11.

| Fixture | Source | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| artnet | `e6d6f05d` | pass | 654,139 / 1,310,720 (49%) | 36,480 / 327,680 (11%) |
| ntp | `570d8bf8` | pass | 656,959 / 1,310,720 (50%) | 35,920 / 327,680 (10%) |
| static | `0785b376` | pass | 657,007 / 1,310,720 (50%) | 36,480 / 327,680 (11%) |
| c3 | `60c07fbc` | pass | 720,170 / 1,310,720 (54%) | 26,644 / 327,680 (8%) |
| wifi | `ea5c6f2b` | pass | 1,013,099 / 1,310,720 (77%) | 51,776 / 327,680 (15%) |

The same Art-Net graph is about 360 KB of flash and 15 KB of RAM smaller over
Ethernet than over Wi-Fi: with a module on the bench the sketch never starts
the radio, so the Wi-Fi driver is not linked.

## Not covered

- fbuild. These ran on arduino-cli only.
- ESP32-S2 and S3, which take the same `SPIClass(HSPI)` branch as classic ESP32.
- A C3 build with a colour panel on the shared bus.
- Anything on hardware: link-up, DHCP, Art-Net over the cable, NTP sync and
  cable recovery are the bench row.
