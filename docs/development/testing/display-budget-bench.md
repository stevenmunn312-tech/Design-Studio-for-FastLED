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

**Measured 2026-09-22** on the CYD rig: flashed to COM6 (compile 4m 17s, upload
22.6s, hash verified), then a 90-second capture at 115200 baud, 44 telemetry
samples. Budgets are deliberately still blank — set from the baseline alone they
would be numbers picked to clear one run. They go in once 1b is recorded.

| Figure | Budget | Measured | Notes |
| --- | --- | --- | --- |
| Flash | | 417,215 (31%) | from the compile report, not the device |
| Static RAM | | 27,700 (8%) | linker; 299,980 left for locals |
| Free heap at rest | | **317,592 B** | flat for 88 s, not one byte moved |
| Lowest heap over the run | | 290,152 B | `minheap`, and it is a *boot* dip, not a run-time one |
| Heap drift | | none measurable | flat to the byte across the window |
| PSRAM free | n/a | none fitted | `psram=0 psramtotal=0`, as expected |
| Draw buffer | n/a | absent | a fixed layout allocates none — see below |
| Frames/sec | | 55.3–55.6 | 16 ms `FastLED.delay` pacing, so ~60 is the ceiling |
| Longest loop pass | | 32.4–32.8 ms | steady; the 124 ms first sample is boot |
| Worst touch response | n/a | absent | a Clock layout is read-only — see below |

A representative line:

```
FLS_STAT uptime=44 heap=317592 minheap=290152 fps=55.4 loopmax=32.4 psram=0 psramtotal=0
```

**Two observations to carry into the other runs.** The heap did not move at all
— 317,592 bytes, identical sample to sample. That is the right answer for a
fixed-layout build with no dynamic allocation in its loop, and it makes a clean
zero against which run 1b's LVGL heap can be read.

And the longest loop pass is **32.5 ms against a 16 ms frame budget**, which is
why frames/sec sits at 55 rather than 60: a panel field repaint costs about two
frames. Nothing is dropping frames badly, but the TFT repaint is already the
largest single thing in the loop *before* LVGL is added — so it, not the heap,
is the figure to watch in 1b.

Free heap (317,592) reads higher than the linker's 299,980 "for local variables"
because the two count different things; the ESP32's heap includes regions the
linker does not attribute to locals. Compare device figures with device figures.

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

**Measured 2026-09-22.** Flashed to COM6 (compile 8m 54s, upload 25.3s, hash
verified), 95-second capture, 47 telemetry samples. **It boots and runs.**

| Figure | Budget | Measured | vs run 1 | Notes |
| --- | --- | --- | --- | --- |
| Boots at all | | **yes** | — | LVGL init took 299 ms, visible as the first `loopmax` |
| Flash | | 630,943 (48%) | +213,728 | |
| Static RAM | | 105,420 (32%) | +77,720 | 222,260 left for locals |
| Free heap at rest | | **240,112 B** | −77,480 | flat for 93 s, not one byte moved |
| Lowest heap over the run | | 212,672 B | | `minheap`, a boot dip |
| Heap drift | | none measurable | | flat to the byte |
| Draw buffer | | **9,600 B** | new | exactly the estimate's figure |
| Frames/sec | | 50.0 idle, 41.0 worst under touch | −5.4 | idle is steady to 0.1 across 47 samples |
| Longest loop pass | | **2.0 ms** idle, 29.3 under touch | −30.5 | *lower* than the fixed layout — see below |
| Worst touch response | | **29.2 ms** | | 37 samples; median 11.9, best 2.5 — see below |

```
FLS_STAT uptime=45 heap=240112 minheap=212672 fps=50.0 loopmax=2.0 psram=0 psramtotal=0 drawbuf=9600
```

**HW-25's premise is finished, not merely unreproduced.** A 14-widget custom
screen runs on a classic ESP32 with 240 KB of heap free and a flat memory
profile. The 64 KiB LVGL heap does not rule this board out under any reading.

**The estimate is now confirmed twice over, independently.** It predicted the
design would cost 77,556 bytes where run 1's graph cost 452, so a delta of
77,104. The device reports free heap falling from 317,592 to 240,112 — a delta
of **77,480 bytes, within 376** of prediction. And `drawbuf` reports 9,600
bytes, which is the 240x20 RGB565 buffer the estimate assumes, to the byte.
`estimateFirmwareRam` can be trusted on this path.

**The loop got faster, which reverses the expectation recorded in run 1.** The
longest pass fell from 32.5 ms to 2.0 ms. The fixed layout repaints text fields
synchronously inside the loop, so one field repaint blocks for ~32 ms of SPI;
LVGL instead redraws only dirty areas, in slices sized by that 9,600-byte
buffer, so no single pass is ever long. The custom screen costs ~10% of frame
rate (55.4 → 50.0) but is much better behaved per pass. Run 1's warning that
"timing, not RAM, is the risk on this board" was right about which number
mattered and wrong about which build it would hurt.

**Touch, measured on the second capture.** The first fixture carried the
library's generic XPT2046 calibration (200-3900, no flip) rather than this
glass, so it was reflashed with the guided calibration recorded for this unit on
2026-09-14 — `408 / 3646 / 331 / 3674`, `touchFlipX` set. The emitted span comes
out descending (`_xptPoint(..., 3646, 408, 331, 3674, ...)`), which is
`orientedTouchSpan` swapping the endpoints rather than storing a minimum above
its maximum: the rule CLAUDE.md states, exercised on a real reversed axis rather
than only in tests. Raw samples during the run ran 817-3565, inside the
calibrated span.

Press-to-painted-frame over 37 samples: **best 2.5 ms, median 11.9 ms, worst
29.2 ms.** The values cluster rather than spread — roughly 2.5, 12, 14 and 28 —
which is what a press landing at different points in LVGL's refresh cycle looks
like, not noise. Even the worst is far below the ~100 ms where a touch stops
feeling immediate, so this panel is comfortably responsive.

What touch costs while it is happening: the longest loop pass rises from 2.0 ms
to ~29 ms and frame rate dips from 50.0 to 41.0 at worst. That is the same
~28 ms repaint the fixed layout pays on *every* field refresh — here it is paid
only when something is actually touched.

**The heap did not move under interaction.** 240,112 bytes, identical across
both captures and every press. LVGL is not allocating per touch, which is the
single most useful thing this run says about a long soak.

### 2. Generative show

Same rig, the show controller. Adds pattern rendering and transitions.

Fixture: `artifacts/display-compile/cyd-run2.ino`. Deliberately **run 1b with
one thing changed** — same board, panel, calibration, strip and screen design,
because the bench keeps a figure per generator and the delta should be the
generator, not the display. `isPatternShow` keys the show generator on the
PatternSlideshow, nothing about the screen.

Two differences from 1b are deliberate and both matter to the figure:

- **Two patterns, not one.** Every other fixture in this repository uses a
  single-pattern collection, which is fine for a compile — but with one pattern
  the slideshow never advances and the generator emits essentially no
  transition code (the shared `show.ino` has *one* line mentioning transitions;
  this fixture has the whole `compositeTransition` machine plus the `showA` /
  `showB` buffers). A run measuring "pattern rendering and transitions" against
  a build containing neither would measure nothing. It uses its own group
  registry so the existing show and player fixtures keep the exact bytes their
  records are keyed to.
- **Plasma and Fire2012, and a six-second interval.** A solid fill costs nothing
  per frame, so it would understate the show's real rendering cost; and the
  default twenty-second interval would cross only a handful of transitions in an
  hour, where six crosses hundreds.

The slideshow's `display` output is wired into the panel, where 1b's panel had
no source — a show whose screen shows nothing is not a shape anyone builds, and
the Pattern Browser on that design is the widget with something to say here.

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
