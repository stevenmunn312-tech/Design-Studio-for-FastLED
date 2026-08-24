# Board node and hardware capability model

Status: board/profile architecture plus microphone and player-decoder Audio
capabilities implemented on `Hardware`; broader sources remain deferred ·
Owner: app · Updated: 2026-08-24

The Board node is the root authority for the controller a project targets. The
original proposal has now shipped far enough that this document describes the
built contract and calls out the remaining capability work explicitly.

## One board, selected by physical profile

Exactly one Board node belongs to the root graph. This matches code generation:
one project produces one sketch running on one controller, even when it drives
several LED outputs.

The Board selects a physical profile, not merely an FQBN. An FQBN can be shared
by boards with different headers—for example, classic ESP32 DevKits with 30 and
38 pins. The profile provides the physical identity needed for pin advice,
rendering, memory facts, and peripheral starting points; it carries one or more
compatible FQBNs for compilation.

The family/profile picker is available by clicking the board in the Hardware
workbench. The pinout button shows the profile's reviewed header map and
confidence information.

## Root-graph authority

Hardware exists only in the root graph. All hardware reads use root-graph
selectors, and all hardware writes target the root even while a pattern group
is open. Board, physical parts, and outputs therefore cannot be accidentally
captured inside a reusable pattern.

Creating a hardware part uses the selected profile to choose starting pins.
Changing profiles retargets Studio-owned assignments while preserving and
remembering user-owned choices per board.

## What the Board owns

The Board owns values that one firmware image can apply only once:

- `profileId` — exact physical board;
- `brightness` — global FastLED master brightness;
- `overclock` — global clockless-chipset timing multiplier;
- `powerLimit`, `volts`, and `milliamps` — the controller-wide FastLED cap;
- `psramPolicy` and `psramMode` — render-buffer memory placement; and
- `serialRoute` — Auto, Native USB, or UART bridge where the target supports
  USB CDC.

LED-output-local size, mapping, chipset, colour, routing, correction, dithering,
and supersampling remain on each output.

## PSRAM policy

`Auto` is deliberately evidence-based. It enables external render buffers only
when the exact physical profile records both PSRAM capacity and its QSPI/OPI
interface. FQBN menu choices alone do not prove the selected module actually
contains PSRAM.

`On` and `Off` are explicit overrides. Legacy boolean saves are interpreted as
explicit choices. Fixed simulation state stays in internal RAM even when render
buffers move to PSRAM, and the upload capacity display explains that boundary.

## Serial route policy

USB routing is part project policy and part desk-local evidence:

- the Board stores `Auto`, `Native USB`, or `UART bridge`;
- the selected serial port remains deployment state; and
- the helper returns the port's VID/PID, manufacturer, product, interface,
  serial number, location, and hardware id without opening it.

Auto recognizes Espressif native USB and common CP210x, CH34x, FTDI, and
Prolific bridges. Unknown identities safely select the UART build. The resolved
route is shared by serial monitoring, RTC write-back, SD-show transfer, Live
Stream, and the build defines used for that upload.

## Profiled boards versus compile targets

The application maintains related but distinct catalogues:

- physical profiles carry renders, dimensions, header pins, safety information,
  memory, and peripheral starting points; and
- compile targets carry FQBN, core/platform, flash, PSRAM menu, and build-engine
  information.

The workbench chooses the physical profile. The Upload tab's Board/Port control
owns build engine, detected port, custom compile targets, and core updates. A
profile or target being present means Studio can describe or build for it; only
the beta support matrix records end-to-end hardware support.

## Pin capability model

Where a profile contains reviewed GPIO data, pin pickers filter by the
connection's required capability: digital input, digital output, analog input,
or the appropriate bus role. They prefer free recommended header pins, expose
caution pins with their reason, and report conflicts across all root hardware.

Profiles without pin-safety data fall back to chip-level validation and say so
in the UI. This distinction avoids presenting an unreviewed pin map as exact
board knowledge.

## Outputs and attachment

LED outputs do not draw attachment edges to Board on the signal graph. With one
board, such edges would carry no information. The Hardware workbench displays
attachment automatically; the graph retains only the frame edge into each LED
output.

Multi-board projects are intentionally unsupported. That is the condition that
would make explicit attachment edges necessary again.

## Deployment state

The project owns facts that should travel with the design: physical profile,
hardware parts, GPIO assignments, and controller policies. The Upload tab owns
facts true only on the current computer: helper availability, build engine,
installed toolchain/core, selected port, compile capacity result, and running
job/log state.

Deployment now lives in the Hardware pane's Upload tab, including the embedded
Output/Serial console. It is no longer owned by an LED-output popup.

## Implemented capability sources

The Board/profile model currently provides enough authority for:

- an `Audio` graph capability that discovers attached microphone hardware,
  discovers the SD player's decoded-PCM tap, defaults a lone source, and
  remains explicitly empty without one;
- explicit Audio payloads through FFT, beat, percussion, feature, spectrum,
  group, recording, preview, and firmware paths;
- decoded player PCM through FastLED's on-device analysis before I2S/DAC output,
  with the baked show envelope retained as a fallback;
- output-capable and input-capable GPIO selection;
- board-specific LED, INMP441, MAX98357A, SD SPI, and default I²C assignments
  where reviewed;
- Wi-Fi and USB-CDC gating;
- flash/internal-RAM/PSRAM reporting; and
- board-aware validation, Build Diagram manifests, and code generation.

## Deferred capability abstractions

The following proposal slices remain open and must not be described as shipped:

- line-in hardware for external player modules that cannot expose decoded PCM;
- a Storage capability over SD, onboard flash, and USB;
- timed-sequence authoring beyond the existing RTC/ScheduleTrigger graph tools;
- multi-board attachment; and
- a Raspberry Pi/Linux code-generation backend.

These items are tracked in
[`../plans/hardware-todo.md`](../plans/hardware-todo.md). The current two-view
component contract is documented in [`hardware-nodes.md`](hardware-nodes.md).
