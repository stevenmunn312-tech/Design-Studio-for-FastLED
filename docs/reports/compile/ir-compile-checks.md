# IR remote firmware compile checks

> **Status: complete, except where fbuild itself is blocked.** Every board
> family IR claims has at least one passing engine. Three fbuild legs cannot
> run because fbuild fails on a board core before it reaches IR code: RP2040,
> Renesas, and SAMD21. STM32 builds on both engines since 8 October 2026,
> when the helper began giving arduino-cli the STM32duino board and `pnum`
> ([STM32 on Arduino CLI](#stm32-on-arduino-cli-8-october-2026)). This file
> is the evidence for D-05a step 13 in [todo.md](../../../todo.md), closed
> 2026-09-23 with the fbuild legs below left to upstream fixes. Every fbuild leg
> was rechecked on fbuild 2.5.37 on 8 October 2026; the same three still fail
> ([fbuild 2.5.37 recheck](#fbuild-2537-recheck-8-october-2026)). It is compile evidence only, so every IR
> combination stays experimental in the
> [beta support matrix](../../release/beta-support-matrix.md) until a bench row
> exists.

The fixtures come from real graphs. They are not hand-written sketches. Each IR
fixture wires four learned NEC keys through one receiver on GPIO 12: Power goes
through a Trigger toggle to LED-output Enabled, and Brightness Up/Down/Reset go
through a Step Value to the output's exposed Brightness. That is the same
program `irRemoteWorkflow.test.ts` asserts.

| Fixture | Generator | What it proves |
| --- | --- | --- |
| `normal` | `generateCpp` | One `FLS_IR_RECEIVER.decode()` in a live-graph sketch |
| `slideshow` | `generateShowSketch` | The same poll inside the pattern-show controller |
| `player` | `buildShowPlayer` | The SD player, routed through Control Map, alongside ESP32-audioI2S |
| `learn` | `generateIrLearnSketch` | Temporary learner with every saved protocol decoder enabled |
| `no-ir` | `generateCpp` | A sketch with no receiver does not pull in IRremote. The generator refuses to write the fixture set if it contains the include. |

## Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- ir
python scripts/compile-fixtures/compile-ir-smoke.py arduino-cli backend/sketches/ir-remote-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32
python scripts/compile-fixtures/compile-ir-smoke.py fbuild backend/sketches/ir-remote-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32
```

The runner compiles through the helper's own `_compile_upload` or
`_compile_upload_fbuild` path and never flashes. It writes
`<fixture>.<engine>.<tag>.log` and a `.json` report beside the sketch. The
report holds the source SHA-256, the toolchain, the pinned IRremote version and
the flash/RAM figures. `backend/sketches/` is gitignored, so the tables below
are the durable record.

## fbuild 2.5.37 recheck, 8 October 2026

All seventeen fbuild legs ran in one `compile-matrix.py` run on fbuild 2.5.37,
after the pin moved from 2.5.26. Every leg that passed on 2.5.26 passes. RP2040,
Renesas and SAMD21 fail as before, for the reasons in [Findings](#findings).
The sources changed since the tables below for every fixture except `no-ir`
(the noise-tolerant repeat handling of 4 October), so most size differences
are not fbuild's.

| Fixture | Target (FQBN) | Source SHA-256 | Result | Flash | RAM | Δ flash | Δ RAM |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| normal | `esp32:esp32:esp32s3` | `a59d39f138aa` | pass | 726,231 | 80,681 | +1,024 | +297 |
| slideshow | `esp32:esp32:esp32s3` | `6510b10fb7e7` | pass | 732,119 | 81,009 | +1,055 | +297 |
| player | `esp32:esp32:esp32s3` | `e7b9ff4658d6` | pass | 1,363,149 | 95,498 | +0 | +41 |
| learn | `esp32:esp32:esp32s3` | `a2c93b554e87` | pass | 383,416 | 74,312 | −229,694 | −962 |
| normal | `esp32:esp32:esp32` | `a59d39f138aa` | pass | 623,350 | 28,652 | +195 | +21 |
| slideshow | `esp32:esp32:esp32` | `6510b10fb7e7` | pass | 630,149 | 28,846 | +225 | +20 |
| player | `esp32:esp32:esp32` | `e7b9ff4658d6` | pass | 1,289,748 | 43,018 | +0 | +123 |
| no-ir | `esp32:esp32:esp32` | `401d7057dea5` | pass | 603,791 | 27,576 | +0 | +0 |
| normal | `arduino:avr:uno` | `a59d39f138aa` | pass | 9,001 | 999 | +236 | +14 |
| normal | `arduino:megaavr:nona4809` | `a59d39f138aa` | pass | 10,117 | 1,475 | +235 | +11 |
| normal | `esp8266:esp8266:nodemcuv2` | `a59d39f138aa` | pass | 271,155 | 29,133 | +194 | +21 |
| normal | `teensy:avr:teensy41` | `a59d39f138aa` | pass | 74,752 | 83,292 | +0 | +0 |
| normal | `STMicroelectronics:stm32:blackpill_f411ce` | `a59d39f138aa` | pass | 35,717 | 5,222 | +133 | +20 |
| normal | `rp2040:rp2040:rpipico` | `a59d39f138aa` | **fail** (as before) | — | — | | |
| normal | `arduino:renesas_uno:unor4wifi` | `a59d39f138aa` | **fail** (as before) | — | — | | |
| normal | `adafruit:samd:adafruit_feather_m0` | `a59d39f138aa` | **fail** (as before) | — | — | | |
| no-ir | `adafruit:samd:adafruit_feather_m0` | `401d7057dea5` | **fail** (as before) | — | — | | |

Deltas are against each leg's previous fbuild 2.5.26 report. `no-ir`, with an
unchanged source, is byte-identical. The `learn` sketch is 229,694 bytes
smaller. The display record's `isolated-tft`, whose Arduino CLI build did not
change, shrank by a similar 230,041 bytes on fbuild 2.5.37, so the drop is
almost certainly fbuild's.

## STM32 on Arduino CLI, 8 October 2026

The app names STM32 boards by their PlatformIO ids, which STM32duino does not
have. `_arduino_fqbn` in `backend/toolchain.py` now hands arduino-cli the
series board and chip instead, from `_PIO_BOARDS`, so
`STMicroelectronics:stm32:blackpill_f411ce` builds as
`STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F411CE`. The leg runs in
`compile-matrix.py` (`--only @stm32`).

| Fixture | Target (FQBN) | Core | Source SHA-256 | Result | Flash | RAM |
| --- | --- | --- | --- | --- | ---: | ---: |
| normal | `STMicroelectronics:stm32:blackpill_f411ce` | 2.12.0 | `a59d39f138aa` | pass | 25,428 / 524,288 (4%) | 3,716 / 131,072 (2%) |

Toolchain: arduino-cli 1.5.1. The same source is 35,717 bytes of flash on
fbuild 2.5.37, which builds a different core release.

## Mbed Nano boards on Arduino CLI, 8 October 2026

Studio offers two boards on Arduino's Mbed core, the Nano 33 BLE and the Nano
RP2040 Connect. With `arduino:mbed_nano` 4.6.0 installed, neither builds the
IR fixture, and neither builds `no-ir` either: both stop inside FastLED 3.10.5
before reaching any IR code.

| Fixture | Target (FQBN) | Result | First error |
| --- | --- | --- | --- |
| normal, no-ir | `arduino:mbed_nano:nano33ble` | **fail** | `clockless_arm_nrf52.h:119`: `'configMAX_SYSCALL_INTERRUPT_PRIORITY' was not declared` |
| normal, no-ir | `arduino:mbed_nano:nanorp2040connect` | **fail** | `clockless_rp_pio_parallel.h:182`: no declaration of `gpio_init` |

FastLED's nRF52 driver is written against the Adafruit nRF52 core: it takes
an interrupt priority from that core's FreeRTOS configuration and uses nrfx
calls newer than the SDK 15 copy the Mbed core ships. Defining the missing
priority in the sketch only moves the failure to the next missing names
(`nrf_gpiote_event_t`, `nrf_timer_cc_set`), and the sketch's defines do not
reach FastLED's own compilation units anyway. The RP2040 driver likewise
expects the Pico SDK's GPIO API, which the Mbed core does not expose to it.
Neither is something a generated sketch can work around; both need FastLED
to support the Mbed core. The two legs run in `compile-matrix.py` as expected
failures so a FastLED that fixes them shows up as `NOW PASSES`.

## ESP32-S3 capture, 3 October 2026

Noise/repeat regression (4 October 2026): a live trace of the user's S3 show
received repeats with zero queue drops, but 750–800 µs stop marks failed the
pinned decoder's strict NEC check. Subsequent short repeats inherited UNKNOWN,
and malformed captures also interrupted the hold. The adapter now retains
recognized identity within a 250 ms capture-time window and normalizes only
validated NEC-family repeat prefixes using the library's greater-range matcher.
Native tests cover stretched marks, trailing noise, recovery after UNKNOWN,
expiry, replacement by another key, and invalidation by a damaged full command.
The user's six-pattern show, instrumented with this adapter, compiles under
Arduino-ESP32 3.3.11 / FastLED 3.10.5 / IRremote 4.7.1 with its actual 16 MB/OPI
PSRAM settings: 485,215 bytes flash and 29,516 bytes static RAM. These figures
include diagnostic serial logging. On 5 October the user reported held brightness
working with the updated diagnostic after signal-wiring adjustments. The final
interface values and a successful serial trace were not recorded, so this is
user confirmation rather than a completed support-matrix bench row. The KS0026
signal divider remains specified in the Build Diagram; software tolerance does
not replace the required logic-level conversion.

Continuous-capture regression (4 October 2026): the S3 adapter now queues owned
timings and immediately re-arms in the ISR, so LED rendering cannot leave RX
stopped until decode. The native harness receives an initial frame and a short
repeat before any loop decode, checks their independent timings, and exercises
queue saturation/recovery. Both FastLED interrupt-priority variants pass. The
normal fixture compiles with Arduino-ESP32 3.3.11, arduino-cli 1.5.1 and IRremote
4.7.1: 439,319 bytes flash, 27,876 bytes static RAM; source SHA-256 starts
`3b075c24`. The four-frame queue also allocates roughly 1 KB at runtime.
The IRAM callback is defined outside the class to avoid Xtensa's literal-section
linker defect. Physical held-key confirmation in an LED project remains pending.

Held-repeat regression (4 October 2026): the normal ESP32-S3 fixture with
bounded repeat identity inheritance and a false pass between pulses compiles
with arduino-cli 1.5.1, IRremote 4.7.1: 439,243 bytes flash and 27,868 bytes RAM.
Source SHA-256 starts `0c0f989f`. `irRemoteCpp.test.ts` executes the emitted
scalar sample logic with NEC-to-NEC2 repeats and queued frames; the existing
native RMT harness still passes. Physical held-key testing remains necessary.

S3 now captures the demodulated signal with native RMT and feeds the pinned
IRremote decoders. These builds use arduino-cli 1.5.1 with Arduino-ESP32
3.3.11 and FastLED 3.10.5, or fbuild 2.5.26 with vendored FastLED 3.10.4.
Both engines use IRremote 4.7.1 (`498dc591` under fbuild). The native capture
API requires Arduino-ESP32 3.x / ESP-IDF 5 or newer.

Source hashes: `normal` `30143483`, `slideshow` `5d5dd6ce`, `player`
`6a43eab2`, `learn` `dfeed856`. The `no-ir` fixture remains `401d7057`.

| Fixture | Target (FQBN) | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- | --- |
| normal | `esp32:esp32:esp32s3` | arduino-cli | pass | 439,051 | 27,852 |
| normal | `esp32:esp32:esp32s3` | fbuild | pass | 725,207 | 80,384 |
| slideshow | `esp32:esp32:esp32s3` | arduino-cli | pass | 443,755 | 27,932 |
| slideshow | `esp32:esp32:esp32s3` | fbuild | pass | 731,064 | 80,712 |
| player | `esp32:esp32:esp32s3` | arduino-cli | pass | 1,085,259 | 43,300 |
| player | `esp32:esp32:esp32s3` | fbuild | pass | 1,363,149 | 95,457 |
| learn | `esp32:esp32:esp32s3` | arduino-cli | pass | 316,273 | 22,728 |
| learn | `esp32:esp32:esp32s3` | fbuild | pass | 613,110 | 75,274 |
| normal (timer-path regression) | `esp32:esp32:esp32` | arduino-cli | pass | 406,471 | 28,732 |

Use the same reproduction commands above with `--fqbn esp32:esp32:esp32s3`
and `--tag esp32s3-rmt`, substituting each fixture name. The emitted C++
capture adapter also has a native harness covering tick conversion, repeat
gaps measured at capture time, maximum-length 48-bit frames with leading
idle, and re-arming after empty, malformed, or truncated captures. This
evidence does not replace receiver/remote testing on a physical board.

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
| normal | `STMicroelectronics:stm32:blackpill_f411ce` | arduino-cli | not buildable then (no `pnum`; passes since 8 October, see below) | — | — |
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
- The Mbed Nano boards, once FastLED builds on Arduino's Mbed core.
- Architectures the pinned release declares that Studio offers no board on
  (`mbed`, `mbed_rp2040`, `riscv`, `nrf5`, `stm32f1`) are accepted by
  validation but not compiled here.
