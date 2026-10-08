# Controller-board compile checks

> **Status: Arduino Nano ESP32 and WT32-ETH01 complete.** Their fixtures
> passed on 8 and 9 October 2026. This is compile evidence only; both boards
> stay experimental in the [support matrix](../../release/beta-support-matrix.md)
> until a recorded bench run exists. The QuinLED Dig-Uno and Dig-Quad v3.1
> profiles share the already-covered `esp32:esp32:esp32` target and change only
> physical wiring, so neither needs a separate fixture.

A new controller board needs a compile only where its build differs from a
target that already passes. The ESP32-C3 Super Mini, ESP32-C6-DevKitC-1, LOLIN
D1 Mini, Pico W and Teensy 4.1 build on FQBNs the other records already cover,
so their profiles needed none.

## Arduino Nano ESP32

The board's core numbers pins by their D and A names unless its Pin Numbering
menu says otherwise. Studio's sketches use GPIO numbers, so the helper builds
`esp32:esp32:nano_nora` as
`esp32:esp32:nano_nora:PinNumbers=byGPIONumber,PartitionScheme=default`
(`_arduino_fqbn` in `backend/toolchain.py`). The board's partition menu has no
`huge_app`, so it keeps its own 16 MB table with a 3 MB app slot.

The fixture comes from a real Studio graph on the `arduino-nano-esp32` profile:
two LED outputs on D6 (GPIO9) and D12 (GPIO47), a pot on A0 (GPIO1), and a
BH1750 on A4/A5 (GPIO11/12), the board's default I2C pair. Fixture generation
refuses a sketch whose pins are not those GPIO numbers. The build log shows
`BOARD_USES_HW_GPIO_NUMBERS` defined, so the core's D-number remap is off.

### Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- nano-esp32
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/nano-esp32-fixtures/nano-esp32.ino --fqbn esp32:esp32:nano_nora --tag nano-esp32 --label nano-esp32
```

The runner uses the helper's real `_compile_upload` path and never flashes.
`backend/sketches/` is gitignored, so this page is the durable result. Run
compiles one at a time; they share one arduino-cli workspace.

### Result, 8 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5.

Source hash: `nano-esp32` `5af01433`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| nano-esp32 | arduino-cli | pass | 521,555 / 3,145,728 (16%) | 62,148 / 327,680 (18%) |

Not established: uploading. The board flashes through Arduino's DFU
bootloader, which `arduino-cli upload` drives for this FQBN, but no board has
been flashed from Studio yet.

## WT32-ETH01

The board's Ethernet is a LAN8720A on the ESP32's internal EMAC, which no other
record builds: the W5500 fixtures in the
[Ethernet record](ethernet-compile-checks.md) reach their module over SPI. The
helper builds `esp32:esp32:wt32-eth01` with the `huge_app` partition scheme,
like every classic ESP32 it knows.

The fixture comes from a real Studio graph on the `wt32-eth01` profile, with no
Ethernet module on the bench: Art-Net channel 1 dims an LED output on IO4, an
NTP clock's seconds fill a meter on IO14, and a BH1750 on IO33/IO32, the core's
default I2C pair, sets the meter's brightness. Fixture generation refuses a
sketch that does not start the PHY with
`ETH.begin(ETH_PHY_LAN8720, 1, 23, 18, 16, ETH_CLOCK_GPIO0_IN)`, or that calls
`WiFi.begin`, names the W5500 or includes `SPI.h`.

### Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- wt32-eth01
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/wt32-eth01-fixtures/wt32-eth01.ino --fqbn esp32:esp32:wt32-eth01 --tag wt32-eth01 --label wt32-eth01
```

### Result, 9 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5.

Source hash: `wt32-eth01` `b12de715`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| wt32-eth01 | arduino-cli | pass | 662,003 / 3,145,728 (21%) | 38,944 / 327,680 (11%) |

Not established: uploading and running. The board has no USB; it flashes
through a USB-to-serial adapter on TXD0 and RXD0 with IO0 held to GND at
reset, which `arduino-cli upload` drives like any esptool board, but no board
has been flashed from Studio yet.
