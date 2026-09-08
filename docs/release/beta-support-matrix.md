# Beta Support Matrix

Design Studio for FastLED is still pre-release. For the public beta, a combination only
counts as **supported** when the repo contains a recorded validation note for
the exact environment and path that were exercised. Everything else stays
**experimental** until the record is expanded.

## Status levels

- **Supported**: validated end-to-end on real hardware and recorded with the
  exact combo below.
- **CI-covered**: exercised by automated install/test/build jobs only; not a
  browser + board guarantee.
- **Experimental**: present in the product, but not yet validated enough for a
  beta support promise.

## Supported end-to-end combo

| Status | Host OS | Browser | Board | Chipset | Matrix | Layout | Build engine | Upload method | Scope | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path | Generate a live-graph sketch, compile, flash, and run it on hardware | Original hardware-validation record (`2026-06-26`), retained by this matrix |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 151.0.7922.173 | ESP32-S3 (OPI PSRAM enabled) | WS2812B | 60x1 | LED string (non-matrix, non-serpentine) | `fbuild` 2.5.18 | USB flash via `esptool` through the helper's normal Upload path | Generate a representative animated live-graph sketch, compile, flash, verify GRB order/brightness/orientation and the 5 V / 2000 mA cap, then disconnect, reconnect, and upload again | [GitHub issue #200](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/issues/200) (`hw-14e7d6c0`, `2026-08-24`): all eight checks passed; #201 is the duplicate submission |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 151.0.7922.173 | ESP32-S3 (OPI PSRAM enabled) | WS2812B | 60x1 | LED string (non-matrix, non-serpentine) | `fbuild` 2.5.18 | ⚡ Flash Stream Receiver + 📡 Live Stream | Flash the Adalight receiver, stream live-preview frames over serial, verify GRB order/brightness/orientation and the 5 V / 2000 mA cap, then release and reacquire the port | [GitHub issue #202](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/issues/202) (`hw-86de9ad2`, `2026-08-24`): all nine checks passed |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 151.0.7922.173 | ESP32-S3 (OPI PSRAM enabled) + INMP441 | WS2812B | 65x1 | LED string (non-matrix, non-serpentine) | `fbuild` 2.5.18 | USB flash via `esptool` through the helper's normal Upload path | Compile and flash an on-device-microphone graph; verify live audio drives the expected FFT/beat response plus LED output, GRB order, brightness, power cap, and reconnect | [GitHub issue #203](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/issues/203) (`hw-b1bb1cf3`, `2026-08-24`): all nine checks passed with INMP441 on WS 39 / SCK 40 / SD 41 at 44.1 kHz, left channel |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 151.0.7922.173 | ESP32-S3 (OPI PSRAM enabled) + INMP441 | WS2812B | 65x1 | LED string (non-matrix, non-serpentine) | `fbuild` 2.5.18 | ⚡ Flash Stream Receiver + 📡 Live Stream | Flash the Adalight receiver and sustain live-preview streaming on the microphone-equipped target; verify LED output, GRB order, brightness, power cap, reconnect, and clean port release | [GitHub issue #204](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/issues/204) (`hw-0e6da4b4`, `2026-08-24`): all ten checks passed; follow-up testing confirmed stable streaming and correct palette colours with the LED 5 V rail enabled |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | 🧪 Flash Wiring Test | Flash the standalone wiring-diagnostic sketch and confirm LEDs display correctly | Validation `hw-59a1bb36` (`2026-07-24`): full diagnostic sequence passed; supersedes the first pass |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 151.0.7922.138 | Classic ESP32 (Generic DevKit 38-pin, ESP32-D0WD-V3 rev v3.1, no PSRAM) | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` 2.5.16 | USB flash via `esptool` through the helper's normal Upload path | Generate a live-graph sketch, compile, flash, and run it on hardware | Classic-ESP32 bring-up note below (`2026-08-16`) |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 151.0.7922.173 | Classic ESP-32D DevKit v1 (30-pin, ESP32-WROOM-32D, no PSRAM) | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path, plus the helper's `/api/rtc/set` serial write-back | DS3231 (Jaycar XC9044, Pi-header variant) time set from the app, read back by RTC Clock, and rendered on the LEDs by Clock Display | RTC capability validation record below (`2026-08-21`) |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | ⚡ Flash Stream Receiver + 📡 Live Stream | Flash the Adalight stream receiver once, then push live-preview frames to the board over serial, sustained | Validation `hw-f31a7f82` (`2026-07-24`): more than five minutes at 30 fps after the helper pipe fix |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.101 | ESP32-S3 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path | Generate a generative show controller sketch (`PatternCollection` → Show Engine → `MatrixOutput`), compile, flash, and run it on hardware | Original generative-show validation record (`2026-06-26`), retained by this matrix |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP32-S3 + INMP441 | WS2812B | 16x16 | Single rectangular matrix (serpentine) | `fbuild` | USB flash via `esptool` through the helper's normal Upload path | Generate a generative show with on-device microphone, non-crossfade transitions, beat-triggered advance, and particle overlay; compile, flash, and run it on hardware | GitHub issue #106 (hw-e791188d, `2026-07-24`): all checks passed including show runtime, beat advance, and particle overlay |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP8266 | WS2812B | 10x1 | Strip (non-matrix) | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Generate a live-graph sketch, compile, flash, and run it on hardware | Validation `hw-f57928b9` (`2026-07-25`): color order, orientation, and power cap passed |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP8266 | WS2812B | 10x1 | Strip (non-matrix) | `arduino-cli` | 🧪 Flash Wiring Test | Flash the standalone wiring-diagnostic sketch and confirm LEDs display correctly | Validation `hw-7adaec6f` (`2026-07-25`): full diagnostic sequence passed |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 150.0.7871.187 | ESP8266 | WS2812B | 10x1 | Strip (non-matrix) | `arduino-cli` | ⚡ Flash Stream Receiver + 📡 Live Stream | Flash the Adalight stream receiver once, then push live-preview frames to the board over serial | Validation `hw-b0b34ed3` (`2026-07-25`): passed after the one-row frame-dimension fix |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.64 | ESP32-S3 + microSD + MAX98357A | WS2812B | 16x16 matrix plus paired 32x1 VU rails | Single rectangular matrix (serpentine) flanked by a Stereo VU Meter fixture (left GPIO 42, right GPIO 2, data-in Bottom both sides) | `fbuild` 2.5.21 | USB flash via `esptool` through the helper's normal Upload path | Generate the SD Music Player sketch with a Stereo VU Meter, compile, flash, and run the full fifteen-item bench matrix: silence, channel separation, mono mirroring, a calibrated level staircase, ballistics, clipping, all twelve visualizations, all four selection policies, a fifteen-minute soak with the matrix rendering concurrently, track-skip and card-pull interruption, channel swap, both data-in directions, and power draw at the cap | [Bench record (`2026-09-02`)](../development/reports/stereo-vu-bench.md#bench-record--2026-09-02): all fifteen passed; 2.90-2.92 A measured against a 3000 mA cap at 4.82 V far-end, strips barely warm after ten minutes. Found and fixed two level-scale defects (`c43113f3`, `173dcc3d`) that compile and browser tests could not see |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 (Generic N16R8, 44-pin dual USB-C) + photosensitive LDR module (KS6026 form) | WS2812B | 32x1 | LED string (non-matrix, non-serpentine) | `fbuild` 2.5.21 | USB flash via `esptool` through the helper's normal Upload path | Generate a live-graph sketch whose `Light Sensor` on GPIO2/ADC1 drives LED output brightness through Map Range and Smooth; compile, flash, and verify the strip tracks light across covered, normal room light, and direct torch | [Input-peripheral bench record (`2026-09-02`)](../development/reports/input-peripheral-bench.md#ldr-light-sensor--2026-09-02): all three light conditions passed; ADC measured across the full range with a probe sketch using the same `analogRead(pin) / 4095.0f` expression the generator emits |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 + plain rotary encoder (A GPIO8, B GPIO9, switch GPIO21) | WS2812B | 16x16 | Single rectangular matrix, with an ST7789 1.54-inch panel on Show Status | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Generate a ten-pattern generative show whose pattern selection is driven by a physical encoder through Player Controls into the Pattern Slideshow's Controls input; compile, flash, and verify that turning the encoder changes the running pattern on the LEDs and the panel names it | [Rotary encoder bench record (`2026-09-08`)](../development/reports/input-peripheral-bench.md#rotary-encoder-pattern-selection--2026-09-08): review finding F1 repaired on hardware — the same chain was dropped by the show generator before `1608c790` |

These are the only fully recorded public-beta support rows today.

## Auxiliary display hardware validation

Separate from the LED-output combos above: auxiliary displays (Segment Display,
Info Display, Transport Display, the custom `Display` node) are a distinct
peripheral class with their own bus/driver/pin concerns. The same
supported/experimental framework applies, scoped to display hardware.

| Status | Host OS | Browser | Board | Display module (bus) | Node / layout tested | Build engine | Upload method | What was verified | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 | SSD1306 0.96-inch 128x64 OLED (I2C, SDA GPIO1 / SCL GPIO2) | `RTCInput` (Compile Time) → `InfoDisplay`, Clock layout | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Correct orientation, live time/date update — first display hardware pass recorded for this project | Bench record (`2026-09-07`) below |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 | TM1637 4-digit 7-segment (2-wire CLK/DIO) | `RTCInput` (Compile Time) → `SegmentDisplay`, Clock mode | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Correct digits, minutes advancing live | Bench record (`2026-09-07`) below |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 | MAX7219 8-digit 7-segment (SPI CLK/DIN/LOAD) | `RTCInput` (Compile Time) → `SegmentDisplay`, Clock mode | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Hours:minutes:seconds progressing live, correct digit orientation | Bench record (`2026-09-07`) below |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 | SH1106 0.96-inch 128x64 OLED (7-pin SPI, `sh1106-oled-096-128x64-spi`) | `RTCInput` (Compile Time) → `InfoDisplay`, Clock layout | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Correct orientation and alignment, confirming the SH1106's 2-column RAM offset renders correctly rather than shifting the image | Bench record (`2026-09-07`) below |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 | SH1106 1.3-inch 128x64 OLED (I2C, `sh1106-oled-128x64-i2c`) | `RTCInput` (Compile Time) → `InfoDisplay`, Clock layout | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Time/date correct, not-synced state shown correctly, correct orientation and alignment, time progressing live | Bench record (`2026-09-08`) below |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 | ST7789 1.54-inch 240x240 TFT (4-wire SPI, `st7789-tft-240x240`) | `PatternCollection` → `PatternSlideshow` → `TransportDisplay`, Show Status layout, no OLED on the bench | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Running pattern named, ordinal counted out of the ten-pattern collection, PLAYING state, correct orientation, and the patterns advancing on the slideshow's own interval | Bench record (`2026-09-08`, colour TFT) below |
| Supported | Windows 11 Home (build 10.0.26200) | Chrome 152.0.7977.76 | ESP32-S3 | SH1106 1.3-inch 128x64 OLED (I2C 0x3C, SDA GPIO18 / SCL GPIO17, `sh1106-oled-128x64-i2c`) **and** ST7789 1.54-inch 240x240 TFT (4-wire SPI, CS 5 / DC 6 / RST 7 / SCK 1 / MOSI 2 / BL 16, `st7789-tft-240x240`) together on one board | `PatternCollection` → `PatternSlideshow` driving both `InfoDisplay` (Pattern Browser) and `TransportDisplay` (Show Status) | `arduino-cli` | USB flash via `esptool` through the helper's normal Upload path | Both panels lit and advancing in step from one `_sel_show` cursor across two different buses; OLED thumbnail, pattern name, ordinal and PLAYING state all correct, with correct orientation and alignment | Bench record (`2026-09-08`, two panels) below |

**Bench record (`2026-09-07`, first four rows above):** first hardware pass
for any auxiliary display in this project — none had a recorded physical test
before this session. All four wired individually to the same ESP32-S3, each
driven by `RTCInput` set to Compile Time, generated and uploaded through
`arduino-cli`. One codegen defect was found and fixed during this session
(`4b6e9e01`): `_RtcDateTime` was passed by reference into RTC helper functions
with no forward declaration, so any RTC-driven sketch failed to compile under
the Arduino `.ino` prototype-hoisting trap already documented in `CLAUDE.md`.

**Bench record (`2026-09-08`, SH1106 I2C row above):** same ESP32-S3, same
`RTCInput` (Compile Time) → `InfoDisplay` wiring, on the newly catalogued
`sh1106-oled-128x64-i2c` part (`019000fc`) — validates both the module and
that a second transport form of an already-supported controller needed no
driver changes, only the catalogue entry.

**Bench record (`2026-09-08`, colour TFT row above):** the first colour TFT
hardware pass recorded for this project — every display row before it is an
OLED or a 7-segment module. A generative show controller was generated for a
ten-pattern collection with a single `TransportDisplay` on the bench and no
OLED beside it, compiled and flashed through `arduino-cli`. The panel named the
running pattern, counted it out of ten, reported `PLAYING`, and stayed correctly
oriented while the show advanced on its own interval.

Three things this establishes that no compile could:

- **A TFT-only Show Status build exists at all.** Until `1608c790` the layout
  read `_sel_show.highlight` and `_selBrowsing(_sel_show)` while the cursor was
  declared only for an OLED Pattern Browser or baked artwork, so this exact
  graph did not compile (review F2).
- **Pattern names do not depend on thumbnails.** With no OLED there is no
  thumbnail table in the sketch, and the name still rendered — the name table
  from `39f17bc9` reaching real glass.
- **A 240x240 module on ST7789V silicon is sized from the catalogue.** The
  chip-name default is the 240x320 touch panel's geometry; correct orientation
  here is `tftControllerForProps`'s `resolutionPx` override behaving on
  hardware rather than in a unit test.

**Bench record (`2026-09-08`, two panels):** an I2C OLED and an SPI TFT on the
same ESP32-S3, in one generated show controller, both drawing the same running
collection. This is the case every earlier display row left open: each of them
put one module on the bench at a time, so nothing had yet shown two auxiliary
displays coexisting in one sketch.

What it establishes:

- **One cursor drives both panels.** The two advanced in step as the slideshow
  rotated, which is `_sel_show` reaching an OLED Pattern Browser and a TFT Show
  Status from the single emission point rather than each layout keeping its own
  idea of what is playing.
- **Two buses coexist.** `Wire.begin(18, 17)` for the OLED and `SPI.begin(1, -1, 2, -1)`
  for the TFT in one setup, with no interference in either direction — the
  I2C/SPI split the driver has always assumed, on real silicon.
- **The Pattern Browser's baked thumbnails reach glass beside a colour panel.**
  The OLED drew the thumbnail, name and ordinal correctly with the 2-column
  SH1106 offset intact, in the same sketch that emits the TFT's name table.

The TFT drawing no thumbnail is correct, not a gap: Show Status is a text-only
layout, and transport artwork is player-owned — `artworkPlayer` follows the
`display` envelope's `player` arm, which a Pattern Slideshow does not publish.
A colour thumbnail for a music-free show is tracked as deferred scope (D-02),
not as a defect.

Not covered by this run: the TFT was physically mounted upside down, so its
orientation was corrected with the node's `tftRotation` property rather than
verified at `180` on the bench. `tftWindowOrigin(ST7789, '180')` derives the
80-row RAM offset a 240x240 window into 240x320 memory needs, and that is
asserted in `tftSurface.test.ts`, but it has not been seen on glass. Enabled
semantics and touch remain untested on this pair.

What this run did not cover, the rotation here being the slideshow's own timer:
control-driven pattern selection, since settled the same day by the
[rotary encoder record](../development/reports/input-peripheral-bench.md#rotary-encoder-pattern-selection--2026-09-08)
on this same board and panel. An OLED and a TFT sharing one cursor was also
open here, and is settled by the two-panel record below. Still open: the
panel's Enabled semantics, and touch, which this module has no controller for.

Not yet recorded as a supported row: the ESP32-2432S028 ("CYD") integrated
touch TFT board — see the note under "Recorded validations that are not yet
full support rows" below.

### ESP32 upload-engine recommendation

For new ESP32 uploads, Studio defaults to and recommends `arduino-cli`. fbuild 2.5.21
has a confirmed unresolved ESP32 no-op delay: on the recorded Windows/ESP32-S3 bench,
an unchanged build spent 181.5 seconds deciding that no compilation was needed, making
the full re-upload 3m 40s versus 26.8s with arduino-cli. fbuild remains available in
Board & Port as an explicit **experimental workflow choice** because it manages its own
toolchains and may still suit users who accept that latency. See the
[fbuild workaround report](../development/reports/fbuild-workarounds.md#9-a-build-with-nothing-to-do-still-takes-three-minutes).

This recommendation does not retroactively invalidate the fbuild hardware rows above,
and it does not promote unrecorded arduino-cli/board combinations to supported status.
The rows remain evidence for exactly the engine, board, host, browser, layout, and action
they name.

## Recorded validations that are not yet full support rows

- **2026-08-09 — ESP32-S3, HUB75 output (`fbuild`), two passes same session.**
  A real ESP32-S3 driving a P4 64×64 HUB75 panel (single panel, `layout:
  matrix`, default pinout): (1) 🧪 Flash Wiring Test compiled, flashed, booted
  cleanly, and displayed the diagnostic pattern correctly, confirming the pin
  fix and the GPIO0→CLK boot-strapping choice in `nodeLibrary.ts`'s HUB75
  defaults are safe in practice on this board+panel combo; (2) a normal
  `generateCpp` Upload of a real pattern graph — including a wired `MicInput`
  (FastLED's native on-device audio engine) — also ran correctly, confirming
  HUB75 output and the FastLED audio engine coexist on this board with no
  conflict. No full row yet — missing the exact host OS/browser version
  fields. Live Stream, panel chaining / folded grids / rotated panel layouts,
  and the show/player generators are still **unvalidated on real HUB75
  hardware**. Mixed HUB75 + **addressable-strip** output on one board is not
  a validation gap here — it is unsupported by design. See
  `docs/development/design/hub75-output.md` and `todo.md`.
- **2026-07-28 — classic ESP32, music-sync SD-show pipeline (`fbuild`),
  partial/failed bring-up.** The run reached the real provisioning/player path
  and exposed four defects: the provisioner's initial SD-write acknowledgement
  timeout was too short, the stock dual-OTA partition capped the Player sketch,
  `ESP32-audioI2S` releases ≥3.1.0 allocated more buffer than a non-PSRAM ESP32
  could provide, and the generated Player used the wrong DAC/time-position
  APIs. Commit `4dc22f1` fixes those findings (20 s acknowledgement timeout,
  `huge_app.csv`, pinned `ESP32-audioI2S` 3.0.12, and
  `getAudioCurrentTime()`), but no confirming end-to-end playback pass or full
  six-field environment record exists yet. SD-show provisioning therefore
  remains experimental.
- **2026-08-16 — classic ESP32, first successful bring-up (`fbuild` 2.5.16).**
  A Generic 38-pin DevKit (ESP32-D0WD-V3 rev v3.1, WROOM, no PSRAM) driving a
  16×16 serpentine WS2812B panel through a 74AHCT125 level shifter on GPIO16,
  with the panel on its own 5 V supply. A live-graph sketch compiled, flashed
  and ran with correct output — the row above. Three further things this run
  settled:
  - **The `fbuild` `.ino` revert is now hardware-validated.** `_write_fbuild_main`
    went back to writing a plain `.ino` on 2026-08-10 on the strength of the
    2.5.16 prelude fix (FastLED/fbuild#1275) and had never been run on a board.
    It compiles and runs.
  - **`huge_app.csv` boots on a non-PSRAM classic ESP32** — one of the four
    defects from the failed 2026-07-28 run above. A stale dual-OTA table from
    before the fix produced `ota data partition invalid and no factory` at boot;
    an `esptool erase-flash` followed by a normal upload cleared it, and the
    error has not returned. The remaining three defects still await an
    end-to-end SD-show pass.
  - **The capacity meter correctly discards fbuild's bogus RAM figure.** This
    build self-reported `RAM: 340.12KB / 320.00KB (106.3%)` and still linked,
    flashed and verified; the meter showed `flash 15%` with no SRAM figure
    rather than a false overflow.

  **Board-level gotcha worth passing to other testers:** this DevKit has a
  USB-C socket with no CC pull-down resistors, so a proper USB-C source refuses
  to supply VBUS and the board is completely dead on a C-to-C cable — no power
  LED, no enumeration — while a permissive charger brick powers it fine. It
  needs a USB-A-to-C cable. Nothing about this is a Studio fault, but it looks
  exactly like a broken board.

- **2026-09-08 — ESP32-2432S028 ("CYD") integrated touch TFT, basic SPI
  bring-up only (`arduino-cli`).** Studio's `TransportDisplay` part
  `st7789v-xpt2046-touch-240x320` auto-assigns pins as if driving a loose
  breakout; this board's panel and touch controller are hard-wired on its own
  PCB and needed every pin manually overridden to the board's real, fixed
  wiring before anything would light up correctly. Wired to `RTCInput`
  (Compile Time), the panel rendered the `Waiting` layout — the correct result
  at the time of this bring-up, before `fecbc2bb` added the normal-sketch
  TFT Clock treatment. This run verified clean, correctly-oriented, uninverted
  Waiting text, not the later Clock screen; that is evidence
  (not proof) this unit's panel is ST7789-compatible despite most
  ESP32-2432S028 units shipping ILI9341, a controller Studio has no driver
  for. Not promoted to a support row: no board profile exists yet for this
  board's fixed pinout (tracked in root `todo.md`, HW-12), the controller
  identity is not confirmed, and Now Playing / Fixed Transport / Show Status
  / touch are all untested — they need a real Music Player (SD + audio)
  graph, a materially larger test than this bring-up pass.

## CI-covered host/platform coverage

These jobs reduce risk, but they are not substitutes for manual browser or
board validation:

| Status | Coverage | Environment | What it proves | What it does not prove |
| --- | --- | --- | --- | --- |
| CI-covered | Frontend lint/test/build | `ubuntu-latest`, Node 22, Vitest `jsdom`, Vite build | The web app compiles, tests pass, and the production bundle builds | Real browser behavior, USB upload, audio permissions, or hardware behavior |
| CI-covered | Backend helper tests | `ubuntu-latest`, Python 3.11 | API logic and helper request handling pass under pytest | Real serial ports, board flashing, or toolchain installs |
| CI-covered | Backend dependency install | `ubuntu-latest`, `macos-latest`, `windows-latest`, Python 3.11 | Pinned helper dependencies install cleanly and import successfully on all three desktop OS families | End-to-end helper launch, browser integration, or hardware upload |
| CI-covered | Portable desktop packaging | `windows-latest`, `ubuntu-22.04`, `macos-15` ARM64, and `macos-15-intel`; Python 3.11, Node 22, PyInstaller | The native archive builds, bundled `fbuild`/`esptool` tools execute, and the frozen launcher serves its status, health, and app-shell endpoints | Code signing/notarization, clean-user installation, default-browser behavior, physical serial ports, or hardware upload |

## Experimental until validated

Unless a future row says otherwise, treat the following as experimental:

- All browsers except the exact Chrome builds named by a supported row above.
- All host OS + browser combinations except the exact Windows 11 Home (build
  10.0.26200) + Chrome combinations named by a supported row above.
- All boards except ESP32-S3, ESP8266, and the classic ESP32 (see the rows
  above). The classic-ESP32 row covers a normal live-graph upload only — its
  SD-show path is still experimental, per the 2026-07-28 note.
- All LED chipsets except the recorded WS2812B row above.
- All matrix/strip sizes except the recorded 16x16, 10x1, 60x1, and 65x1 rows above.
- Tiled panels and custom XY maps (non-rectangular layouts) — strip layout has
  recorded 10x1 ESP8266 plus 60x1 and 65x1 ESP32-S3 validations only for their
  exact rows and actions above.
- `arduino-cli` hardware combinations beyond the recorded rows above. It is the
  recommended ESP32 workflow because of fbuild's repeat-upload latency, but that
  operational recommendation is not a substitute for a dated hardware-validation row.
- PSRAM modes except OPI on the exact ESP32-S3 + 60x1 normal-upload/live-stream
  and 65x1 microphone/live-stream rows above.
- Baked song envelopes and collection-driven modulation in the music-show
  pipeline.
- SD show provisioning and player upload (music-sync shows remain experimental).
- **Auxiliary displays beyond the five recorded rows above.** The
  ESP32-2432S028 board profile, Now Playing / Fixed Transport / Show Status
  on the colour TFT, any touch interaction, the custom `Display` (LVGL) node,
  and every display module/board combination not listed in the table above
  remain unvalidated on real hardware.
- **DMX / Art-Net input, in every mode.** No hardware pass has been recorded
  for either transport. Two separate runs are needed before any part of this
  graduates:
  - **Art-Net firmware** (ESP32 / ESP8266): a generated sketch joins Wi-Fi,
    receives a universe from a real controller or desk, and drives the matrix.
  - **DMX512 firmware** (ESP32 only): a generated sketch reads a real DMX line
    through an RS-485 transceiver on the configured UART pins.
  - **Helper-backed Art-Net preview** is browser + helper only and never
    touches a board, so it graduates with the Art-Net firmware run rather than
    as its own row. Note that preview holds exactly one live universe.
- **Input peripherals other than the recorded LDR row above** — Button,
  Potentiometer, Encoder, and PIR Motion have no hardware record of any
  kind. `PotInput` shares the LDR's ADC path and pin-capability rule, so the
  GPIO2/ADC1 result is suggestive for it, but resemblance is not a pass. See
  [input-peripheral bench records](../development/reports/input-peripheral-bench.md).
- **Wi-Fi-dependent firmware generally**, including NTP time sync for the RTC
  Clock node — no board has confirmed a real network connection, and neither
  the software clock's drift nor an actual NTP sync has been validated.

  Everything above is covered by unit, codegen, and backend tests only. A DMX
  hardware row also needs the transceiver part number and wiring, the
  controller/desk software and version, and the universe and channels
  exercised, in addition to the six fields listed below.

### RTC Clock: board × time-source capability matrix

`RTCInput`'s `timeSource` picks how firmware seeds its clock; which boards
each source is allowed on is enforced in `validateGraph.ts`
(`findBoardCompatibilityErrors`), not just implied by the docs above:

| Time source | Allowed boards | Enforced by validation | Hardware validated |
| --- | --- | --- | --- |
| Compile Time | Every board in the catalogue | No board restriction | No |
| Manual | Every board in the catalogue | No board restriction | No |
| NTP | ESP32-family (S3, S2, C3, C6, H2, classic) and ESP8266 | Yes — blocked on every other board | No |
| DS3231 | Every board with the standard Arduino `Wire` API and a default I²C bus | No board restriction | **Yes** — classic ESP-32D DevKit v1 (30-pin), Jaycar XC9044 module, `fbuild`, `2026-08-21`: time written via the helper's `/api/rtc/set`, then read back and rendered by Clock Display on the LEDs |

Notes:

- The NTP restriction is keyed on FQBN prefix (`esp32:` / `esp8266:`), not on
  whether a board actually has a Wi-Fi radio. **Arduino UNO R4 WiFi** is in the
  board catalogue and does have Wi-Fi hardware, but is not an ESP32/ESP8266
  FQBN, so NTP is currently blocked on it too — a known gap, not a validated
  "unsupported" result.
- Art-Net input (see above) is gated by the identical ESP32-family-or-ESP8266
  check and shares this same open hardware-validation gap.
- Compile Time and Manual need no network and are not blocked on any board,
  but neither has a recorded drift measurement — see the note below.
- DS3231 uses address `0x68` and the board core's default SDA/SCL pins. It has no
  third-party library dependency. Pin labels vary by board, and the current GPIO
  validator cannot infer those board-default aliases, so users must avoid
  assigning the same physical pins to a non-I²C role. Other RTC chips are not
  supported. See [`rtc-clock-and-schedule.md`](../development/design/rtc-clock-and-schedule.md)
  for the full contract.

## How to graduate a new supported row

When a new combo is validated, record all of the following in the same note or
PR before promoting it here:

1. Host OS and version.
2. Browser and version.
3. Board and board core / build engine path.
4. LED chipset, matrix size, and physical layout mode.
5. Upload method used.
6. What was actually verified on hardware.

## Community beta reports

The LED output **Upload...** panel includes an opt-in **Beta hardware
coverage** report. It compares the current target and graph features with the
recorded rows above, requests explicit Pass/Fail/Not tested observations, shows
the complete payload, and only then offers Copy, JSON download, or a pre-filled
GitHub report. Nothing is submitted automatically, and the report excludes
ports, project content, code, media, Wi-Fi details, and device identifiers.

See [`beta-hardware-validation.md`](beta-hardware-validation.md) for the tester
flow, maintainer triage rules, and the planned SD-show validation checklist.
