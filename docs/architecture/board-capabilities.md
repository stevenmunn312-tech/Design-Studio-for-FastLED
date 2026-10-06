# Board node and hardware capability model

Status: board/profile architecture plus microphone, PCM1802 line-in, and
player-decoder Audio and Storage capabilities implemented on `Hardware`; project
custom boards implemented · Owner: app · Updated: 2026-10-06

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

- `profileId` — exact physical board, or `custom` for the project's own board;
- `customBoard` — that board's definition, retained while a stock board is
  selected;
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

## Internal-RAM budget

An exact physical profile may declare `internalRamBudgetBytes`: the conservative
share of internal SRAM available to graph-owned allocations after the board
core, networking stack, and generator libraries have taken their baseline. It
is intentionally not the chip's headline SRAM capacity, because
`estimateFirmwareRam` counts only design-owned LED, render, simulation,
palette, and display allocations.

The profiled classic ESP32 boards currently allow 48 KiB of those allocations;
the profiled ESP32-S3 boards allow 192 KiB. When an estimate exceeds the
selected profile's allowance, Graph Health reports an error and Upload and the
compile-capacity check are disabled before a toolchain build begins. The error
names the largest internal allocation category so the first useful reduction
is visible immediately. PSRAM-backed render and field buffers are excluded
from that internal contributor list.

Profiles with no declared allowance retain the historical 40,000-byte warning
and may still run a compile-capacity check. This fallback is deliberate: an
unknown or custom board should not receive a guessed hard ceiling.

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

## Project custom boards

A project may define one board of its own: Hardware → Family → **Custom
board**. Its versioned definition (`src/build/boards/customBoard.ts`) lives in the
Board node's `customBoard` property beside `profileId: 'custom'`, so it saves,
shares, imports and undoes with the project and needs no local catalogue. It
names a reviewed build template (`src/build/boards/customBoardTemplates.ts`), the
controller power method, the default I2C pair, and two ordered headers of
slots: GPIO (Arduino number, enabled), supply (voltage, direction), ground,
reset, reserved or unconnected, each with an optional printed label.

`selectedPhysicalBoardProfile` resolves the selection through
`resolveBoardSelection` (`boardProfiles.ts`), so every consumer sees the same
board. `resolveCustomBoard` (`src/build/boards/customBoardProfile.ts`) builds the
effective profile:

- **From the template:** FQBNs, target family, processor, memory, PSRAM mode
  and internal-RAM allowance — inherited assumptions about the equivalent
  module, stated as such.
- **From the definition only:** pins, labels, power pads and the schematic
  geometry. No render, indicator, integrated hardware, peripheral starting
  point or verification is inherited; confidence is `user-defined`.
- **Pin pool:** enabled, exposed GPIOs the module supports. Boot straps, UART0
  and native USB are cautions, never handed out automatically, and every chip
  pin the header does not offer is stated unavailable, so an empty or
  exhausted pool stays empty (`boardPinPolicy.ts`).
- **Identity:** the profile ID is `custom:<definition id>:<template>`. Layout
  and name edits keep it, so they move no part; changing the template is a
  board change and retargets as one.

An unresolved definition never falls back to another board. It blocks firmware
in the deploy gate and Graph Health, the workbench draws a repair placeholder,
and board-following retargeting waits until it is repaired. The one editor
(`CustomBoardEditor.tsx`) owns a local draft and applies it through
`graphStore.applyCustomBoard` as one undo step. Only app-placed I2C pins
follow a changed default pair; explicit choices stay and are reported.

The schematic is drawn from one geometry (`customBoardGeometry.ts`) by one SVG
renderer (`customBoardSvg.ts`) for the workbench, pinout, editor preview and
Build Diagram, where terminals and power stubs come from the same pads. The
electrical plan states the declared power method, plans no converter into a
user-declared input and leaves an unchosen method unresolved. See the
[plan](../design/custom-board-pin-layouts.md).

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

- a singleton `Audio` graph capability that discovers attached microphone and
  PCM1802 line-in hardware plus the SD player's decoded-PCM tap, defaults to
  Microphone, and keeps all three selectable source kinds visible with setup
  guidance whenever the chosen Hardware provider is absent;
- explicit Audio payloads through FFT, beat, percussion, feature, spectrum,
  group, recording, preview, and firmware paths;
- decoded player PCM through FastLED's on-device analysis before I2S/DAC output,
  with the baked show envelope retained as a fallback;
- PCM1802 line-level ADC capture on ESP32-S3 through MCLK, BCLK, LRCLK, and
  DOUT, including left, right, and stereo-downmix channel selection;
- output-capable and input-capable GPIO selection;
- board-specific LED, INMP441, MAX98357A, SD SPI, and default I²C assignments
  where reviewed, plus board-aware allocation for the PCM1802's four pins;
- Wi-Fi and USB-CDC gating;
- a `Storage` graph capability that resolves SD, onboard flash, and USB
  providers from root hardware;
- flash/internal-RAM/PSRAM reporting; and
- board-aware validation, Build Diagram manifests, and code generation.

## Deferred capability abstractions

The following proposal slices remain open and must not be described as shipped:

- timed-sequence authoring beyond the existing RTC/ScheduleTrigger graph tools;
- multi-board attachment; and
- a Raspberry Pi/Linux code-generation backend.

These items are tracked in
[root todo, D-03](../../todo.md). The current two-view
component contract is documented in [`hardware-nodes.md`](hardware-model.md).
