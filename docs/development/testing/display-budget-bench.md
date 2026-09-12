# Touch, LVGL and heap budgets: the bench procedure

> **Numbers not yet taken.** Every table here is empty on purpose. HW-11 asks for
> acceptance budgets set *from evidence*, so the figures go in after the runs
> below, not before them — a budget invented at a desk is a number that gets
> argued with rather than measured against.

The software half is built: a Board property makes the firmware report itself,
and the Upload tab reads those reports. What remains is a rig, four runs and an
hour.

## What the device reports

Turn on **Report telemetry** on the Board node and upload. Every two seconds the
sketch prints one line:

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

In the Upload tab, the **Device telemetry** card appears whenever the Board asks
for telemetry. Press **Listen** — it shares the Output console's serial
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

- Board: _not yet recorded_
- Panel: _not yet recorded_
- Touch: _not yet recorded_
- LED output: _not yet recorded_

## The four runs

Each is recorded separately, because the three generators allocate differently
and a figure from one says nothing about another.

### 1. Normal sketch, screen and LEDs

Baseline. Custom screen on the panel, an LED output running, no audio, no card.

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
