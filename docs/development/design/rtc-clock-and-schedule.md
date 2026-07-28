# RTC clock and scheduled triggers — design note

Status: implemented (v1 shipped, hardware validation outstanding) · Owner: app ·
Date: 2026-07-28

Gives a graph a wall clock: an installation can run one look during the day and
another after dark, a sign can wake at opening time, a display can show the
actual time. Studio had no notion of real time before this — `t` is seconds
since boot, which cannot answer "is it 18:00 yet."

Shipped across `8791069`, `38853e8`, `8bb51b0` (#125), `2ab9ca4` (#126),
`1fb7083` (#127), and `063fbaa`. Written after implementation, so it records the
contract as built.

## Decisions

### The clock is a wire, not an ambient resource

`RTCInput` is an ordinary node with ordinary outputs. `ScheduleTrigger` reads
`valid` / `synced` / `secondsOfDay` / `weekday` / `day` / `month` / `year`
through **normal input ports**, and `ClockDisplay` likewise.

Rejected: a scene-wide singleton clock that schedule nodes read implicitly.
An implicit global would have been less wiring, but it would also have been the
only invisible data dependency in the app, invisible to the cycle guard, to
Graph Health's node attribution, and to the group registry. Making it a port
means a schedule inside a pattern group works with no new machinery, and a patch
can feed a schedule a *synthetic* clock (a `Counter` through `MapRange`) to test
it — which is how you exercise a 3 a.m. behaviour at 2 p.m.

Consequence to keep in mind: `RTCInput` is **not** a singleton. Two of them are
two independent software clocks. That is intentional (two schedules on different
timezone offsets is a real installation shape), but it means "the current time"
is per-node, not per-scene.

### Time sources: a software clock plus optional NTP. No RTC chip in v1.

`timeSource` picks how firmware seeds its clock:

| Source | Seed | `valid` | `synced` | `stale` |
|---|---|---|---|---|
| `Compile Time` | the sketch's `__DATE__` / `__TIME__` build stamp | true | true | false |
| `Manual` | the entered start date/time | true once the seed parses | true | false |
| `NTP` | build stamp, then the network epoch once it arrives | true | false until synced | true until synced |

All three run the **same** free-running software clock: a `millis()` delta
accumulated into a 64-bit millisecond counter over a civil-date base. NTP is a
correction layered on top, not a separate path — `configTime(offset, 0, server)`
is issued once the Wi-Fi link is up, and thereafter the sketch reads
`time(nullptr)` and lets the platform's own SNTP client keep it fresh. An epoch
below `946684800` (2000-01-01) is treated as "not synced yet."

That last part is the fix in `063fbaa`. NTP used to leave every output dark
until Wi-Fi came up, so a board with a bad password showed nothing and gave no
signal about why. Now it runs from the build stamp immediately, flagged
`synced: false, stale: true` — a wrong-but-moving clock that announces itself,
rather than a dead one. `ScheduleTrigger.requireSync` is how a patch says "don't
act until the time is actually trustworthy."

An impossible seed (a Manual `2026-02-31`) leaves the clock unseeded and every
output at zero with `valid: false`, in both runtimes. Downstream nodes gate on
`valid` rather than guessing from a zeroed date.

**No external RTC chip (DS3231 and friends) in v1.** A battery-backed module is
the right answer for an offline installation that must survive a power cut, but
it needs I²C pin config, a driver dependency, per-board wiring guidance, and its
own hardware validation. Deferred rather than half-built. Adding one later is a
fourth `timeSource` plus a seed path — the software clock, the validity guard,
and everything downstream stay as they are.

### Timezone model: a fixed offset, no DST

`timezoneOffsetMinutes` shifts UTC. There are no DST rules and no zone database.
A sketch that must follow DST has to be reflashed, or have its offset driven
from something else. Recording it here so nobody reads the NTP support as
"handles timezones."

### Preview mirrors the configured source

`rtcPreviewSnapshot` (`src/state/rtc.ts`) previews the clock the *selected
source* will produce on-device, not simply the browser's clock:

- **Manual** seeds from the entered date/time and runs forward using preview `t`
  as the stand-in for `millis()` — the same advance the board will do — and
  reports an impossible seed as fully invalid, matching `_rtcValidDateTime`.
- **NTP** shows UTC plus the configured offset, which is the wall clock
  `configTime` produces.
- **Compile Time** previews as the browser's local clock. The build stamp isn't
  knowable in the browser, and local time is its closest honest approximation.

`RtcInputBody` renders the evaluator's **published outputs** (via
`previewStore`), not a second clock read of its own, so the on-node readout
cannot disagree with what downstream nodes are seeing.

Because Manual runs forward from a seed the designer types, it doubles as the
schedule simulator: set the seed to 17:59:50, watch an 18:00 window open.

### Schedule semantics

`ScheduleTrigger` has two modes:

- **Window** — `active` is high between start and end. A window whose start is
  later than its end **wraps past midnight** (22:00 → 06:00 is one window, not
  an empty one). `progress` reports 0→1 across the window, measured across the
  wrap, so a schedule can drive a fade rather than only a hard cut.
- **Trigger** — one pulse at the start time, at most once per calendar day.

Both are gated by `dayMode` (`Every day` / `Weekdays` / `Weekends` / `Custom`
with per-day toggles) and by the `enable` input. `start` and `end` pulse on the
transitions in Window mode.

Three edge-case rules that both runtimes implement identically, because getting
them wrong produces a trigger that fires at boot or misses its day:

- **No first-frame pulse.** Trigger mode needs a *previous* sample below the
  start time to fire. With no previous sample — first frame, or the clock wasn't
  usable — it does not fire.
- **A new calendar day is treated as "the whole day lies ahead."** Otherwise a
  board that boots at 23:00 and crosses midnight would compare against
  yesterday's seconds-of-day.
- **Only a trusted sample is remembered.** When the clock isn't ready (or
  `requireSync` isn't satisfied), the stored sample is cleared, so the first
  frame after a sync is a fresh start rather than a giant apparent jump.

### Parity rules

Preview and firmware must agree on:

- **Per-field clamping before summing.** `scheduleTimeOfDay` clamps hour to
  0–23, minute and second to 0–59 *individually*, then sums — matching the C++
  generator's `intProp` bounds. Summing first and clamping the total would map
  an out-of-range saved value to a different instant in each runtime.
- Window wrap, `progress`'s span arithmetic, day gating, the `requireSync` gate,
  and all three edge rules above.
- The date arithmetic itself: civil-days-from-date, date-from-civil-days, and
  weekday derivation are ported to C++ (`rtcHelperCpp()`) against the same
  leap-year rule `src/state/rtc.ts` uses.

Deliberately different: **drift**. The browser preview reads a clock that is
correct by construction; the firmware software clock is an uncompensated
`millis()` accumulation and will drift. How much is unmeasured — see follow-ups.

### `ClockDisplay` renders the clock

Eight modes: four digital layouts (`HH:MM`, `HH:MM:SS`, 12-hour, time + date),
two analog (with and without date), and Stopwatch/Timer transports that ignore
the RTC entirely and keep their own state. It composites over an optional `base`
frame like the other Shapes & Text nodes, and publishes `seconds` + `done` so a
Timer can drive the rest of the graph instead of only drawing itself.

Unlike `Text`, whose string is known at codegen time and baked as columns, a
clock's string is assembled at runtime — so the sketch carries a glyph lookup
table. That table is **generated from the shared `src/state/font.ts` data**,
along with every string extent, rather than hand-transcribed, so preview and
firmware layout cannot drift apart.

An unwired `valid` counts as true whenever `secondsOfDay` is wired (matching the
evaluator), so the common two-wire hookup just works. With neither wired,
hardware has no clock at all: it renders `--:--`, and Graph Health warns that the
preview's browser-clock fallback will not survive a flash.

## Validation

`validateGraph.ts` blocks NTP on boards without Wi-Fi, requires an NTP server
and an SSID when NTP is selected, warns when network-enabled DMX/RTC nodes
disagree on Wi-Fi settings (one sketch has one connection — see the
[DMX/Art-Net note](dmx-artnet-input.md)), flags incomplete schedule setups, and
warns about a `ClockDisplay` with no time source wired. Each has a repair line
in the Graph Health drawer.

Wi-Fi credentials for NTP live in the same browser-local store as the Art-Net
ones and never travel with the graph — see the DMX note for the full rationale.

## Deliberately out of v1

- **External RTC hardware**, DST rules, and any timezone database.
- **Sunrise/sunset** (needs a location and an almanac) and **date-range
  schedules** ("December only") — the day gate is weekday-based.
- **A shared scene clock resource.** Per-node clocks, as above.
- **Helper time as a distinct source.** The browser clock is the preview clock;
  the helper is not consulted for time.

## Follow-ups

Tracked in `todo.md` under **Node additions worth considering → Time-of-day /
scheduled trigger support**:

- ~~The docs/release sweep (node cards, README, CHANGELOG, the per-board
  time-source capability matrix in the support matrix).~~ Done — README gained
  an *RTC clock and time-of-day scheduling* section, the Help modal gained a
  matching *RTC clock and scheduling hardware setup* section, `CHANGELOG.md`
  has an `[Unreleased]` **Added** entry, and
  [`beta-support-matrix.md`](../../release/beta-support-matrix.md) records the
  board × time-source table (including the Arduino UNO R4 WiFi gap noted
  above).
- **Hardware validation — both passes.** One RTC run (does the software clock
  hold time, and how far does it drift over hours?) and one NTP run (does a real
  board actually sync, and does `synced` flip when it does?). Until then this
  stays experimental in `docs/release/beta-support-matrix.md`; everything above
  is verified only by unit and codegen tests.
