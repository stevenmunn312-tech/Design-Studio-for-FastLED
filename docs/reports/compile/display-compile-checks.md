# Display firmware compile checks

> **Latest work:** see [ILI9341 and shared SPI, 8 October 2026](#ili9341-and-shared-spi-8-october-2026).
> The earlier nineteen-fixture baseline passed on Arduino
> CLI on 8 October 2026, and the twelve-fixture fbuild half passed on fbuild
> 2.5.37, at matching source hashes and with LVGL's pool taken from the heap; see
> [Current-model matrix, 8 October 2026](#current-model-matrix-8-october-2026).
> The sections after it are earlier, dated runs: the
> [21–22 September matrix](#current-model-matrix-21-22-september-2026), the
> [template level-control gates](#template-level-control-gates-26-september-2026)
> and [captions and Starts at](#captions-and-starts-at-7-october-2026).
>
> Earlier runs are not reproduced here. They were built from sketches that no
> longer regenerate, so their sizes cannot be tied to anything in the tree and
> their hashes cannot be checked. What was durable about them — the toolchain
> defects they exposed — is in [Findings](#findings), which is cumulative; the
> tables themselves are in Git history.


These fixtures exercise custom LVGL displays alongside the fixed TFT transport
renderer in the normal sketch, generative show, and SD-player generators. Each
includes a slider, button, toggle, dial, readouts, meters, a status indicator and
a two-byte A8 icon. Slider data passes through Math and Format Number to both
screens and through Control Map to the output/player. The SD player also
publishes track time and progress and compiles a collected Solid Color pattern.

The three generator fixtures also bind widgets to the source wired into their
panel, which is what puts the binding path into a compiled sketch rather than
only into a unit test. Each binds a string, a `set` role and a float, so a role
that is not `value` is covered too — a Toggle shows its reading on `set`. What
each build can answer differs, and the fixtures follow that: a normal sketch
resolves the clock through `_rtcClockText`, the show resolves a pattern name
through `_patNameStr_show` and the flash table that turns on with it, and the
player resolves the track through `songTitle`. The generator asserts those exact
expressions, so a later regeneration cannot quietly drop them and leave the
matrix compiling an unbound screen.

This is compile evidence, not a physical wiring or touch-layout example. It does
not establish display refresh speed, touch accuracy, heap headroom, SPI
coexistence, audio continuity, or support for other board families. Support-matrix
promotion still requires physical tests.

## Reproduce

From the repository root, with npm dependencies and the Python helper dependencies
installed:

```powershell
npm run gen:compile-fixtures -- display
```

To regenerate and compile every fixture below on both engines, one at a time,
with a summary:

```powershell
python scripts/compile-fixtures/compile-matrix.py --engine all --only display/
```

The three generator paths, on both engines:

```powershell
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/display-compile/normal.ino
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/display-compile/show.ino
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/display-compile/player.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/normal.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/show.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/player.ino
```

The focused template level-control fixtures. Run one command to completion
before starting the next; the recorded 26 September check used Arduino CLI:

```powershell
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/display-compile/template-led.ino
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/display-compile/template-player.ino
```

The captioned classic-ESP32 fixture, which needs the classic FQBN and tag:

```powershell
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/display-compile/classic-caption-level.ino --fqbn esp32:esp32:esp32 --tag classic
```

The shapes that have no generator of their own but fail in their own ways —
a TFT with no LED output beside it, a control build with no display half, a
panel switched off, two panels each showing their own design, and every
catalogued module in as few sketches as their buses and I²C addresses allow.
The commands below show fbuild; repeat them with `arduino-cli` as the engine to
reproduce the other half of the current matrix:

```powershell
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/isolated-tft.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/headless.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/disabled.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/multi-panel.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/part-families.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/part-families-i2c.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/part-parallel.ino
```

There is no fixture for a design on two panels or on none. Those shapes were
compiled once, while they were still expressible; a panel owns its design now, so
neither can be built in the app to be generated from.

The bench instrument, which is the normal graph with the Board's telemetry
property on:

```powershell
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/display-compile/telemetry.ino
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/telemetry.ino
```

The other advertised board. A classic ESP32 is a different chip family with no
PSRAM and a much smaller internal RAM ceiling. This fixture carries the fixed
display layouts only; classic-ESP32 custom screens are covered by the CYD and
`classic-caption-level` fixtures, since HW-25 showed the LVGL heap fits there.
Pass its FQBN and a `--tag`, which keeps the report beside the S3 one instead
of overwriting it:

```powershell
python scripts/compile-fixtures/compile-display-smoke.py arduino-cli artifacts/display-compile/classic-esp32-fixed.ino --fqbn esp32:esp32:esp32 --tag classic
python scripts/compile-fixtures/compile-display-smoke.py fbuild artifacts/display-compile/classic-esp32-fixed.ino --fqbn esp32:esp32:esp32 --tag classic
```

Generation uses empty in-memory browser storage and opens no browser. Compilation
uses the helper's normal configuration/dependency staging and passes an empty
serial port, so it never flashes a device. Each invocation writes a complete log
and a JSON size/result report beside its input sketch. These local artifacts are
ignored by Git. Each command exits nonzero on a failed build.

The default target is ESP32-S3 with OPI PSRAM, 16 MB flash and a 3 MB application
partition. Those fixtures select the generic N16R8 44-pin board profile and the
ST7789V/XPT2046 240×320 module; the classic-ESP32 fixture selects the generic
38-pin DevKit and needs its own `--fqbn` as shown above. Each board gets its own
arduino-cli workspace, keyed on the FQBN's board id, because arduino-cli caches
per sketch *path* — one shared directory would have each board evicting the
other's cores and rebuilding all of FastLED. The helper
installs LVGL 9.5.0 lazily; Arduino must already have the ESP32 core and FastLED
installed. Both engines fetch their own pinned player audio dependency when
needed. Git and network access are required for uncached dependencies.

The generator refuses to write a fixture set that would waste a compile. It
asserts the binding symbols each sketch must contain, that every module offered
by a part menu is compiled by some fixture — derived from the catalogue, so a
display imported tomorrow fails here until it has been built once — and that no
fixture wires two parts to one pin. That last check found two live defects in
this set when it was added: a panel whose chip select shared the SD card's, and
an OLED reset sitting on the LED data pin.

## Findings

The initial runs exposed these gaps, now covered by regression tests:

- FQBNs containing several comma-separated menu options lost their PSRAM mode
  when mapped to fbuild. The parser now reads the `PSRAM` option by name.
- fbuild's compile-only SD-player path did not fetch the audio library on a fresh
  installation. Audio staging now belongs to the shared compile path, inside
  the build lock, just like LVGL staging.
- Both compilers rejected normal sketches with widget → Math → formatted
  readout wiring on the same display. The normal generator now derives ports
  from the document, samples all widget outputs before graph evaluation and
  publishes inputs afterward. Native output passes share the same snapshot.
- The generic SD player emitted a silence fade even for collections with no
  audio analysis, referencing undeclared band levels. The fade now requires
  baked or live analysis; nonreactive patterns remain visible without it.
- The LVGL archive command in fbuild 2.5.22 and 2.5.26 exceeded Windows'
  command-length limit.
  The helper recognizes that specific failure, validates the archiver and every
  object path, archives the same objects through a response file, then retries
  fbuild once to finish linking and produce its normal size report. It does not
  trim or replace LVGL sources. The upstream call is in
  [archive_objects at v2.5.22](https://github.com/FastLED/fbuild/blob/v2.5.22/crates/fbuild-library/src/library/library_compiler.rs#L667).
- fbuild's daemon dropped its connection mid-build on one run
  (`daemon error: lost connection to daemon mid-build`) after four hours with
  nothing compiled, on a sketch the other engine built in under two minutes. A
  rerun of the identical source passed in 5m 23s. Not reproduced, not written up
  upstream yet; the daemon log at `~/.fbuild/prod/daemon/daemon.log` is where the
  evidence lives.
- The generated LVGL code composes style selectors as `LV_PART_x | LV_STATE_y`,
  which LVGL 9.5 deprecates between those two enum types. Sixty-six warnings per
  custom-screen sketch under fbuild; invisible under Arduino CLI, which compiles
  with `-w`. Harmless today, an error if the deprecation is promoted.
- Arduino selected an older user-installed ESP32 audio library whose AAC
  decoder does not compile with this toolchain's `int32_t` definitions. The
  helper now passes a private, pinned 3.0.12 library via `--library`, leaving
  the user's global Arduino libraries unchanged. Incomplete downloads have no
  completion marker and are retried. A version comment in the helper's sketch
  also invalidates Arduino's cached caller object when the audio API changes;
  identical rebuilds retain their source mtime and library cache.
- The smoke generator still took widget outputs from the panel after those
  ports moved to the paired Touch node. `scripts/compile-fixtures/display.ts` then
  refused the show sketch. The fixtures mint a `TouchInput` per touch
  panel; `assertWireable` holds the cables to what the editor can draw.

## ILI9341 and shared SPI, 8 October 2026

The DFRobot DFR0665 SPI breakout is now offered as
`ili9341-xpt2046-touch-320x240`. Its descriptor uses native 240x320 geometry;
Landscape produces 320x240. The ILI9341 MADCTL table matches the
[Adafruit driver](https://github.com/adafruit/Adafruit_ILI9341/blob/master/Adafruit_ILI9341.cpp).
The [module reference](https://wiki.dfrobot.com/dfr0665/) identifies its
shared SPI header and XPT2046 touch controller.

The new fixtures use SCK 12, MOSI 11, MISO 13, panel CS 14, touch CS 6 and
IRQ 5. The player and SD Video add card CS 10 on that same bus. Hidden
separate-touch properties deliberately name different pins; generated firmware
must use the module's actual shared header. A 320x240 LED Performance screen
covers normal and slideshow LVGL paths, and Minimal Transport covers the player.

`spiBusCpp.ts` lets a reader add MISO after a write-only panel without changing
SCK/MOSI. Shared touch samples in a separate 2 MHz transaction and does not
reclaim the panel's SPI pins with `pinMode`. CYD touch stays on its separate
software bus. Native C++ execution tests cover reader-first and panel-first
initialization, helper deduplication and transaction boundaries.

Arduino CLI only; fbuild remains on hold. These builds use ESP32-S3 with
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.
Logs and full source hashes are under `artifacts/ili9341-compile/`.

| Fixture | Source SHA-256 prefix | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| `ili9341-fixed` | `f20ea88b8459` | Passed | 437,883 | 27,756 |
| `ili9341-custom` | `20a2f959992f` | Passed | 619,763 | 42,060 |
| `ili9341-show` | `dd2291ec0f22` | Passed | 624,443 | 42,148 |
| `ili9341-player` | `c5fe1672c41e` | Passed | 1,327,015 | 57,748 |
| `ili9341-calibration` | `33a4996e30ab` | Passed | 314,788 | 22,840 |
| `ili9341-sd-video` | `98b09e08db39` | Passed | 488,263 | 28,004 |

The player hash is the sketch that emits the shared SPI helper after
`ShowEvent`. An earlier sketch put the helper above that struct, and Arduino
then compiled `applyEvent` before the type existed.

The C3 Ethernet and panel regression passed the same day on
`esp32:esp32:esp32c3`: source `7fd27a8e`, 722,694 flash bytes (22%) and
26,756 static RAM bytes (8%). Its report is under
`artifacts/ili9341-ethernet/`. See the
[Ethernet compile record](ethernet-compile-checks.md).

Reproduce the six new cases serially:

```powershell
python scripts/compile-fixtures/compile-matrix.py --only display/ili9341
```

These checks do not establish physical display orientation, colour order,
touch accuracy, SD coexistence or audio continuity. Both ILI9341 modules remain
experimental; unidentified integrated boards still need their controller and
fixed pins measured. Earlier matrix rows below describe their dated source hashes,
not a rerun of every display combination after this change.

## Current-model matrix, 8 October 2026

Every fixture passed: all nineteen on Arduino CLI, and the twelve-fixture fbuild
half on fbuild 2.5.37, each pair at the same source hash. The run used
`scripts/compile-fixtures/compile-matrix.py`, which regenerates the fixtures and
compiles them one at a time. Toolchains: Arduino CLI 1.5.1 with ESP32 core
3.3.11, FastLED 3.10.5, LVGL 9.5.0 and player audio 3.0.12; fbuild 2.5.37 with
its vendored FastLED, LVGL and player audio. Classic-ESP32 rows target
`esp32:esp32:esp32` (`@classic`, `@cyd`); the rest target the ESP32-S3 N16R8
FQBN above. Byte counts are comparable across engines; percentages are not.

| Fixture | Source SHA-256 | Arduino flash | Arduino RAM | fbuild flash | fbuild RAM |
| --- | --- | ---: | ---: | ---: | ---: |
| `normal` | `fb96e5ca5822` | 647,283 | 40,236 | 934,871 | 95,662 |
| `show` | `62462eeeb3c6` | 649,383 | 40,444 | 938,158 | 96,123 |
| `player` | `2bc21cf1713c` | 1,327,083 | 56,180 | 1,604,321 | 110,899 |
| `isolated-tft` | `e70f5afca18c` | 300,932 | 22,904 | 365,220 | 74,435 |
| `headless` | `88aa1b09ef70` | 427,151 | 27,636 | 710,922 | 80,691 |
| `disabled` | `1ce0d4108ea9` | 640,611 | 39,964 | 928,205 | 95,386 |
| `multi-panel` | `1ee69b337cd5` | 642,999 | 49,780 | 930,570 | 105,206 |
| `part-families` | `781dc1fef25a` | 472,403 | 37,660 | 761,129 | 94,106 |
| `part-families-i2c` | `ad3768ea7483` | 460,311 | 31,012 | 746,322 | 87,398 |
| `part-parallel` | `b1b57bdf89c0` | 440,071 | 27,860 | 726,333 | 83,456 |
| `telemetry` | `b159f465471a` | 651,731 | 40,284 | 939,059 | 95,703 |
| `classic-esp32-fixed@classic` | `58f09c6b0749` | 428,039 | 31,396 | 643,430 | 31,375 |
| `template-led` | `140bb3b04cb5` | 618,783 | 38,844 | not run | not run |
| `template-player` | `0e4d34530851` | 1,325,555 | 54,532 | not run | not run |
| `classic-caption-level@classic` | `5600eff0f1ab` | 599,655 | 38,700 | not run | not run |
| `cyd-run1@cyd` | `d6762d2f2acb` | 417,215 | 27,700 | not run | not run |
| `cyd-custom@cyd` | `42696f510807` | 615,931 | 39,868 | not run | not run |
| `cyd-custom-telemetry@cyd` | `13b4b9e5de37` | 631,099 | 39,940 | not run | not run |
| `cyd-run2@cyd` | `a5fdb9784a46` | 637,655 | 40,600 | not run | not run |

Against the previous report for each fixture:

- **Every custom-screen fixture with a previous report is about 64 KiB lower in
  static RAM** on both engines (65,474–65,888 bytes), because ESP32 builds now
  take LVGL's pool from the heap. Free heap after `lv_init()` should be
  unchanged; the CYD re-measure is owed (root todo, section 4).
- **Fixtures without a custom screen did not change:** `headless`,
  `part-families-i2c`, `part-parallel` and `classic-esp32-fixed` are
  byte-identical on both engines, `isolated-tft` on Arduino CLI, and
  `part-families` is 8 bytes smaller on Arduino CLI only.
- **fbuild 2.5.37 builds `isolated-tft` 230,041 bytes smaller** than 2.5.26 did
  (365,220 against 595,261), with RAM 983 bytes lower. The Arduino CLI build is
  byte-identical to September's, so the change is fbuild's. The cause was not
  isolated; 2.5.28 changed which framework libraries a build selects.
- fbuild still needed the helper's response-file recovery to archive LVGL on
  `normal`, `player` and `disabled`
  ([FastLED/fbuild#1656](https://github.com/FastLED/fbuild/issues/1656)).

## Captions and Starts at, 7 October 2026

`classic-caption-level` compiles on-glass captions and the slider level gate in
one sketch. It puts **LED Performance** on the ESP32-2432S028R's 240×320 panel,
a classic ESP32, with **Show Label** turned on for every slider and numeric
readout. A single Touch Controls wire drives the LED output. Before writing the
sketch, the generator checks four things in it: the Brightness and Frame rate
captions, Brightness's **Starts at** of full as both its initial value and its
slider position, and that Brightness is applied only inside its `taps > 0`
gate. The sketch also captions Speed.

It passed on Arduino CLI 1.5.1 with ESP32 core 3.3.11, FastLED 3.10.5 and
LVGL 9.5.0, targeting `esp32:esp32:esp32` with the helper's `huge_app`
partition setting. The runner then failed before writing its JSON report,
because of a defect since fixed in `003be694`. The result here comes from the
build log, whose compiled sketch matches the regenerated fixture byte for byte,
except for line endings.

| Fixture | Source SHA-256 | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| Captioned LED Performance → LED output | `d0e8f059fe36` | Passed | 599,531 (19%) | 104,236 (31%) |

This closes the compile half of the on-glass label checklist. Whether the
captions fit and read well on the panel still needs a photograph from a bench
run.

## Template level-control gates, 26 September 2026

Two focused fixtures compile the firmware path behind the template-control
journey. `template-led` places **LED Performance** on an LED output;
`template-player` places **Minimal Transport** on a Music Player. Both use the
single Touch Controls wire the app creates. The generator asserts that the
level field is assigned only inside the widget's `taps > 0` gate before either
sketch reaches the compiler.

The player fixture deliberately uses Minimal Transport rather than Now Playing:
Now Playing has Previous, Play and Next controls but no Volume widget. Minimal
Transport is the player template with an absolute Volume slider. Through the
single Controls wire, its generated bundle sets `hasVolume` after a touch and
the player applies that value to `playerVolume`; a separate wire to the Music
Player's Volume property input is not required for this graph shape.

Both fixtures passed on Arduino CLI 1.5.1 with ESP32 core 3.3.11, FastLED
3.10.5, LVGL 9.5.0 and the pinned player audio 3.0.12, targeting the default
ESP32-S3 N16R8 FQBN documented above. They were run serially, LED first. fbuild
was not run for these two fixtures in this check.

| Fixture | Source SHA-256 | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| LED Performance → LED output | `f60c932f75c0` | Passed | 618,671 (19%) | 104,380 (31%) |
| Minimal Transport → Music Player | `1fac44f17625` | Passed | 1,325,083 (42%) | 120,052 (36%) |

<a id="current-model-matrix-21-22-september-2026"></a>

## Matrix, 21–22 September 2026

All twelve fixtures passed on both engines at the matching source hashes shown
below. The Arduino CLI half was recorded first with Arduino CLI 1.5.1, ESP32
core 3.3.11, FastLED 3.10.5 and LVGL 9.5.0. The fixtures were regenerated and
the complete fbuild half was rerun on 22 September with fbuild 2.5.26, vendored
FastLED `e52abeb26d1b`, LVGL `85aa60d18b3d` and player audio `928c420d49fc`.
The first eleven rows target the ESP32-S3 N16R8 FQBN documented above; the last
targets `esp32:esp32:esp32`.

Percentages use each engine's own reported partition: Arduino CLI reports S3
flash against the 3 MiB application partition, while fbuild reports it against
the 16 MiB device. The byte counts, not the flash percentages, are comparable.

| Fixture | Source SHA-256 | Arduino flash | Arduino RAM | fbuild flash | fbuild RAM |
| --- | --- | ---: | ---: | ---: | ---: |
| Normal | `a16d8252b038` | 647,159 (20%) | 105,716 (32%) | 934,748 (6%) | 161,137 (49%) |
| Generative show | `45a34865db9e` | 649,555 (20%) | 106,164 (32%) | 938,322 (6%) | 161,833 (49%) |
| SD player | `b80c29c7caab` | 1,330,039 (42%) | 122,068 (37%) | 1,614,807 (10%) | 176,783 (54%) |
| Isolated TFT | `a5c3f529cbee` | 300,932 (9%) | 22,904 (6%) | 595,261 (4%) | 75,418 (23%) |
| Headless controls | `6fc1c5e68731` | 427,151 (13%) | 27,636 (8%) | 710,922 (4%) | 80,691 (25%) |
| Disabled panel | `5b4ed7271cd8` | 640,479 (20%) | 105,444 (32%) | 928,072 (6%) | 160,870 (49%) |
| Two panels, two designs | `fa6345d91c7d` | 642,859 (20%) | 115,260 (35%) | 930,427 (6%) | 170,680 (52%) |
| Part families (SPI) | `afce392a0b73` | 472,411 (15%) | 37,660 (11%) | 761,129 (4%) | 94,106 (29%) |
| Part families (I²C) | `3f833eec394d` | 460,311 (14%) | 31,012 (9%) | 746,322 (4%) | 87,398 (27%) |
| Part families (parallel) | `e2118c1e714b` | 440,071 (13%) | 27,860 (8%) | 726,333 (4%) | 83,456 (26%) |
| Bench telemetry | `fbe29416f82b` | 651,599 (20%) | 105,764 (32%) | 938,936 (6%) | 161,178 (49%) |
| Classic ESP32, fixed layouts | `3b786d2a38e2` | 428,039 (32%) | 31,396 (9%) | 643,430 (15%) | 31,375 (10%) |

The Arduino telemetry leg was an environmental timing outlier: about 51 minutes
end to end while its log continued to grow and sixteen compiler children stayed
active. It passed and no other fixture reproduced that duration, so it is kept as
a timing observation rather than treated as a firmware failure.

Against the earlier 2.5.22 run of the same hashes, 2.5.26 reduced flash by
25,518–37,274 bytes and static RAM by 62–164 bytes across all twelve fixtures.
The initial `normal` upgrade smoke still hit Windows `os error 206` while
archiving LVGL; the helper's response-file recovery took 1.2s and the retry
passed. An immediate unchanged rebuild then took 1.5s inside fbuild and 2.6s end
to end. In the complete matrix rerun, the SD-player and disabled-panel builds
also exercised the recovery, each completing the response-file archive in 1.0s.

## Recorded environment

Windows, 13 September 2026. Arduino CLI 1.5.1 with ESP32 core 3.3.11, FastLED
3.10.5 and LVGL 9.5.0 (installed lazily by the helper), player audio checkout
tagged 3.0.12. Ten fixtures on
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`;
the classic-ESP32 fixture on `esp32:esp32:esp32` as its own target.

Arduino reports flash against its 3 MB application partition. Neither static RAM
report measures runtime heap or PSRAM use, so a row saying 32% is not a claim
that the sketch has 68% of its RAM spare at runtime — LVGL's heap and the draw
buffers are allocated on top of it.

## Results

Every fixture passed. The source hash is the generated `.ino`, so a figure can
be tied to the exact sketch that produced it, and each row matched the generator
output at the time of the run.

> **Three of these rows now predate the emitter, and three were rebuilt.** After
> the 13 September run, the LVGL emitter stopped composing style selectors as
> `LV_PART_x | LV_STATE_y` and emits `_cdSel(part, state)` instead. **Disabled
> panel, Two panels and Bench telemetry** still record the older hash.
> **Normal, Generative show and SD player** were rebuilt on 15 September;
> see that section. **Isolated TFT, Headless controls, both Part families
> rows and Classic ESP32** never contained a selector and still regenerate
> to the hash below.
>
> Arduino CLI compiles this path with `-w`, so the 13 September table never
> saw the 66 fbuild warnings per custom-screen sketch. The 15 September
> fbuild pass compiled the three generator sketches with none of those
> warnings.

| Fixture | Source SHA-256 | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | --- | ---: |
| Normal | `326913201ec7` | Passed | 634,127 (20%) | 105,812 (32%) |
| Generative show | `fd5c306eef20` | Passed | 638,175 (20%) | 106,244 (32%) |
| SD player | `c86cb90453d5` | Passed | 1,318,531 (41%) | 122,052 (37%) |
| Isolated TFT | `7b593ce07417` | Passed | 301,072 (9%) | 23,016 (7%) |
| Headless controls | `6fc1c5e68731` | Passed | 427,151 (13%) | 27,636 (8%) |
| Disabled panel | `0719a2f49a99` | Passed | 628,959 (19%) | 105,436 (32%) |
| Two panels, two designs | `442987045954` | Passed | 631,087 (20%) | 115,228 (35%) |
| Part families (SPI) | `ed150cf57f10` | Passed | 472,171 (15%) | 37,884 (11%) |
| Part families (I²C) | `1878e5f7afc2` | Passed | 460,311 (14%) | 31,012 (9%) |
| Bench telemetry | `c1154e5baad8` | Passed | 638,567 (20%) | 105,852 (32%) |
| Classic ESP32, fixed layouts | `556c95d61450` | Passed | 428,331 (32%) | 31,508 (9%) |

### What the figures say

**Source-bound widgets cost very little.** The show carries a bound pattern name,
which is the one binding that puts a table in flash: against the same fixture
before bindings it is +952 bytes of flash and +224 of RAM, covering the name
table, its 64-byte buffer, the `_patNameStr_show` reader and three publish lines.
The player's track bindings cost +4,168 flash and +160 RAM.

**The bench instrument is cheap enough to leave on.** Telemetry against Normal —
the same graph with the Board's property set — is **+4,440 bytes of flash and
+40 of RAM**. That is HW-11's reporter, heap sampling and touch stamp priced for
the first time, and small enough not to distort the soak it measures.

**A second panel costs about 9.4 KB of RAM.** Two panels each drawing their own
design (115,228) against one (105,812) is the second draw buffer and widget
cache — the shape the restructure made expressible by giving every panel its own
`displayId`.

### What this run found

Two defects, neither visible to any of the 4,964 unit tests, because in both
cases the emitted text is correct and only its *order* or its *type* is wrong.
Both are fixed and guarded; see [Findings](#findings) for the cumulative list.

- The generator dropped **every** edge into a `TransportDisplay` before ordering
  nodes, to keep a panel's own widget feedback from looking like a cycle. That
  also dropped `display` and `enabled`, so a source feeding nothing but a panel —
  an RTC driving a fixed Clock layout — emitted its value after the block that
  read it. `isolated-tft` is three nodes and reproduces it exactly.
- The bound clock helpers were typed against `_RtcDateTime`, the parse helper's
  struct, while a graph wire carries `_RtcDateTimeValue`.

The ordering fix is positional only, and the figures say so independently:
`isolated-tft` and `part-families` both compile to byte-identical flash and RAM
against their pre-regression records under a different source hash.

### Not established here

The 13 September table's other eight fixtures were not rebuilt. Physical
behaviour is untouched by any of this: refresh speed, touch accuracy,
heap headroom under load, SPI coexistence and audio continuity all remain HW-11
and HW-13 bench work.

## Step 10 representative sketches, 15 September 2026

The direct-controls checklist asked for representative normal, show and
player firmware. The smoke generator still took widget outputs from the
panel; after those ports moved to the paired Touch node, generation
refused the show sketch (`control graph requires float` / `bool` on
`TransportDisplay.widget:*:out`). The fixtures now mint a `TouchInput`
per touch panel and leave widget *inputs* on the panel. `assertWireable`
holds that, so a later port move fails at generate rather than at
compile.

Windows. Arduino CLI 1.5.1, ESP32 core 3.3.11, FastLED 3.10.5, LVGL
9.5.0, player audio 3.0.12. fbuild 2.5.22 (vendored FastLED
`e52abeb26d1b`, LVGL `85aa60d18b3d`, player audio `928c420d49fc`).
Same S3 N16R8 FQBN as the table above. Arduino flash percents are
against the 3 MB application partition; fbuild flash percents are
against the 16 MB device, so they are not comparable as percentages.

Each row's hash matches `artifacts/display-compile/manifest.json` after
regeneration. fbuild compiled all three with no `LV_PART_x | LV_STATE_y`
warnings; the sketches emit `_cdSel(part, state)` instead. That is the
emitter fix the 13 September Arduino-only table could not see, because
Arduino CLI compiles this path with `-w`.

| Fixture | Engine | Source SHA-256 | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | --- | --- | ---: |
| Normal | Arduino CLI | `b6fca447c50e` | Passed | 634,135 (20%) | 105,820 (32%) |
| Generative show | Arduino CLI | `f4ad220196fc` | Passed | 638,195 (20%) | 106,252 (32%) |
| SD player | Arduino CLI | `206a2b8072ec` | Passed | 1,318,575 (41%) | 122,052 (37%) |
| Normal | fbuild | `b6fca447c50e` | Passed | 958,792 (6%) | 161,403 (49%) |
| Generative show | fbuild | `f4ad220196fc` | Passed | 963,963 (6%) | 162,068 (50%) |
| SD player | fbuild | `206a2b8072ec` | Passed | 1,635,779 (10%) | 176,865 (54%) |

Arduino CLI against the 13 September rows of the same three shapes is
+8 / +20 / +44 bytes of flash. RAM is +8 / +8 / 0. That is the Touch
node naming of widget output locals (`n_custom_tft_touch_widget_slider_out`)
plus whatever else the intervening generator edits cost; it is not a
claim that the `_cdSel` helper is free, because the previous Arduino
rows already compiled the deprecated form with `-w`.

Disabled, two-panel, telemetry and the part-family / isolated / headless
/ classic-ESP32 fixtures were not part of this run.
