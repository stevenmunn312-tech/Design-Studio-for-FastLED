# Custom-board compile checks

> **Status: five of six pass, 7 October 2026.** The classic-ESP32 SD player
> overflows static RAM; see
> [Classic ESP32 SD player does not fit](#classic-esp32-sd-player-does-not-fit).
> This is compile evidence only. No custom layout
> has been compared against a real board's documented pinout, so the custom
> board stays experimental in the
> [support matrix](../../release/beta-support-matrix.md).

These fixtures are the compile check in
[custom boards, step 8](../../design/custom-board-pin-layouts.md#8-verify-firmware-behaviour-and-complete-the-rollout).
Two custom boards are built from the same data the editor saves:

- a 15/15 board on the generic ESP32 38-pin DevKit template, compiled for
  `esp32:esp32:esp32`;
- a 22/22 board on the generic ESP32-S3 N16R8 44-pin template, with PSRAM on,
  compiled for `esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.

Each header lists its GPIOs in an order that does not match their numbers, then
a ground, a 3.3 V supply and unconnected positions to fill the side. Each board
sets a custom default I2C pair (GPIO16/17 on the ESP32, GPIO8/9 on the S3).
Three I2C devices share it. An INA219 at 0x40 and an SSD1306 OLED set the pair
explicitly. An INA226 at 0x41 has no pins of its own and follows the board
default. The INA219 drives the OLED. The INA226 drives an ST7789 240×240 panel
showing the **Power Monitor** custom-screen template. An 8×8 LED output takes
its data from a header GPIO.

Each board is compiled in all three generators:

| Fixture | Generator | Extra parts |
| --- | --- | --- |
| `<board>-normal` | normal sketch | Solid Color into the LED output |
| `<board>-show` | generative show | Pattern Slideshow over a one-pattern collection |
| `<board>-player` | SD player | Pattern Master, SD card on the panel's SPI bus, I2S amplifier |

The show and player fixtures also give the Power Monitor its first compile in
those two generators. Until now only the normal sketch had been compiled
([INA226 compile record](ina226-compile-checks.md)).

## What the generator checks

`scripts/compile-fixtures/custom-board.ts` refuses to write a fixture set
unless each sketch passes these checks:

- the graph is wireable, has no pin conflicts and no board-pin errors;
- the sketch starts I2C once, as `Wire.begin(<sda>, <scl>)` with the custom
  pair, and every I2C device resolves to that pair;
- the LED data pin is defined as its Arduino GPIO number, not a header row or
  alias;
- both monitors are set up at their addresses and sampled once per loop;
- volts, amps and watts reach the OLED from the INA219 and the custom screen
  from the INA226.

It then checks every pin against the Build Diagram. For each pin in the
hardware manifest it looks up the board pin the diagram uses and asserts that
its GPIO is the one in the sketch. It also asserts that the diagram endpoint
lands on that pad's position in the custom-board geometry. The comparison is
saved beside each sketch as `<fixture>.graph.json`, and `manifest.json` lists
each fixture's source hash and connections.

| Use | ESP32 15/15 | ESP32-S3 22/22 |
| --- | --- | --- |
| LED data | L12 / GPIO5 | L12 / GPIO4 |
| I2C SDA, SCL (INA219, INA226, OLED) | L1 / GPIO16, L2 / GPIO17 | L1 / GPIO8, L2 / GPIO9 |
| Panel SCK, MOSI | L3 / GPIO18, L5 / GPIO23 | L3 / GPIO12, L4 / GPIO11 |
| Panel CS, DC, RESET | L6 / GPIO27, L7 / GPIO26, L8 / GPIO25 | L6 / GPIO14, L7 / GPIO15, L8 / GPIO16 |
| SD CS, MISO (player) | L13 / GPIO4, L4 / GPIO19 | L13 / GPIO10, L5 / GPIO13 |
| I2S BCLK, LRC, DOUT (player) | L9 / GPIO32, L10 / GPIO33, L11 / GPIO22 | L9 / GPIO17, L10 / GPIO18, L11 / GPIO21 |

## Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- custom-board
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/custom-board-compile/esp32-normal.ino --fqbn esp32:esp32:esp32
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/custom-board-compile/esp32-show.ino --fqbn esp32:esp32:esp32
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/custom-board-compile/esp32-player.ino --fqbn esp32:esp32:esp32
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/custom-board-compile/esp32s3-normal.ino
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/custom-board-compile/esp32s3-show.ino
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/custom-board-compile/esp32s3-player.ino
```

The runner is the [display compile](display-compile-checks.md) runner, because
every fixture carries an LVGL custom screen. Its default FQBN is the S3 target
above. It uses the helper's real build path and never flashes. It writes a log
and a JSON report beside each sketch. `artifacts/` is gitignored, so this page
is the durable result. Run the compiles one at a time: a run killed part-way,
or two at once, leaves a truncated cached object that fails the next link.

## Results, 7 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11, FastLED 3.10.5, LVGL 9.5.0
and the pinned player audio library 3.0.12. The classic ESP32 builds use the
helper's `huge_app` partition setting. The fixtures ran serially, ESP32 first.

| Fixture | Source SHA-256 | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| `esp32-normal` | `ef4afa521fbc` | Passed | 609,823 (19%) | 107,292 (32%) |
| `esp32-show` | `3fa9a67d0d6e` | Passed | 615,779 (19%) | 107,496 (32%) |
| `esp32-player` | `cce53a3f1c0a` | **Failed: DRAM overflow** | n/a | 136 bytes over `dram0_0_seg` |
| `esp32s3-normal` | `458203ec8392` | Passed | 639,015 (20%) | 107,156 (32%) |
| `esp32s3-show` | `9029b5ffea66` | Passed | 643,639 (20%) | 107,236 (32%) |
| `esp32s3-player` | `fec8fb066579` | Passed | 1,317,687 (41%) | 122,580 (37%) |

The ESP32 normal and show builds compiled before the runner fix in `003be694`,
so they have no JSON report; their rows come from the build logs. The later
rows match their JSON reports.

### Classic ESP32 SD player does not fit

`esp32-player` compiled every object and failed at link:
`region 'dram0_0_seg' overflowed by 136 bytes`. On classic ESP32 that region
holds all static data and is 124,580 bytes long. The linker map shows what
fills it:

| Allocation | Bytes |
| --- | ---: |
| LVGL's static memory pool (`work_mem_int`, `LV_MEM_SIZE`) | 65,536 |
| Custom-screen draw buffer for the 240×240 panel | 9,600 |
| Player provisioning receive block | 4,096 |
| SSD1306 frame buffer | 2,068 |
| Everything else: core, FreeRTOS, Wi-Fi and lwIP (linked by the audio library), I2S, I2C | the rest |

None of these allocations depends on the custom board, so a stock 38-pin
DevKit with the same graph should overflow the same way; that was not compiled.
This is the first classic-ESP32 SD player with a custom screen in any compile
record. The fixed LVGL pool takes more than half of the static segment, which
leaves a player with a custom screen little room: this graph, with an OLED
beside the panel, is 136 bytes over. The helper catches the overflow and reports it as **Too big** with advice. One line
of that advice, "choose a smaller LVGL heap where the screen permits it", names
a setting the app does not have: `LV_MEM_SIZE` is fixed at 64 KiB in
`backend/toolchain.py`.

The same graph on the ESP32-S3, which has more internal RAM, linked with
122,580 bytes of static RAM.

## What this establishes

On both targets, custom SDA/SCL reach a single `Wire.begin` shared by three
I2C devices, and the generated GPIOs are the Arduino numbers the Build Diagram
draws. The normal sketch and the generative show compile on both boards, and
the SD player compiles on the ESP32-S3. The Power Monitor's readouts compile in
the generative show on both targets and in the SD player on the ESP32-S3. The
custom layouts have not been compared against a physical board.
