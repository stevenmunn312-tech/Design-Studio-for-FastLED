# Plan — Ease variants and scheduled triggers

Status: **proposed** · Researched 2026-07-26

This plan covers items 1 and 4 from the “Node additions worth considering”
section of `node-todo.md`:

1. more `Ease` curve variants; and
2. time-of-day / scheduled triggers.

They should not share a pull request. The Ease work is a small, self-contained
node enhancement. Scheduled triggers are a new timekeeping capability that
needs a source of trustworthy civil time, target-aware code generation,
credential handling, and hardware validation before the node itself is useful.

## Recommendation

- Ship the Ease expansion first as one focused PR.
- Treat scheduling as an initiative with a short architecture spike followed
  by independently reviewable PRs.
- Do not ship a browser-only Schedule node that silently becomes false or uses
  uptime in firmware. Preview and firmware must have explicit, visible time
  sources and must fail closed when time is unknown.
- Support NTP on ESP32-family and ESP8266 targets first. Add a battery-backed
  DS3231 provider later for offline installations and non-network boards.
- Keep Wi-Fi credentials out of node properties, project files, share links,
  generated-code views, reports, and logs.

## Research findings

### FastLED easing

FastLED currently exposes two related easing families:

- The long-standing `lib8tion` API contains `ease8InOutQuad`,
  `ease8InOutCubic`, `ease8InOutApprox`, their 16-bit counterparts, and the
  `triwave8` / `quadwave8` / `cubicwave8` wave shapers. The approximate curve
  is documented as a rough cubic-shaped curve that trades a small error for
  much faster execution on AVR.
- The newer `fl/ease.h` API exposes accurate 8-bit and 16-bit in, out, and
  in-out variants for quadratic, cubic, and sine families through
  `fl::ease8()` / `fl::ease16()` and `fl::EaseType`.

FastLED's own `fl/ease.h` source says the older `lib8tion` functions are
performance-tuned and not mathematically accurate. That matters here because
the existing persisted values `inOutQuad` and `inOutCubic` generate calls to
the legacy functions. Changing those IDs to the newer functions would alter
existing projects, so this plan keeps their meaning stable.

Primary references:

- [FastLED easing functions](https://fastled.io/docs/d4/dfe/group___easing.html)
- [FastLED `ease8InOutApprox`](https://fastled.io/docs/d4/dfe/group___easing_ga2f3ddd2c392eec959a15d86d9c014388.html)
- [FastLED modern `fl/ease.h` API](https://fastled.io/docs/db/d19/ease_8h.html)
- [FastLED `fl/ease.h` source](https://fastled.io/docs/db/d19/ease_8h_source.html)

### Civil time on controllers

Uptime (`millis()`) is not civil time. On ESP32, the system clock can be
synchronized with SNTP and read using standard C time functions. Its internal
RTC survives reset/sleep but not loss of power, so an installation cannot rely
on it after a cold boot unless it resynchronizes or has a battery-backed clock.
Espressif also requires a timezone rule before `localtime()` can return correct
local civil time.

The browser can format a timestamp in an IANA timezone with
`Intl.DateTimeFormat`. IANA timezone data changes when governments change
offset or daylight-saving rules, so the firmware-side timezone data must be
versioned rather than reduced to a fixed UTC offset. POSIX timezone strings are
compact, but IANA documents that they cannot faithfully represent every
timezone rule.

For offline hardware, Adafruit's RTClib supports DS3231 over I2C, reports loss
of power, and reads/writes calendar time. AceTime and AceTimeClock are viable
spike candidates because they combine IANA-zone conversion with NTP and
DS3231-backed clock abstractions across Arduino-class platforms. They must be
measured before adoption: a timezone engine and its dependency/install path
are not free on small AVR targets.

Primary references:

- [Espressif system time and SNTP](https://docs.espressif.com/projects/esp-idf/en/v4.4.2/esp32/api-reference/system/system_time.html)
- [Espressif Wi-Fi provisioning](https://docs.espressif.com/projects/esp-idf/en/v5.1.5/esp32/api-reference/provisioning/wifi_provisioning.html)
- [Arduino ESP32 Wi-Fi API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html)
- [MDN `Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [IANA notes on POSIX timezone limitations](https://www.iana.org/time-zones/theory)
- [Adafruit RTClib DS3231 example](https://github.com/adafruit/RTClib/blob/master/examples/ds3231/ds3231.ino)
- [AceTimeClock clock-source classes](https://bxparks.github.io/AceTimeClock/html/annotated.html)

---

## Feature 1 — More Ease curves

### User-facing contract

Keep the existing property IDs and behavior:

| Persisted `easeType` | UI label | Firmware behavior |
| --- | --- | --- |
| `inOutCubic` | Ease · Cubic | Existing legacy `ease8InOutCubic` |
| `inOutQuad` | Ease · Quad | Existing legacy `ease8InOutQuad` |
| `triwave` | Triangle Wave | Existing `triwave8` |
| `quadwave` | Quad Wave | Existing `quadwave8` |
| `cubicwave` | Cubic Wave | Existing `cubicwave8` |

Add these IDs:

| New `easeType` | UI label | Intended firmware primitive |
| --- | --- | --- |
| `linear` | Linear | Identity |
| `inOutApprox` | Ease · Fast Approx | `ease8InOutApprox` |
| `inQuad` | Ease In · Quad | `fl::ease8(fl::EASE_IN_QUAD, …)` |
| `outQuad` | Ease Out · Quad | `fl::ease8(fl::EASE_OUT_QUAD, …)` |
| `inCubic` | Ease In · Cubic | `fl::ease8(fl::EASE_IN_CUBIC, …)` |
| `outCubic` | Ease Out · Cubic | `fl::ease8(fl::EASE_OUT_CUBIC, …)` |
| `inSine` | Ease In · Sine | `fl::ease8(fl::EASE_IN_SINE, …)` |
| `outSine` | Ease Out · Sine | `fl::ease8(fl::EASE_OUT_SINE, …)` |
| `inOutSine` | Ease In/Out · Sine | `fl::ease8(fl::EASE_IN_OUT_SINE, …)` |

Do not add `squarewave8`: it is discontinuous and belongs with waveform or
threshold behavior, not easing. Do not switch the node to 16-bit output in this
change; that would be a precision/behavior change for existing graphs.

Unknown saved values must retain the current fallback to `inOutCubic`.

### Implementation

1. Extract the preview-side curve dispatch from `graphEvaluator.ts` into a
   small `src/state/easing.ts` module. Keep clamping and normalized 0–1 input
   in one place.
2. Add the new options to `PROPERTY_META.easeType` and their display names to
   `BUNDLED_TITLES.Ease` in `nodeLibrary.ts`.
3. Extend the `Ease` codegen case in `cppGenerator.ts`.
   - Keep the five existing branches byte-for-byte compatible.
   - Use the legacy global function for `inOutApprox`.
   - Use the modern `fl::ease8` dispatcher only after the compile spike below
     confirms it is included by `<FastLED.h>` on the project's minimum FastLED
     version and target set.
4. Mirror FastLED's byte input convention in preview: clamp to 0–1, quantize
   to 0–255, evaluate, and normalize back to 0–1. That gives predictable
   preview/firmware parity for the new modes. Do not change quantization for
   the five existing modes in this PR unless golden tests prove the rendered
   result is unchanged.
5. Update the node description/tooltip so users can distinguish:
   - an easing curve, which maps one 0→1 interval; and
   - a wave shaper, which folds the interval into a rise and fall.
6. Regenerate the Ease node reference card and update the Help node reference
   if the generator does not derive the option list automatically.

### Compatibility spike

Before merging the modern variants, compile a minimal sketch that calls
`fl::ease8` for:

- ESP32-S3 through fbuild;
- ESP8266 through arduino-cli; and
- Arduino Uno through arduino-cli.

Record the resolved FastLED version. If any supported install can lack
`fl/ease.h`, choose one of these explicit outcomes rather than a silent
fallback:

1. establish and enforce a project-wide minimum FastLED version; or
2. emit small local integer helpers for the new directional curves.

The first option is preferred because generated code should use the FastLED
primitive the node advertises. If the version floor changes, update helper
installation, release documentation, and compile CI together.

### Tests

- Unit-test every mode at 0, 0.25, 0.5, 0.75, and 1.
- Assert all easing modes are bounded and monotonic over every byte input.
- Assert in/out pairs are complementary within one byte.
- Add golden cases around the three branches of `ease8InOutApprox`
  (`63/64`, midpoint, and `192/193`).
- Assert wave modes return to zero at the end while easing modes end at one.
- Assert codegen emits the intended function/enum for every property value.
- Assert an unknown `easeType` still emits cubic.
- Assert the node select and bundled title expose every new label.
- Run the normal `lint`, `test`, and `build` gates plus the three compile
  checks above.

### Done when

- Existing saved Ease nodes render and generate the same code as before.
- Every new option has preview and firmware coverage.
- Generated sketches compile on the three representative architecture paths.
- The node reference and description explain curve versus wave behavior.

---

## Feature 4 — Time-of-day / scheduled triggers

### Scope

The first useful release should support recurring weekly windows such as:

- active every day from 22:00 to 06:00;
- active on Saturday and Sunday;
- start a show at 18:30 on selected days.

It should not initially implement calendar dates, holidays, sunrise/sunset,
cron expressions, remote control, or cloud scheduling.

### Graph model

Add two nodes, not one hidden global clock:

#### `WallClock` input node

Outputs:

- `datetime` — a new `datetime` port type carrying a valid local civil-time
  sample;
- `valid` — true only after the selected source has trustworthy time;
- `hour`, `minute`, `second`, and `weekday` — scalar outputs for advanced
  graphs and easy inspection.

Properties:

- `source`: `ntp` initially; `ds3231` when the offline phase lands;
- `timezone`: an IANA zone ID, defaulted from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`;
- source-specific hardware settings, shown only when relevant.

Treat `WallClock` as a scene-level singleton, like other hardware inputs. A
clock embedded inside a saved pattern group would create hidden hardware and
credential requirements, so grouping should leave it in the parent graph and
expose the `datetime` boundary input.

#### `Schedule` signal node

Input:

- `datetime`.

Outputs:

- `active` — true while the recurring window is open;
- `started` — one-frame pulse on inactive→active;
- `ended` — one-frame pulse on active→inactive;
- `valid` — mirrors whether the input is trustworthy.

Properties:

- `daysMask`: seven selected weekdays;
- `startMinute`: integer 0–1439;
- `endMinute`: integer 0–1439;
- `allDay`: explicit boolean.

Use a custom node body with weekday chips and native time inputs. Persist
integers, not locale-formatted strings.

### Schedule semantics

Put the recurrence calculation in a pure shared TypeScript helper and mirror
it once in generated C++.

- `allDay` means all selected civil days.
- Without `allDay`, equal start/end times are invalid rather than ambiguously
  meaning zero or 24 hours.
- A same-day window is active when the current weekday is selected and
  `startMinute <= now < endMinute`.
- An overnight window belongs to the day on which it starts. For Friday
  22:00→02:00, it is active late Friday when Friday is selected and early
  Saturday because the previous day was selected.
- Time is sampled at one-second resolution. Boundary comparisons remain
  minute-based in the first release.
- Invalid/unsynchronized time fails closed: `valid=false`, `active=false`,
  and no edge pulse.
- The first valid sample establishes state without emitting `started` or
  `ended`. This prevents a boot or late NTP sync inside an active window from
  masquerading as a boundary crossing; consumers that need immediate state
  use `active`.
- A forward clock correction that crosses a boundary emits at most one pulse.
  A daylight-saving fall-back can revisit a local interval; document that
  civil-time windows may therefore occur twice unless a later
  “once per civil date” mode is added.

### Timekeeping architecture

Use UTC epoch time as the provider boundary and perform timezone conversion in
one shared clock service. The `datetime` value supplied to Schedule contains
the already-derived local weekday and second-of-day plus a validity bit. This
keeps every Schedule node on one timezone and avoids repeatedly mutating the C
library's process-global `TZ` setting.

For browser preview:

- sample `Date.now()` independently of animation `tick`;
- use `Intl.DateTimeFormat(..., { timeZone })` to derive local components;
- inject or wrap the wall-clock reader in tests so schedule tests never depend
  on the developer machine's timezone.

For firmware:

- add the selected target FQBN/board capabilities to `generateCpp` and
  `generateShowSketch` options; codegen currently knows only whether PSRAM is
  allowed;
- initialize the time provider once in `setup()`;
- poll it once per render loop, not once per Schedule node;
- retain the last synchronized UTC time using the platform clock while the
  network is temporarily unavailable;
- return invalid after cold boot until the first trustworthy source sample;
- never substitute `millis()` for a missing wall clock.

### Phase 0 — architecture and dependency spike

Build small compile sketches before fixing the dependency choice.

Compare:

1. Espressif `configTime()`/`time()` plus a compact timezone conversion layer;
2. AceTime 4.x for IANA conversion, with AceTimeClock considered for the later
   DS3231 provider.

Measure flash/RAM and compile success on ESP32-S3, ESP8266, and Uno. The spike
must answer:

- Can a single selected IANA zone be linked without carrying the full zone
  database?
- Which IANA tzdb release is embedded, and how will it be updated?
- Does the library compile through both fbuild and arduino-cli?
- What backend changes are needed to pin/install/vendor it?
- Is the cost acceptable on constrained boards, or should scheduling be
  compatibility-blocked there?

Prefer a versioned IANA-backed solution. Use a POSIX approximation only if its
limitations are explicit in the UI and test matrix.

Write the accepted result as an ADR before the feature leaves experimental
status.

### Phase 1 — data type, nodes, and deterministic preview

1. Add `datetime` to port colors, compatibility rules, `PortValue`, group port
   signatures, help/reference rendering, and connection tests.
2. Add `WallClock` and `Schedule` definitions and custom node bodies.
3. Implement and exhaustively test the pure recurrence helper, including
   week wrap, overnight windows, leap-day dates, and DST transitions for
   representative zones.
4. Add evaluator state for `started`/`ended`, namespaced like the existing
   Clock and Trigger state.
5. Mark the feature experimental and block firmware deployment until a
   supported provider is selected. Do not call a browser-only preview done.

### Phase 2 — ESP NTP provider and target-aware codegen

1. Pass the selected FQBN into normal and show codegen.
2. Add an explicit board capability such as `wallClock: ['ntp']`; initially
   enable it only for compile- and hardware-validated ESP32-family/ESP8266
   targets.
3. Emit one time-service block and one local-time sample per frame even when
   multiple Schedule nodes exist.
4. Mirror recurrence and pulse semantics in generated C++.
5. Extend `validateGraph` / Graph Health:
   - missing WallClock input;
   - multiple WallClock nodes;
   - invalid equal-time window;
   - unsupported provider/board;
   - missing device credentials;
   - timezone-data mismatch or unsupported zone.
6. Ensure show-controller codegen and flattened groups share the same service
   rather than instantiating clocks per pattern.

### Phase 3 — credential provisioning

Credentials are deployment state, not creative graph state.

1. Add a “Configure device network” step to the hardware workflow. Keep the
   password in component/session memory only and render it as a password field.
2. Reuse the helper's existing provisioner pattern: flash a temporary,
   target-specific provisioner that writes credentials to the controller's
   nonvolatile Wi-Fi store, confirm connection without printing the password,
   then flash the final sketch.
3. Redact SSID/password from helper logs where practical, never include the
   password in status objects, and remove temporary source/build artifacts
   after the operation.
4. Add “Forget network on device” as an explicit destructive device action
   with confirmation.
5. Generated firmware reads provisioned credentials and reconnects with a
   bounded, non-blocking backoff so LED rendering continues during an outage.
6. Exported `.ino` files contain a clear provisioning requirement and no
   credential literals.

If a safe cross-engine provisioner is not practical, stop here and require a
separate, documented device-provisioning workflow. Do not fall back to storing
the password in the graph.

### Phase 4 — offline DS3231 provider

1. Add `ds3231` as a WallClock source with board-aware I2C pin selection and
   GPIO conflict validation.
2. Install/vendor and pin the chosen RTC dependency for both build engines;
   update `THIRD_PARTY_NOTICES.md`.
3. Add a “Set RTC from this computer” hardware action. This is an explicit
   device write and should show the timestamp/timezone before proceeding.
4. Detect oscillator-stop/lost-power and fail closed until the clock is set.
5. Store/read UTC in the RTC and apply the same versioned timezone conversion
   as NTP. Do not store ambiguous local time in the chip.

### Tests and validation

Automated coverage:

- connection/type tests for `datetime`;
- schedule truth tables for every weekday and same-day/overnight/all-day
  window;
- invalid→valid, forward-correction, and edge-pulse state tests;
- DST spring-forward and fall-back fixtures against the pinned timezone data;
- evaluator/codegen parity fixtures at every boundary;
- generated-code tests for one and many Schedule nodes;
- normal graph, group, generative-show, and music-show codegen paths;
- validation tests for unsupported boards and missing configuration;
- backend tests proving secrets do not appear in logs, responses, cached
  project data, or exported sketches;
- dependency install tests on all three host OS families;
- compile checks on each enabled board family.

Hardware validation:

- cold boot with no network: LEDs continue rendering and schedule is invalid;
- first sync inside and outside an active window;
- network loss and recovery;
- power cycle after provisioning;
- schedule crossing midnight and week wrap;
- deliberate clock correction across a boundary;
- DS3231 present, absent, and lost-power states;
- firmware size/RAM measurement;
- dated support-matrix evidence before promoting any provider/board pair.

### Done when

- The graph makes its civil-time source explicit.
- Preview and firmware agree on weekly-window and pulse semantics.
- Unknown time is visible and fails closed.
- No network secret is persisted or exported with a project.
- At least one NTP target has dated hardware evidence.
- Offline RTC support, if shipped, detects and reports unset/lost time.
- Help, node cards, setup guidance, third-party notices, and the beta support
  matrix match the actual validated scope.

## Proposed PR sequence

1. `feature/ease-variants`
2. `docs/wall-clock-adr-and-spike`
3. `feature/datetime-and-schedule-preview` (experimental, deploy-blocked)
4. `feature/esp-ntp-clock-codegen`
5. `feature/device-network-provisioning`
6. `feature/ds3231-clock` (optional follow-up)
7. `docs/scheduled-trigger-hardware-validation`

Each PR should leave `lint`, `test`, and `build` green. PRs that add or change
firmware dependencies must also run backend dependency/install coverage and
the representative board compile matrix.
