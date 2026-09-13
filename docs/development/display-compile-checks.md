# Display firmware compile checks

> **Evidence for the current model, Arduino CLI only.** Every figure below comes
> from one run against the shipped graph: a `TransportDisplay` panel that owns
> the screen drawn on it (no document node, no mount edge), touch on its own
> node, Control Map, and widgets that read the panel's source instead of drawing
> a cable. The second engine has not been run against this source yet, so there
> are no fbuild rows — an absent row is the honest record of a build nobody has
> made, not a gap to be filled in from an older one.
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
node scripts/generate-display-smoke.mjs
```

The three generator paths, on both engines:

```powershell
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/normal.ino
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/show.ino
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/player.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/normal.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/show.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/player.ino
```

The shapes that have no generator of their own but fail in their own ways —
a TFT with no LED output beside it, a control build with no display half, a
panel switched off, two panels each showing their own design, and every
catalogued module in as few sketches as their I²C addresses allow:

```powershell
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/isolated-tft.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/headless.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/disabled.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/multi-panel.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/part-families.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/part-families-i2c.ino
```

There is no fixture for a design on two panels or on none. Those shapes were
compiled once, while they were still expressible; a panel owns its design now, so
neither can be built in the app to be generated from.

The bench instrument, which is the normal graph with the Board's telemetry
property on:

```powershell
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/telemetry.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/telemetry.ino
```

The other advertised board. A classic ESP32 is a different chip family with no
PSRAM and a much smaller internal RAM ceiling, so its fixture carries the fixed
display layouts only — no custom screen, because a 64 KiB LVGL heap does not
fit beside FastLED there (HW-25). Pass its FQBN and a `--tag`, which keeps the
report beside the S3 one instead of overwriting it:

```powershell
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/classic-esp32-fixed.ino --fqbn esp32:esp32:esp32 --tag classic
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/classic-esp32-fixed.ino --fqbn esp32:esp32:esp32 --tag classic
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
- fbuild 2.5.22's LVGL archive command exceeded Windows' command-length limit.
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
