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
- **LED output:** _to be stated._ The free pool on this board is **GPIO22 and
  GPIO27, and nothing else** — of the four pads it brings out, GPIO21 is the
  panel backlight and GPIO35 is input-only. Record which of the two the strip
  is on, and its length.

### What this rig can and cannot measure

Recorded before the runs rather than discovered during them, because two of the
four are constrained by this board rather than by the software under test.

- **A custom screen does not fit.** The LVGL heap is pinned at 64 KiB and a
  custom screen overruns a classic ESP32 by 22,496 bytes (HW-25). Run 1 is
  therefore measured with a **fixed layout**, not a custom screen design, and
  says so in its row.

  This board is deliberately left able to *attempt* it. Unlike the generic
  classic-ESP32 profiles, `esp32-2432s028r` declares no
  `internalRamBudgetBytes`, so HW-24's pre-compile refusal returns nothing and
  the build proceeds to the linker. That is an inconsistency — the same absent-
  data-reads-as-complete shape HW-12 found in this board's pin safety — and it
  is being **held open on purpose until HW-25 has its number**, because a
  refusal before the compile is a refusal before the measurement. Do not close
  it by declaring a budget for this board until the run below is recorded.
  See HW-25 in `todo.md`.

  **Run 0, then: the overflow itself.** Build a custom screen for this board and
  let it fail. The linker error is the measurement — HW-23's formatter names the
  region and the exact overage — and it is a *static* figure, so it needs no
  device. Record it here beside the figure the estimate predicted, since a
  disagreement means the estimate needs correcting rather than the measurement.

  | Figure | Predicted | Measured | Notes |
  | --- | --- | --- | --- |
  | Region | | | `dram` / `bss` / `data` — which one overflowed |
  | Overage bytes | 22,496 | | the estimate's figure against the linker's |
  | Screen complexity | | | widget count, so "per complexity" means something |

  Its other half is runtime, and comes free from run 1: `heap` and `minheap` on
  a *fixed-layout* build on this board say how much internal RAM is actually
  free with the panel running, which is the ceiling any smaller LVGL heap has
  to fit under. The two together are what HW-25's exit asks for; neither alone
  is.
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
| PSRAM free | | | |
| Draw buffer | | | `drawbuf`, and it should match the RAM estimate |
| Frames/sec | | | |
| Longest loop pass | | | |
| Worst touch response | | | |

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
