# Touch, LVGL and heap budgets: the bench procedure

> **Numbers not yet taken.** Every table here is empty on purpose. HW-11 asks for
> acceptance budgets set *from evidence*, so the figures go in after the runs
> below, not before them — a budget invented at a desk is a number that gets
> argued with rather than measured against.

The software half is built and reachable: a Board property makes the firmware
report itself, and a card in the Upload tab reads those reports. What remains is
a rig, four runs and an hour.

## What the device reports

**Report telemetry** is a checkbox in the Hardware tab's board settings, below
the PSRAM controls. It is off by default and belongs off in a finished build —
it is an instrument, not a feature. It appears only on an ESP32 or ESP8266
target, which is the same question the generator asks before emitting any of
it, so the switch cannot offer output the build would not produce. Changing it
needs an upload before it means anything.

Touch calibration does **not** need it: that wizard flashes its own measuring
sketch. This switch exists for the four runs below.

With it set on the Board node, every two seconds the sketch prints one line:

```
FLS_STAT uptime=3600 heap=142112 minheap=138904 fps=58.9 loopmax=21 psram=4194304 psramtotal=8388608 touchms=12 drawbuf=9600
```

| Key | Meaning |
| --- | --- |
| `uptime` | Seconds since boot, so a reset is visible rather than inferred |
| `heap` | Free internal heap now |
| `minheap` | Lowest free internal heap since boot, from the platform's own tracking |
| `fps` | Frames rendered per second over the last interval |
| `loopmax` | Longest single loop pass in the interval, in ms — work, not the pacing sleep |
| `psram` / `psramtotal` | Free and fitted PSRAM; both zero on a board without any |
| `touchms` | Worst press-to-painted-frame in the interval. **Absent when nothing was touched**, which is not the same as zero |
| `drawbuf` | Bytes of display draw buffer the build allocated, from `sizeof` rather than from an estimate |

Only ESP32 and ESP8266 boards emit it — `Serial.printf` and the heap accessors
are ESP-family API, so on any other target the property is ignored rather than
allowed to break the build.

## Reading it

`DeviceTelemetryCard` is the reader. Press **Listen** — it shares the Output
console's serial
connection rather than opening its own, because the helper holds a port
exclusively and two readers cannot both have it.

The card shows the live figures and, once the run is more than thirty seconds
old, the heap drift in bytes per hour fitted across every sample. **Save report**
writes the run to a text file: that file is the evidence for the tables below.

Drift is fitted rather than taken from the first and last sample, so one garbage
collection dip cannot produce a leak that is not there. A run losing more than
64 KiB/hour is called out as failing the soak condition; a kilobyte an hour is
not, because that device runs for weeks.

## The rig

One exact launch board and one exact panel, both named in full — "an ESP32" is
not a rig. Record the FQBN, the PSRAM mode and the panel's part id.

The rig is the repository's ESP32-2432S028R bring-up unit, the same physical
board HW-12's pin map and touch calibration were measured on. Everything below
except the LED output is already bench-measured and recorded in
[the support matrix](../../release/beta-support-matrix.md); it is restated here
so a reader of this page does not have to reconstruct the rig from another one.

- **Board:** ESP32-2432S028R ("CYD"), profile `esp32-2432s028r`, FQBN
  `esp32:esp32:esp32`. Classic ESP32, **no PSRAM fitted** — the card reports
  `none fitted` rather than nought free, and the PSRAM rows below are not
  applicable on this rig.
- **Panel:** `st7789v-xpt2046-touch-240x320`, ST7789V, 240x320, soldered to the
  board. SCK 14, MOSI 13, MISO 12, CS 15, DC 2, backlight 21; reset is tied to
  the board's `EN` line and carries `NO_PIN`, not a GPIO.
- **Touch:** XPT2046 on its own SPI bus — CS 33, IRQ 36, SCK 25, MOSI 32,
  MISO 39. Calibrated on this unit to `touchXMin 408 / touchXMax 3646 /
  touchYMin 331 / touchYMax 3674`, `touchFlipX` set and `touchFlipY` clear:
  this unit's X axis counts right-to-left.
- **LED output:** WS2812B strip, **32 pixels on GPIO27**. The free pool on this
  board is GPIO22 and GPIO27 and nothing else — of the four pads it brings out,
  GPIO21 is the panel backlight and GPIO35 is input-only — so this uses one of
  the two. Checked against the materialised board graph: no pin conflict, no
  exact-board issue, no validation error and nothing blocked at the deploy gate.
  Note for later: GPIO27 is also this board's default I2C SDA
  (`boardI2cDefaults.ts`), which costs nothing here because neither the panel
  nor the touch controller is an I2C part, but would collide the moment an I2C
  device is added — on a two-pin board there is no second answer.

### What this rig can and cannot measure

Recorded before the runs rather than discovered during them, because two of the
four are constrained by this board rather than by the software under test.

- **A custom screen does fit. Measured 2026-09-22, and it reverses what this
  row used to say.** Run 0 was built expecting a linker failure and **passed**:
  flash 615,715 / 1,310,720 (46%), static RAM 105,348 / 327,680 (32%), leaving
  222,332 bytes. Run 1 is still recorded with a fixed layout so it stays a clean
  baseline — but not because a custom screen is impossible on this board.

  | Figure | Predicted | Measured | Notes |
  | --- | --- | --- | --- |
  | Result | linker failure | **passed** | Arduino CLI 1.5.1, `esp32:esp32:esp32`, 8m 59s |
  | Region | `dram` | none | nothing overflowed |
  | Overage bytes | 22,496 | 0 | prediction not reproduced; see below |
  | Static RAM | — | 105,348 (32%) | 222,332 bytes left |
  | Flash | — | 615,715 (46%) | default 4 MB partition |
  | Cost over a fixed layout | 77,556 | 73,952 | estimate is 4.6% conservative |
  | Screen complexity | 14 widgets | 14 widgets | the design every custom fixture uses |
  | Source SHA-256 | — | `4c09d5cb35c2` | `artifacts/display-compile/cyd-custom.ino` |

  Reproduce with `python scripts/compile-display-smoke.py arduino-cli
  artifacts/display-compile/cyd-custom.ino --fqbn "esp32:esp32:esp32" --tag cyd`.

  **The accounting checks out, which is why the result is believable.** Against
  the `classic-esp32-fixed` fixture on the same FQBN (31,396 bytes static RAM),
  the custom screen costs **+73,952 bytes** where `estimateFirmwareRam`
  predicted 77,556 — 3,604 bytes (4.6%) conservative. That agreement also
  settles something the estimate rested on: LVGL's 64 KiB heap is a *static*
  allocation and is counted by the linker, not taken from free heap at runtime.

  **The 22,496-byte overflow could not be reproduced, and no record of it
  exists.** It appears only in HW-25's own prose, referring to "the overflow
  above"; there is no build log, fixture or report behind it in this repository.
  It may have been a larger graph or a different board. Do not quote it as a
  measured figure again until something produces it.

  **Linking is not running, and this row must not be read as a promotion.** It
  says the image fits. The remaining 222 KB still has to cover LVGL's runtime
  working set, FastLED, the framework and the stack, so whether the screen is
  *usable* is run 1's `heap` / `minheap` question, not this one.

  On why the build was attemptable at all: unlike the generic classic-ESP32
  profiles, `esp32-2432s028r` declares no `internalRamBudgetBytes`, so HW-24's
  pre-compile refusal returns nothing. That was recorded as an inconsistency to
  close later — and closing it at 48 KiB would have refused a build that fits
  with 222 KB to spare, which is now an argument about the *budget*, not about
  the gap. See HW-25 in `todo.md`.

- **Run 3 cannot be done on this board at all.** It wants TFT, SD and touch
  sharing one bus with audio playing. This board's onboard microSD and speaker
  amplifier are exactly the pins HW-12 left unrecorded rather than taken from
  family documentation, and the two-pin pool cannot reach external ones. Run 3
  needs either those pins measured first or a different rig. Leave its table
  empty rather than filling it from a different board — a figure from one
  generator says nothing about another, and the same is true of one board.

Runs 1 (fixed layout), 2 and 4 are within this rig. Record on each row which
board produced it, so a later S3 run is a second column rather than an
overwrite.

## The four runs

Each is recorded separately, because the three generators allocate differently
and a figure from one says nothing about another.

### 1. Normal sketch, screen and LEDs

Baseline. A screen on the panel, an LED output running, no audio, no card. On
the CYD rig this is a **fixed layout**; see the rig note above for why a custom
screen design cannot be one of this board's figures.

| Figure | Budget | Measured | Notes |
| --- | --- | --- | --- |
| Flash | | | from the compile report, not the device |
| Free heap at rest | | | |
| Lowest heap over the run | | | |
| PSRAM free | n/a | n/a | none fitted on this rig |
| Draw buffer | | | `drawbuf`, and it should match the RAM estimate |
| Frames/sec | | | |
| Longest loop pass | | | |
| Worst touch response | | | |

**Two rows cannot be filled by this run, and that is a property of the layout,
not of the board.** A Clock layout is read-only — only Fixed Transport and Now
Playing expose touch regions, and both need a player source this board cannot
host — so `touchms` is never emitted. And a fixed layout allocates no LVGL draw
buffer, so `drawbuf` has nothing to report. Both are marked n/a above. They are
measured instead by the custom-screen build below, which run 0 showed links here
with 222 KB to spare.

Fixture: `artifacts/display-compile/cyd-run1.ino`, from
`node scripts/generate-display-smoke.mjs`. Its clock is `Manual`, so it claims
no I2C pins — a DS3231 would need two, this board has GPIO22 and GPIO27 free,
and the strip holds one, so a real I2C clock does not fit here at all.

On the CYD rig this graph's *own* allocations come to 452 bytes — a fixed TFT
layout keeps no framebuffer, so it costs field caches and little else, and the
32-pixel strip is 96 bytes. Almost everything the device reports here is
therefore framework, driver and FastLED baseline rather than anything the graph
chose, which is what makes it the baseline run. The nearest existing comparable
is the `classic-esp32-fixed` compile fixture at **31,396 bytes** of static RAM
under Arduino CLI; a device figure far from that wants explaining before the
later runs are trusted.

### 1b. Custom screen, with telemetry

The run that answers HW-25. Run 0 proved a custom screen *links* on this board;
this one says whether it **runs** — and it is the only build on this rig that
reports a touch latency or a draw buffer at all.

Fixture: `artifacts/display-compile/cyd-custom-telemetry.ino`. Same board, panel
and 32-pixel strip as run 1, with the 14-widget design of run 0 and
`reportTelemetry` on.

| Figure | Budget | Measured | Notes |
| --- | --- | --- | --- |
| Boots at all | | | the first question; a failed LVGL heap init shows here |
| Free heap at rest | | | against run 1's figure, the cost of the screen |
| Lowest heap over the run | | | |
| Draw buffer | | | `drawbuf`, against the estimate's 9,600 |
| Frames/sec | | | against run 1, the cost of driving LVGL |
| Longest loop pass | | | |
| Worst touch response | | | press the glass, or this stays absent |

If this boots and holds its heap, HW-25's premise is finished rather than merely
unreproduced, and the open question becomes whether the 48 KiB
`internalRamBudgetBytes` on the generic classic profiles is too conservative.

### 2. Generative show

Same rig, the show controller. Adds pattern rendering and transitions.

| Figure | Budget | Measured | Notes |
| --- | --- | --- | --- |
| Flash | | | |
| Free heap at rest | | | |
| Lowest heap over the run | | | |
| Frames/sec | | | |
| Longest loop pass | | | |
| Worst touch response | | | |

### 3. SD player, with the bus shared

The exit condition names this one: TFT, SD and touch on one SPI bus, audio
playing, LEDs running. This is where a bus contention problem shows up as a
frame-rate collapse or a touch that answers late.

| Figure | Budget | Measured | Notes |
| --- | --- | --- | --- |
| Flash | | | |
| Free heap at rest | | | |
| Lowest heap over the run | | | |
| Frames/sec, audio idle | | | |
| Frames/sec, audio playing | | | the comparison is the point |
| Longest loop pass | | | |
| Worst touch response | | | |
| Audio continuity | | | any dropout is a failure, however brief |

### 4. The soak

One hour, undisturbed, on whichever of the three is heaviest. Press the panel
occasionally so the touch figure means something.

| Figure | Result |
| --- | --- |
| Run length | |
| Heap drift (bytes/hour) | |
| Lowest heap | |
| Frames/sec, first ten minutes vs last | |
| Device resets | must be zero; `uptime` going backwards is a reset |
| Verdict | |

A wall-clock timing regression counts as a failure even if the heap is flat:
the LED loop is wall-clock driven, and a show that drifts slower over an hour
has failed regardless of what the memory did.

## Turning measurements into budgets

Once the four runs are in, the budgets are set from them and recorded here, then
enforced where they can be: the firmware RAM estimate already refuses a build
over a board's declared internal-RAM budget, and a measured draw-buffer figure
that disagrees with the estimate means the estimate needs correcting, not the
measurement.

Keep the saved report files — the numbers in the tables are a summary, and the
question "was that measured or assumed" has come up once per subsystem so far.
