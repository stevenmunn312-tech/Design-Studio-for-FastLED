# Control graph compile checks

## D-01: Interval controls, 11 October 2026

The first D-01 slice adds Interval to template control graphs. Its period can
come from a supported scalar path, and one timer sample feeds every consumer.
Computed presses bypass contact debounce; physical buttons retain it. The
normal sketch's elapsed-millisecond timer and the music player's track-position
rendering clock are unchanged.

The initial fixtures share `src/test-utils/intervalControlFixture.ts` with the regression
tests. A Math node drives a 0.5-second Interval; its pulse drives LED Toggle
through Control Map and a Trigger toggle gates an SSD1306 display. A separate
physical button drives Brightness Down with 30 ms debounce. The player fixture
routes Control Map to Music Player; normal and slideshow fixtures route it to
the LED output. Fixture generation checks valid ports, pin conflicts and display
generator issues before writing a sketch.

### Reproduce

```powershell
python scripts/compile-fixtures/compile-matrix.py --only control-graph/
```

This generates fixtures with `scripts/compile-fixtures/control-graph.ts` and
compiles them serially through the helper's Arduino CLI path. No upload is
performed. Generated sources, SHA-256 manifest and per-fixture logs/reports are
under `artifacts/control-graph-compile/`; the recorded run summary is under
`artifacts/compile-matrix/2026-10-11_0453/`. The fixture generator now includes
the Time/Wave additions below, so regeneration replaces these initial sources
and reports. The matrix run retains its original summary and runner output.
These artifacts are regenerable and
gitignored.

### Results

Windows, Arduino CLI 1.5.1, ESP32 core 3.3.11, FastLED 3.10.5. The helper pins
player audio to 3.0.12. All three use
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.

| Fixture | Source SHA-256 prefix | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| Normal | `02878ac2e407` | Passed | 458,011 | 31,036 |
| Slideshow | `fde9194bcd8cf` | Passed | 462,683 | 31,116 |
| SD player | `b6802023f24a3` | Passed | 1,131,391 | 47,012 |

The focused regression run passes 725 tests across 12 files, including emitted
control order, normal/show/player generation, preview pulse cadence and property
fallbacks. TypeScript, production build and ESLint also pass. The production
build reports a circular chunk warning between `graph-runtime` and `node-catalog`.

These checks establish software support only. No hardware was flashed or timed.
Other time-dependent sources, nested groups, structured bindings and arbitrary
RTC sources remain open in
[D-01's implementation sequence](../../design/large-displays-and-control-routing.md#d-01-implementation).

## Time and Wave controls, 11 October 2026

The expanded fixtures add both Time outputs, a Wave with wired frequency and
phase, continuous brightness, and a wired Master Speed in normal/slideshow
builds. Slideshow controls and patterns share animation time; a newly resolved
speed applies on the next pass. Dwell and transitions continue to read elapsed
time. SD-player root controls read elapsed time, while its pattern renderer
continues to use track position. Time's `dt` remains the nominal 1/60 second.

Normal and template firmware share the oscillator and Time emitters. The
control graph reserves every emitted output symbol, including an unrequested
Time output, so sanitized node/port identifiers cannot silently collide.

The same command and toolchain apply. The expanded run is recorded under
`artifacts/compile-matrix/2026-10-11_0506/`.

| Fixture | Source SHA-256 prefix | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| Normal | `c6d3c605e42e` | Passed | 462,475 | 31,044 |
| Slideshow | `a3057080c343` | Passed | 467,175 | 31,124 |
| SD player | `0d91c96e1744` | Passed | 1,131,515 | 47,012 |

Each report's full source hash matches the expanded fixture manifest. All
three builds pass on Arduino CLI; fbuild remains on hold. No hardware was
flashed during either run.

The complete Vitest run passes 7,174 tests across 418 files, with 20 tests and
five files skipped. ESLint and the production build pass. The existing circular
chunk warning between `graph-runtime` and `node-catalog` remains. The full test
log is in the gitignored `tmp/d01-vitest.log`.

## Nested typed groups, 11 October 2026

The current fixtures wrap the timed scalar path in two groups. A root Math
value supplies Interval's period through both input boundaries. Pulse, level
and Enabled leave through distinct typed outputs; the pulse is shared by
Control Map and Trigger. A root button passes directly from a group input to
its output and retains the Control Map's 30 ms contact debounce. Master Speed
and the player's track-position rendering clock retain the preceding slice's
contracts.

Normal firmware and show/player control routing use the same boundary
expansion. Missing definitions, recursive definitions, boundary cycles,
identifier collisions and nested physical hardware are explicit errors.
Expanded dependencies retain the 256-node scalar limit. Unwired group inputs
leave each consumer's property fallback intact.

The same reproduce command and toolchain apply. The run is recorded under
`artifacts/compile-matrix/2026-10-11_1711/`. The generator replaces the prior
Time/Wave sources and reports; earlier matrix summaries retain their evidence.

| Fixture | Source SHA-256 prefix | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| Normal | `756176c2a874` | Passed | 462,479 | 31,044 |
| Slideshow | `91dafa0efb66` | Passed | 467,175 | 31,124 |
| SD player | `724950573b51` | Passed | 1,131,515 | 47,012 |

Each report's full source hash matches the nested fixture manifest. All three
builds pass on Arduino CLI; fbuild remains on hold. No hardware was flashed.

The full Vitest run passes 7,189 tests across 419 files, with 20 tests and five
files skipped (`tmp/d01-nested-tests-final.log`). A subsequent cadence fix
explicitly includes authored Group Output terminals in hot evaluation: its
15 focused tests pass, as do all 36 deploy-popup tests after adding the stale
group guard. ESLint and the production build pass; the existing circular chunk
warning remains.

## Colour, pattern selection and LED status, 11 October 2026

Show and player control graphs now resolve a wired Colour Swatch from a
self-contained colour node, a Pattern Browser from the running engine's
pattern selection, and LED status from an output that template drives. The
colour stays a `CRGB` until the swatch binding packs it. Palette, image and
harmony colours, a pattern selection from any other node, and an output the
template does not drive still fail explicitly. A show latches status with the
pixels. A player reports the driven output's manual settings and does not fold
in master brightness. `CRGB` helpers used only by the control graph are
prototyped after `#include <FastLED.h>`.

The fixtures add the LED output's Display wire to the shared OLED. Show and
player also mount a write-only ST7789 on GPIO 17, 18, 6, 7, 21 and 1. Its
Colour Swatch is a Color Temperature sampled through an hsv-long gradient, so
the sketch compiles both `kelvinToRGB` and `_hueMix`, and its Pattern Browser
reads the running engine. Those pins stay off the LED data, button, OLED, SD
bus and amplifier.

The same reproduce command and toolchain apply. The run is recorded under
`artifacts/compile-matrix/2026-10-11_1837/`. The generator replaces the prior
nested-group sources and reports; earlier matrix summaries retain their
evidence. The sources are the working tree on top of `afed897b`.

Windows, Arduino CLI 1.5.1, ESP32 core 3.3.11, FastLED 3.10.5, LVGL 9.5.0.
The helper pins player audio to 3.0.12. All three use
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.

| Fixture | Source SHA-256 prefix | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| Normal | `bc0e0ff42953` | Passed | 462,799 | 31,044 |
| Slideshow | `2caff19dc519` | Passed | 637,439 | 41,676 |
| SD player | `1ecee7dc95a9` | Passed | 1,301,995 | 57,572 |

Each report's full source hash matches the fixture manifest. All three builds
pass on Arduino CLI; fbuild remains on hold. No hardware was flashed. The
slideshow and player growth is the added ST7789 and LVGL screen.

The full Vitest run passes 7,197 tests across 419 files, with 20 tests and five
files skipped. ESLint and the production build pass. The existing circular
chunk warning between `graph-runtime` and `node-catalog` remains. Arbitrary
RTC sources remain open in
[D-01's implementation sequence](../../design/large-displays-and-control-routing.md#d-01-implementation).

## Local clocks and a wired RTC, 11 October 2026

Show and player control graphs now share the normal emitters for Clock,
Envelope, BeatSin, Noise LFO, Counter and Schedule Trigger. Those nodes keep
wall-clock `millis()` and their existing static state, so Master Speed does
not scale them and the player's track-position clock stays its own clock.
Complex Wave, Random and DMX Channel still fail explicitly.

A wired RTC Clock is the source. Compile Time, Manual and DS3231 emit through
the normal sketch's RTC loop. Scalar ports are ordinary control outputs.
Displays read the date-time value from the Display edge's source. NTP fails
before resolve: a scalar wire is a control-graph error, and a Display wire
stays unresolved with the panel left blank. Networking in these generators
stays with D-03. The first emitted DS3231 calls `_rtcHandleSerialSet()` once
per loop and does not add a second `Serial.begin`. `RTC_CPP_FORWARD` is
emitted after `#include <FastLED.h>` when a helper contains
`struct _RtcDateTime {`.

The fixtures add a Compile Time RTC, a Clock reset by the root button, a
Schedule Trigger enabled by that Clock's beat, and a TM1637 Clock layout on
GPIO 2 and 3. Normal and slideshow builds gate the LED output from the
schedule. The player gates the colour panel. Compile Time stays off the OLED's
I2C bus.

The same reproduce command and toolchain apply. The run is recorded under
`artifacts/compile-matrix/2026-10-11_1950/`. The generator replaces the prior
colour-binding sources and reports; earlier matrix summaries retain their
evidence. The sources are the working tree on top of `5eba62da`.

Windows, Arduino CLI 1.5.1, ESP32 core 3.3.11, FastLED 3.10.5, LVGL 9.5.0.
The helper pins player audio to 3.0.12. All three use
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.

| Fixture | Source SHA-256 prefix | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| Normal | `02c0daa6d9fc` | Passed | 465,335 | 31,108 |
| Slideshow | `8f27f22f2873` | Passed | 639,823 | 41,740 |
| SD player | `234106a4c301` | Passed | 1,305,707 | 57,636 |

Each report's full source hash matches the fixture manifest. All three builds
pass on Arduino CLI; fbuild remains on hold. No hardware was flashed.

The full Vitest run passes 7,215 tests across 420 files, with 20 tests and five
files skipped. ESLint and the production build pass. The existing circular
chunk warning between `graph-runtime` and `node-catalog` remains, and the
build warns that the index chunk is 755.7 KiB. This closes the listed D-01
sequence. NTP in show and player sketches followed as D-03, below.

## D-03: NTP in show and player sketches, 13 October 2026

An NTP RTC Clock now builds into the generative show and the SD player. The
network bootstrap moved out of `cppGenerator.ts` into
`src/codegen/peripherals/networkCpp.ts`, which the normal sketch and the
control graph share: the platform headers as one block, the
`_netEnsureConnected()`/`_netConnected()` bootstrap over Wi-Fi, a W5500 module
or a board's own Ethernet, and the wired setup line. An NTP `RTCInput`'s
control-graph emission carries those three pieces, so `controlGraph.ts` no
longer refuses NTP, `clockFor` resolves an NTP clock like any other, and the
"NTP clock" display warning is gone. Two NTP clocks in one graph emit identical
blocks and the control graph's dedupe leaves one bootstrap. Art-Net in these
sketches is unchanged and still outside their scope.

The fixture generator gained three variants of the D-01 clock chain above, all
with the same Schedule Trigger, TM1637 Clock layout and custom panel: `show-ntp`
and `player-ntp` sync over Wi-Fi with credentials seeded into the browser-local
store the way the app does, and `show-ethernet` adds a WIZ850io on the S3's
HSPI pins (SCK 12, MOSI 11, MISO 13, CS 10, INT 14, RST 15). The generator
checks that each NTP sketch defines `_netEnsureConnected()` exactly once, that
the wired variant alone emits `ETH.begin(ETH_PHY_W5500, ...)` and starts the
link in `setup()`, and that the Compile Time sketches emit no network code.

The same reproduce command and toolchain apply; the plan now lists the six
control-graph fixtures. The three new sketches were compiled serially through
`compile-display-smoke.py` on 13 October 2026. The sources are the working tree
on top of `1375d4d5`.

Windows, Arduino CLI 1.5.1, ESP32 core 3.3.11, FastLED 3.10.5, LVGL 9.5.0.
The helper pins player audio to 3.0.12. All three use
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.

| Fixture | Source SHA-256 prefix | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| Slideshow, NTP over Wi-Fi | `6e6ffa4362a4` | Passed | 1,227,051 | 64,060 |
| SD player, NTP over Wi-Fi | `427d7123aa7e` | Passed | 1,716,447 | 74,036 |
| Slideshow, NTP over WIZ850io | `feb73870a9a8` | Passed | 890,911 | 48,452 |

Each report's full source hash matches the fixture manifest. The wired build is
smaller than the Wi-Fi one because nothing in it references `WiFi.begin`, so
the station driver is not linked. All three pass on Arduino CLI; fbuild remains
on hold. No hardware was flashed; the bench row is in the root todo, HW-13.

The full Vitest run passes 7,364 tests across 426 files, with 20 tests and five
files skipped. ESLint and the production build pass. This closes the v1 part of
[D-03](../../design/rtc-clock-and-schedule.md#time-sources-software-clock-optional-ntp-or-a-ds3231).
