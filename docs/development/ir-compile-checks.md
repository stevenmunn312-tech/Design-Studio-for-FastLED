# IR remote firmware compile checks

> **Status: complete, except where fbuild itself is blocked.** Every board
> family IR claims has at least one passing engine. Three fbuild legs cannot
> run because fbuild fails on a board core before it reaches IR code: RP2040,
> Renesas, and SAMD21. STM32 builds only on fbuild, because the app's STM32
> FQBNs carry no stm32duino `pnum` (see `src/state/uploadStore.ts`). This file
> is D-05a step 13's evidence in [todo.md](../../todo.md). It is compile evidence only, so every IR
> combination stays experimental in the
> [beta support matrix](../release/beta-support-matrix.md) until a bench row
> exists.

The fixtures come from real graphs. They are not hand-written sketches. Each IR
fixture wires four learned NEC keys through one receiver on GPIO 12: Power goes
through a Trigger toggle to LED-output Enabled, and Brightness Up/Down/Reset go
through a Step Value to the output's exposed Brightness. That is the same
program `irRemoteWorkflow.test.ts` asserts.

| Fixture | Generator | What it proves |
| --- | --- | --- |
| `normal` | `generateCpp` | One `IrReceiver.decode()` in a live-graph sketch |
| `slideshow` | `generateShowSketch` | The same poll inside the pattern-show controller |
| `player` | `buildShowPlayer` | The SD player, routed through Control Map, alongside ESP32-audioI2S |
| `no-ir` | `generateCpp` | A sketch with no receiver does not pull in IRremote. The generator refuses to write the fixture set if it contains the include. |

## Reproduce

From the repository root:

```powershell
npm run gen:ir-compile-fixtures
python scripts/compile-ir-smoke.py arduino-cli backend/sketches/ir-remote-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32
python scripts/compile-ir-smoke.py fbuild backend/sketches/ir-remote-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32
```

The runner compiles through the helper's own `_compile_upload` or
`_compile_upload_fbuild` path and never flashes. It writes
`<fixture>.<engine>.<tag>.log` and a `.json` report beside the sketch. The
report holds the source SHA-256, the toolchain, the pinned IRremote version and
the flash/RAM figures. `backend/sketches/` is gitignored, so the tables below
are the durable record.

## Matrix, 22–23 September 2026

Toolchains: arduino-cli 1.5.1 and fbuild 2.5.26. Both engines used IRremote
4.7.1: arduino-cli from its library install, fbuild from its vendored `v4.7.1`
checkout (`498dc591`). FastLED 3.10.5 was used under arduino-cli.

Source hashes: `normal` `aaf9974c`, `slideshow` `1cc80143`, `player`
`fc892707`, `no-ir` `401d7057`.

| Fixture | Target (FQBN) | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- | --- |
| normal | `esp32:esp32:esp32` (core 3.3.11) | arduino-cli | pass | 406,407 | 28,732 |
| normal | `esp32:esp32:esp32` | fbuild | pass | 623,155 | 28,631 |
| slideshow | `esp32:esp32:esp32` | arduino-cli | pass | 412,291 | 28,928 |
| slideshow | `esp32:esp32:esp32` | fbuild | pass | 629,924 | 28,826 |
| player | `esp32:esp32:esp32` | arduino-cli | pass | 1,094,367 | 45,712 |
| player | `esp32:esp32:esp32` | fbuild | pass | 1,289,748 | 42,895 |
| no-ir | `esp32:esp32:esp32` | arduino-cli | pass | 391,091 | 27,668 |
| no-ir | `esp32:esp32:esp32` | fbuild | pass | 603,791 | 27,576 |
| normal | `arduino:avr:uno` (1.8.8) | arduino-cli | pass | 8,744 | 978 |
| normal | `arduino:avr:uno` | fbuild | pass | 8,765 | 985 |
| normal | `arduino:megaavr:nona4809` (1.8.8) | arduino-cli | pass | 9,930 | 1,461 |
| normal | `arduino:megaavr:nona4809` | fbuild | pass | 9,882 | 1,464 |
| normal | `esp8266:esp8266:nodemcuv2` (3.1.2) | arduino-cli | pass | 241,520 | 29,984 |
| normal | `esp8266:esp8266:nodemcuv2` | fbuild | pass | 270,961 | 29,112 |
| normal | `rp2040:rp2040:rpipico` (6.1.0) | arduino-cli | pass | 71,308 | 11,328 |
| normal | `rp2040:rp2040:rpipico` | fbuild | **fail** (fbuild boot2, see below) | — | — |
| normal | `arduino:renesas_uno:unor4wifi` (1.6.0) | arduino-cli | pass | 59,056 | 8,592 |
| normal | `adafruit:samd:adafruit_feather_m0` (1.7.17) | arduino-cli | pass | 53,568 | not reported |
| normal | `teensy:avr:teensy41` (1.62.0) | arduino-cli | pass | not reported | not reported |
| normal | `teensy:avr:teensy41` | fbuild | pass | 74,752 | 83,292 |
| normal | `STMicroelectronics:stm32:blackpill_f411ce` | fbuild | pass | 35,584 | 5,202 |
| normal | `STMicroelectronics:stm32:blackpill_f411ce` | arduino-cli | not buildable (no `pnum`, see above) | — | — |
| normal | `arduino:renesas_uno:unor4wifi` | fbuild | **fail** (fbuild's Renesas core, see below) | — | — |
| normal | `adafruit:samd:adafruit_feather_m0` | fbuild | **fail** (SAMD21 unsupported under fbuild, see below) | — | — |
| no-ir | `adafruit:samd:adafruit_feather_m0` | fbuild | **fail** (same, without IR) | — | — |

On classic ESP32, the IR receiver adds 15,316 bytes of flash and 1,064 bytes of
RAM under arduino-cli (`normal` minus `no-ir`). Part of that difference is the
Trigger and Step Value the IR graph also carries.

## Findings

- **IRremote must be included before `Audio.h`.** ESP32-audioI2S declares
  `using namespace std` in its public header. After that, IRremote 4.7.1's
  global `void_t` alias collides with `std::void_t`, and its `has_ull_print`
  specialization becomes ambiguous. The player generator now emits graph
  includes ahead of `Audio.h` (`5724bfc8`), and `irRemoteGenerators.test.ts`
  asserts that order. No upstream library is patched.
- **Nano Every had no fbuild board.** Arduino names the target `nona4809`, but
  PlatformIO calls it `nano_every`. The helper's `_PIO_BOARDS` entry now maps
  the one to the other (`99d93fc9`).
- **fbuild cannot build any RP2040 sketch here.** It stops while assembling
  the core's `boot2_w25q080_2_padded_checksum.S` with
  `<command-line>: error: macro names must be identifiers`, before it reaches
  any sketch code. That points to a malformed `-D` on the assembler command
  line inside fbuild. Arduino CLI builds the same source. This should go to
  fbuild upstream and is not a Studio change.
- **fbuild's Renesas core does not compile.** fbuild fetches
  ArduinoCore-renesas 1.2.2, whose own `api/IPAddress.cpp` uses `memset` and
  `strlen` without including `<cstring>`. It fails in seconds, before the
  sketch. Arduino CLI uses core 1.6.0 and passes. This is an fbuild upstream
  issue.
- **SAMD21 does not build under fbuild at all, IR or not.** fbuild's
  `atmelsam` adapter omits `ARDUINO_ARCH_SAMD`, the same defect the SAMD51
  entries in `_PIO_BOARDS` work around. On a SAMD21, FastLED then does not
  recognise its platform: the no-IR fixture fails in `fl/system/pin.cpp.hpp`,
  and the IR fixture stops at IRremote's "no timer functions implemented".
  Restating `-DARDUINO_ARCH_SAMD` and `-DFASTLED_FORCE_SOFTWARE_SPI=1`, as the
  SAMD51 entries do, gets through compilation. The link then fails with
  `multiple definition of 'EIC_Handler'` between FastLED's SAMD interrupt code
  and the core's `WInterrupts.c`, because fbuild links core objects directly
  where Arduino CLI links an archive. Those flags were not kept, because they
  would trade one failure for another. The attempt did expose a real helper
  defect: `_patch_fastled_samd51_build` renamed `EIC_IRQn` to the SAMD51-only
  `EIC_0_IRQn` in the tree SAMD21 shares. That is fixed (`16427810`).

## Outstanding

- The fbuild legs for RP2040, Renesas and SAMD21, each after its fbuild fix.
- STM32 on Arduino CLI, once the app gives STM32 boards a `pnum`.
- Architectures the pinned release declares that Studio has no board profile
  for (`mbed`, `mbed_nano`, `mbed_rp2040`, `riscv`, `nrf5`, `stm32f1`) are
  accepted by validation but not compiled here.
