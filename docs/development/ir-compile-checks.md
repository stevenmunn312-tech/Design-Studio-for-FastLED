# IR remote firmware compile checks

> **Status: partial.** Sixteen of seventeen recorded runs pass. The gaps are
> the fbuild half for RP2040 (an fbuild defect, below), SAMD, Renesas and
> Teensy, and both engines for STM32. This file is D-05a step 13's evidence in
> [todo.md](../../todo.md). It is compile evidence only, so every IR
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

## Outstanding

- fbuild legs for SAMD, Renesas and Teensy.
- STM32 (`STMicroelectronics:stm32:*`) on both engines. It is in
  `IR_REMOTE_SUPPORTED_ARCHITECTURES` but has not been compiled.
- The RP2040 fbuild leg, after the fbuild fix.
- Architectures the pinned release declares that Studio has no board profile
  for (`mbed`, `mbed_nano`, `mbed_rp2040`, `riscv`, `nrf5`, `stm32f1`) are
  accepted by validation but not compiled here.
