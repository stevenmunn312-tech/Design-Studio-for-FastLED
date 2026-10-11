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
