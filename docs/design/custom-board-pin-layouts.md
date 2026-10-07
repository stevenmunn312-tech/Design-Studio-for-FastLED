# Generic custom board with configurable pin headers

Status: implemented on `Hardware`, 2026-10-06, steps 1–8 in code and tests.
Not yet done: comparing a real custom layout against its board and compiling
and flashing representative projects on the bench, so custom boards stay
experimental in the [support matrix](../release/beta-support-matrix.md).
The built contract is in the
[Board architecture note](../architecture/board-capabilities.md#project-custom-boards).

## Outcome and scope

Add one **Custom board** option to the Hardware board picker. The user chooses
an existing supported build template, specifies the pin count on each side,
and defines each physical position. Studio generates a simple SVG board with
matching labels and wire anchors and saves the definition inside the project.

This replaces the earlier stock-board pin-swap and dynamic photographic
silkscreen proposal. The custom board uses an explicitly requested generic
schematic SVG; it needs no Blender assets or changes to stock board images.
Stock boards retain their current definitions and rendering.

The feature is feasible with moderate frontend work. The SVG removes most of
the artwork work, but arbitrary pin definitions require consistent allocation,
validation and bus-default handling. No new backend or toolchain support is
expected when using an already supported compile target.

The first release supports:

- One custom definition per project, retained when a stock board is selected.
- Independent left/right pin counts, including unequal counts or an empty side.
- GPIO definitions, printed aliases, ground, supply pins, reset, reserved pins
  and explicitly unconnected positions.
- Optional functional SDA/SCL assignments for the board's default I2C bus.
- Adding, removing, reordering and editing positions with a live SVG preview.
- Project save/reload, sharing, undo/redo, pinout display, wiring and exports.
- A reviewed initial set of ESP32/ESP32-S3 devkit build templates with known
  numeric GPIO rules. The renderer is generic; additional target families can
  join after their Arduino aliases and fixed bus rules are supported.

Named libraries of multiple custom boards, arbitrary new compiler packages,
top/bottom headers, onboard display integration and measured physical artwork
are later extensions.

## User workflow

1. In Hardware, choose **Custom board**.
2. Name the board and select **Uses the same processor/build settings as…**.
   Show the reference's target, flash and PSRAM settings so the user can choose
   the equivalent module, not merely a similar-looking board.
3. Set **Left pins** and **Right pins**. Counts include power and ground.
   Number each side from top to bottom in a clearly marked front/top orientation.
4. Define each position using a role selector. GPIO rows select the actual
   Arduino/firmware pin number and may add a printed alias such as `D4`.
   Supply rows identify voltage and input/output role separately from their label.
   New rows start undefined; the user must define them or choose Unconnected.
5. Optionally choose **Copy pin map from reference** to seed a compatible
   two-rail map, then edit it. Show the proposed counts and rows before replacing
   an existing draft; never copy guessed numbers from unresolved labels.
6. In **Default I2C bus**, keep the reference defaults or select custom SDA and
   SCL from the enabled GPIOs already defined. Show these functions beside the
   corresponding pads; entering SDA/SCL as a printed alias alone changes no bus.
7. Review the live SVG and any affected existing connections, then Apply.
   Cancel leaves the project unchanged. Edit reopens the saved definition.

Include a **Controller power** choice in setup: USB, external supply, or
unspecified. Unspecified is allowed while drafting the design, but the wiring
plan must show that the power method is unresolved. This choice describes the
method, not a verified input voltage or regulator rating.

Example: left position 4 is labelled `D4` and maps to GPIO16. Both the SVG and
wiring plan show that definition; firmware emits pin 16. Moving GPIO16 to right
position 7 moves its drawing and wire endpoint. It does not change an attached
peripheral's numerical pin assignment.

## Current integration points

| Area | What exists and what must change |
| --- | --- |
| Board profile | `src/build/boards/boardProfiles.ts` separates GPIO numbers, physical pin IDs and anchors. Extend selected-board resolution to build an effective profile from project data. Stock `boardProfileById` remains a catalogue lookup. |
| SVG preview | `src/components/Canvas/BoardPinoutPicker.tsx` already lays out pins by side. Reuse its useful layout ideas in a shared generic renderer without its board-specific decoration. |
| Diagram geometry | `src/components/BuildDiagram/controllerGeometry.ts` uses stock render IDs and measured rail geometry. Its generic fallback places signals in a column rather than at the user's defined pads. Add a geometry path driven by custom slots. |
| Workbench image | `src/components/Hardware/HardwarePane.tsx` currently renders a board image through `hardwarePartCatalog.boardImageSrc`. Add the generic SVG path and an explicit schematic sizing policy. |
| GPIO advice | `boardGpio.ts` and `uploadStore.boardGpioInfo` provide target capabilities. The custom definition must narrow the available pool to the pins the user actually exposed. |
| Allocation | `partPinAssignment.ts`, `ledPinAssignment.ts` and `pinRetarget.ts` need that same pool, including a genuinely empty pool. |
| Default buses | `boardI2cDefaults.ts` is keyed by stock profile ID; `rtcPins.ts` also resolves physical aliases. Custom identity cannot be used as the stock lookup key. SD and microphone defaults must also be checked against exposed pins. |
| Power | `electricalPlan.ts` and diagram power points assume facts about stock boards. User labels such as VIN must not imply a verified 5 V input or a particular regulator capacity. |
| Persistence | Board properties already travel through `graphStore.ts`, `workspacePersistence.ts` and `projectFileIO.ts`. New nested custom data needs its own schema validation. |
| Completion checks | `BuildDiagramWorkspace.itemFingerprint` tracks board ID and numeric pin uses, but not resolved pad positions. Include custom endpoints so a moved connection becomes incomplete. |

## Implementation sequence

### 1. Define custom-board data and separate the three identities

Add a typed module such as `src/build/boards/customBoard.ts` with a versioned,
declarative `CustomBoardDefinition`. Keep it on the root Board node.

| Field | Purpose |
| --- | --- |
| `version` | Custom-definition schema version, initially 1. |
| `id` | Stable generated ID for this project's custom board. |
| `name` | Display name; plain text only. |
| `referenceProfileId` | Supported stock template supplying compile/module facts. |
| `controllerPower` | USB, external supply, or unspecified; never inferred from a pin label. |
| `defaultI2c` | Inherit reference defaults, or an explicit SDA/SCL pair of canonical Arduino pin numbers. |
| `leftPins`, `rightPins` | Ordered arrays of slots; their lengths are the pin counts. |
| Slot `id` | Stable identity independent of its displayed row number. |
| Slot definition | Discriminated role with only its relevant fields: GPIO number and enabled status, or supply voltage/direction, or a non-GPIO role; optional display label. |

Use a selection marker such as `profileId: 'custom'` plus a separate
`customBoard` property. The picker entry, persistent custom identity and stock
build-template identity are different concepts. Do not register one mutable
global custom profile or insert the definition into Upload's `customBoards`,
which is a machine-local compile-target list.

Derive a namespaced assignment identity from the custom definition ID and
reference template. Layout/name edits keep that identity; changing the build
template changes it. A custom board and its stock reference must never share
`assignedPinsBoard` or `userPinsByBoard` entries. Keep a separate layout
fingerprint for physical changes.

Use bounded arrays and strings. Set an initial UI limit of 0–40 positions per
side, at least one position overall, and test both bounds. Keep counts derived
from the arrays, so saved counts and row definitions cannot disagree.

**Done when:** a complete definition round-trips without changing the stock
catalogue; missing custom data on an active Custom board is reported explicitly.

### 2. Resolve the effective board and its build settings

Extend `selectedPhysicalBoardProfile`, or introduce a shared resolver it calls,
to return a stock or custom profile plus resolution issues and provenance.

For a custom board:

- Generate pins and anchors from the saved slots and shared geometry.
- Resolve compatible FQBN, target family, module restrictions, flash/PSRAM facts
  and memory allowance from the selected reviewed template. Describe them as
  inherited assumptions about the equivalent module, not measured custom facts.
- Resolve controller policies through the effective board. In particular,
  `controllerSettings.ts` currently looks up the stock ID directly.
- Keep pin exposure, power positions, label text and schematic geometry owned
  by the custom definition.
- Do not inherit stock render assets, manufacturer verification, built-in
  screens, indicators, or automatic creation of integrated hardware.
- Preserve stock chip/module limitations. The current
  `boardReservedOrNotExposed` mixes electrical reservations and missing header
  pads; introduce reviewed structured constraints for the supported templates.
  Do not parse prose or blindly copy/discard that mixed field. Ambiguous
  exclusions remain blocked until classified.

Memoise effective resolution by immutable definition and template data. Audit
direct-ID reads in `BoardNodeBody.tsx`, `BoardPinoutPopup.tsx`,
`BuildDiagramWorkspace.tsx`, `validateGraph.selectedBoardProfile`,
`controllerSettings.ts`, and the board-following effect in `src/App.tsx`.
Compatibility checks must work with a resolved custom profile rather than ask
the stock catalogue to find its ID.

Keep catalogue comparison views explicitly stock. An unknown template or
unsupported saved schema produces a repairable issue, never a silent fallback
to another board. Audit default-board fallbacks such as `useBenchParts.ts` so
an invalid active custom definition cannot display the default stock board.

**Done when:** custom selection gives every consumer the same board and supported
build target, without attaching the reference board's physical peripherals.

### 3. Create shared GPIO availability and bus-default rules

Add one pure board-pin policy helper used by the editor, GPIO pickers,
allocation, retargeting and validation. Its answers combine:

1. Pins explicitly exposed and enabled in the custom definition.
2. Known Arduino pin capabilities for the compile target.
3. Hard module restrictions and role-specific caution information.
4. Current bus-aware claims from the root graph.

Do not treat every exposed pin as safe for every use. Input-only, ADC, pull-up,
boot-strapping and flash/PSRAM restrictions still apply. GPIO255 is the existing
unwired sentinel and is not a physical custom GPIO.

Distinguish **unknown stock exposure** from **explicitly zero available custom
pins**. Currently `assignPartPins` falls back to the target table for an empty
allowlist and `boardSparePins` returns unknown. Fix this for custom boards so
an exhausted or empty map never offers undeclared pins. Include
`BoardPinPicker.tsx`, LED allocation, multi-pin parts and Button Banks.

Resolve the default I2C bus from `defaultI2c`: an explicit custom SDA/SCL pair
overrides the reference defaults. Both entries remain GPIOs with an additional
bus function, rather than separate non-GPIO pin types. Validate that both pins
are distinct, enabled, exposed and capable of the target's I2C roles. Where the
target or generator fixes the bus, show and enforce those fixed pins instead of
offering an unsupported reassignment.

Devices using that bus share the same pair through the existing bus-aware
collision rules. New I2C peripherals use it as their starting assignment, and
board-owned defaults, the hardware manifest, wiring and every firmware path
resolve that same pair. Resolve other default buses from the reference template
and locate all bus pads in the custom map by canonical Arduino number. User
aliases are display text, not lookup instructions. Validate preferred LED,
microphone, amplifier, I2C and SD
pins against the exposed set before using them. Where existing firmware supports
explicit alternate pins, use a shared validated bus choice and collision rules.
Where a core fixes a bus, report the missing required pads instead of claiming
to remap it. Preview, manifest and firmware must read the same result.

**Done when:** a part can only be assigned to defined compatible pins, absent
default bus pins produce a clear resolution or error, and zero available pins
remain zero. Custom SDA/SCL selections appear on the correct pads and configure
the same bus in generated firmware.

### 4. Generate the SVG and physical endpoints from one layout

Add a pure geometry module and reusable SVG component, for example
`customBoardGeometry.ts` and `CustomBoardGraphic.tsx`. The geometry result
should include body bounds, viewBox, label locations and a slot-ID-to-pad map.

Draw a simple neutral PCB rectangle, pads on the left/right, the board name,
an orientation marker, and labels. Use a common row pitch and top alignment for
unequal rails; size the body from the longer rail. Handle 0/1-pin sides without
division errors. Do not draw a particular vendor's module or a USB connector
unless that connection is explicitly represented.

Render labels from the slot definitions as escaped SVG text. Long labels must
not overlap neighbouring pins; truncate with accessible full text or increase
the layout bounds predictably. Colour by role and indicate disabled GPIOs.
Changing definitions updates the visible silkscreen immediately.

Use the exact same geometry for visible pads and wire endpoints. Apply the same
scaling/rotation to both. Provide an SVG fragment for diagram composition and a
standalone wrapper for previews/exports; avoid placing labels in an HTML overlay
that disappears from the exported image.

Treat the drawing as schematic, not measured hardware. The workbench currently
requires physical dimensions for scaling; give custom boards an explicit nominal
footprint derived by one helper, label it as schematic, and do not use that
footprint as evidence for real clearances or physical measurements.

**Done when:** 15/15, 19/19, 22/22, unequal and single-sided examples produce
readable labels with wire endpoints at their exact pads in screen and SVG output.

### 5. Add the editor and atomic root-graph actions

Add the Custom board entry and an Edit control to `BoardNodeBody.tsx`.
A focused `CustomBoardEditor.tsx` with adjacent module CSS owns a local draft.
Board is hidden on the graph canvas, so `PROPERTY_GROUPS` alone cannot add this UI.

Implement the workflow above with accessible number fields, role selectors,
GPIO choices, optional aliases, live preview, inline validation, Apply and
Cancel. Allow explicit NC/reserved positions and repeated power/ground rails.
Show how truncating a header or removing a GPIO affects existing connections
before the user applies it. Reset edits restores the last saved definition;
starting over clears the draft explicitly.

Add dedicated create/select/update actions in `graphStore.ts`. Validate and
commit a definition in one root-graph transaction and one undo step, including
when a pattern group is open. Discarding a draft must not select Custom board
or change the upload target.

Editing labels, positions or exposed pins preserves existing peripheral
assignments. If an assigned GPIO is removed, retain the assignment and report
it as unresolved; do not silently rewire the user's project. New assignments
immediately use the new pool. Switching the reference template or switching
stock/custom follows existing board-change ownership rules, remembering manual
choices under the correct assignment identity.

Treat a default I2C bus change separately from a label or position edit. Preview
affected board-owned default connections and update them atomically on Apply.
Preserve explicit per-device pin choices; report incompatibilities with a
single fixed/shared bus instead of silently overwriting those choices.

Coordinate this with `App.tsx` target synchronisation and retargeting so an
action is not followed by a second unintended retarget. Undo must restore the
definition, selection and any intentional assignment changes together.

**Done when:** Create, Apply, Cancel, edit, count changes, stock/custom switching
and undo/redo work without losing user pin choices.

### 6. Connect all views, power anchors and exports

Use the shared resolver and graphic in the Hardware board card, pinout dialog,
editor, Build Diagram and printed sheets. Update `hardwarePartCatalog.ts` and
`BoardPinoutPopup.tsx` image assumptions rather than manufacturing a raster
render entry. Preserve stock render paths.

Extend `ControllerGraphic.tsx` and `controllerGeometry.ts` to resolve custom
signal endpoints from slot IDs, not the old generic connection column.
`hardwareManifest.boardPinForUse` and fixed-bus pad lookup must return the
custom slot. Missing pads remain visibly unresolved rather than receiving an
invented endpoint.

Resolve ground and supply endpoints from their explicit roles and voltage.
For duplicate equivalent rails choose one deterministic anchor and use it in
both drawing and routing. Missing rails cannot fall back to hardcoded stock
coordinates. A printed label of VIN alone is not a claim of safe 5 V input,
regulator current or backfeed protection.

Keep custom power-path provenance separate from pin-map provenance. The first
release can describe user-declared supply pads, but must not automatically offer
a controller buck-converter connection on an unverified custom input.
`electricalPlan.ts` currently checks particular confidence values; explicitly
handle custom/unknown power paths so they do not bypass existing checks.
Do not invent USB-C as the power method for a board that has not declared it.
Missing required power information should make the electrical plan unresolved,
without rejecting unrelated valid numerical firmware assignments.

Include each connection's resolved slot and position in wiring completion
fingerprints. A pad move invalidates affected completed connections; a label
rename alone need not invalidate an unchanged physical route. Keep this derived
so undo restores the correct completion state.

Include the generic graphic, labels, custom name, build template and
**User-defined pinout — schematic** provenance in print, SVG/raster diagram
exports and relevant parts/wiring exports. Do not claim manufacturer verification.

**Done when:** the same custom pin appears at the same position in every view
and export, including power/ground, and affected completion checks update.

### 7. Persist, validate and report unresolved definitions

Persist the definition inside Board properties through autosave, project
duplication/switching, JSON import/export, share links, recovery and starters.
Retain it when a stock board is selected. A project must work on another machine
without a local custom-board catalogue.

Validate nested data at load, Apply and resolution boundaries. Cover:

- Supported schema/template, unique slot IDs, count bounds and complete roles.
- Finite integer Arduino numbers supported by the chosen template.
- Duplicate GPIO assignments to physical slots: reject in the first release
  with a clear message; multiple GND/supply pads remain allowed. Intentional
  duplicate GPIO pads/Arduino aliases require explicit net modelling later.
- Role-specific fields, valid voltage/direction combinations, and bounded labels.
- Active assignments to absent, disabled, reserved or incapable pins.
- Required fixed bus pins and valid shared-bus use.
- Complete custom SDA/SCL pairs, distinct capable pins and invalidated bus
  selections when a GPIO is removed, disabled or changed.

Keep malformed or unsupported data recoverable and explain the repair path.
Do not silently drop an active custom definition and display stock wiring.
Render labels as text; do not accept user-authored SVG, scripts, asset URLs or
compiler expressions. Imported projects retain existing untrusted status.

Project any new structured firmware-blocking issues into both Graph Health and
`findDeployBlockingErrors`, including all applicable upload and firmware-export
routes. Keep electrical-plan-only incompleteness scoped to wiring/power readiness.
Resolve runtime compatibility against updated template data when loading; flag
newly invalid pins instead of silently remapping them.

**Done when:** valid projects round-trip, invalid data cannot produce plausible
wrong wiring, and diagnostics agree across editor, Graph Health and deploy.

### 8. Verify firmware behaviour and complete the rollout

Use focused tests beside the relevant modules, then run lint, the full suite
and the production build.

| Coverage | Acceptance cases |
| --- | --- |
| Definition/resolver | Stable identities, counts, schema rejection, stock isolation, inherited target settings, no inherited built-in hardware. |
| GPIO/defaults | Missing/exhausted/disabled GPIOs, input-only and ADC roles, module reservations, inherited/custom SDA/SCL, fixed-target bus restrictions, I2C/SPI defaults and bus-aware sharing. |
| Store/persistence | Apply/cancel, undo/redo, active group root writes, stock/custom/reference switching, ownership memory, portable project/share round trips. |
| SVG/diagram | Empty/one-pin/unequal rails and bounds; pad-label-wire alignment, power anchors, zoom/rotation, escaped text, print/SVG/raster output. |
| Existing wiring | Removing an in-use GPIO preserves its assignment and blocks the affected build; pure pad moves preserve firmware constants and stale only affected wiring checks. |
| Firmware | Normal, show/slideshow and SD-player generators use Arduino numbers, not row indices or aliases; resolved custom bus choices match generated code. |
| Regression | Stock boards and their renders, integrated peripherals, normal target selection and current saved projects retain their behaviour. |

Manually create a 15/15 ESP32 board and a 22/22 ESP32-S3 board, define their pins,
select custom SDA/SCL and add two I2C devices sharing that pair. Verify the
generated bus configuration and preservation of explicit user pin choices.
Add an LED output, move a GPIO, remove an in-use GPIO,
save/reopen, print/export, switch to a stock board and back, and exercise
Cancel/undo/redo. Compile representative projects through the existing supported
helper path; compare one real custom layout against its documented board pinout
before describing that specific wiring workflow as hardware-verified.

Update the Board architecture note, hardware documentation and Navigator when
implemented. Keep release-support claims in the beta support matrix.

**Done when:** all checks pass and a user can configure an equivalent board,
save/share it and generate firmware whose GPIO numbers agree with the diagram.

## Recommended delivery order

Implement steps 1–4 as the data, electrical-policy and rendering foundation;
then steps 5–7 as the complete user workflow; finish with step 8. Keep the entry
unavailable until saving, validation, wiring and export all use the custom map.
This is a moderate feature, not just a new picture, but its rendering needs no
per-board asset maintenance.

## Later extensions

- Multiple named custom boards, reusable local libraries and definition import/export.
- Additional target families with explicit Arduino alias and fixed-bus support.
- Intentional duplicate GPIO pads represented as one electrical net.
- Top/bottom headers, arbitrary connector groups and measured dimensions.
- Verified custom power-path specifications and integrated peripherals.
- Optional photographic artwork, if ever needed, as a separate asset workflow.

## Assessment validation

The implementation is covered by focused suites beside each layer:
`customBoard.test.ts` (definition, resolver, geometry, SVG, reference copy),
`customBoardPins.test.ts` (allocation, retargeting, diagnostics, store),
`customBoardPersistence.test.ts` (project file, share link, load),
`customBoardFirmware.test.ts` (generated pins and I2C bus),
`customBoardDiagram.test.ts` (diagram endpoints, power rails, electrical plan,
parts list) and `CustomBoardEditor.test.tsx` (Apply, Cancel, pinout). The
editor, workbench, pinout and Build Diagram were also exercised in the browser
preview. Normal, show and SD-player projects for both boards were compiled on
7 October 2026; all passed, the classic-ESP32 SD player after LVGL's pool
moved to the heap
([compile record](../reports/compile/custom-board-compile-checks.md)). No
physical-board verification has been performed.
