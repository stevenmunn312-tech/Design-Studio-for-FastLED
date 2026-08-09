# Plan — Generated Build Diagram

Status: **approved for implementation** · Created 2026-08-10 · Planning only

## Purpose

Add a generated hardware-assembly workspace that turns the hardware already
configured in Design Studio into a practical wiring reference. The normal node
graph remains the logical effect editor. The new view is a separate physical
projection opened from **View → Build Diagram**.

This document is the implementation handoff. Work through the checkboxes in
order. Do not treat a later visual milestone as permission to skip the earlier
data-model, electrical-rule, persistence, or validation gates.

## Agreed product contract

- [ ] Keep controller-family selection, pins, dimensions, chipset, setup, and
  upload in the existing Matrix Output workflow.
- [ ] Do **not** add a Controller node to the normal graph.
- [ ] Add **View → Build Diagram** as a full-workspace mode; do not consume more
  permanent editor screen space.
- [ ] Keep the normal graph as the logical/dataflow representation and Build
  Diagram as the electrical/physical representation.
- [ ] Require an exact physical board profile inside Build Diagram before
  rendering controller pins or wires.
- [ ] Use one large pannable/zoomable diagram rather than automatic pages.
- [ ] Put hardware/build information on the left, the diagram in the centre,
  and connections/BOM/export on the right.
- [ ] Give each primary hardware item an independent visibility control and a
  separate Wired/Done control.
- [ ] Selecting an item must highlight its hardware and wires and bold its pin
  definitions.
- [ ] Isolating an item must show only that item, the controller, and required
  shared infrastructure; the Connections panel must filter to that item.
- [ ] Offer **Current view** and **Complete build** exports, defaulting to
  Complete build.
- [ ] Generate automatic recommendations for signal conditioning, protection,
  power distribution, voltage conversion, and injection.
- [ ] Report **Signal ready** and **Power ready** independently; report **Build
  ready** only when both pass.

## Electrical invariants

These are implementation invariants, not optional warnings.

- [ ] Never route external LED strip or matrix load current through a controller
  pin, regulator, USB connector, PCB trace, or controller-board header path.
- [ ] Power every LED output directly from a supply or distribution block.
- [ ] Give the controller its own low-current power branch.
- [ ] Support controller power through USB, a valid VIN/5VIN input, or a
  compatible regulator path, according to the exact board profile.
- [ ] Require a common ground reference for every non-isolated controller-to-LED
  data connection, including outputs powered by separate supplies.
- [ ] Add one branch fuse for every independently powered LED output.
- [ ] Recommend main protection for each external supply.
- [ ] Size protection to the conductor and connector rating, not just the
  theoretical LED load.
- [ ] Never invent a fuse rating when conductor or connector information is
  missing; leave the requirement unresolved.
- [ ] Insert a compatible voltage-conversion stage when a supply exceeds the
  controller or logic voltage.
- [ ] Treat any direct overvoltage path as a blocking Power error.
- [ ] Calculate power injection from voltage, LED density/pitch, physical length,
  current cap, cable length, wire gauge, and connector limits.
- [ ] Never fall back to a simplistic rule such as “inject every metre” when the
  required physical inputs are missing.
- [ ] Never allow an unresolved electrical assumption to appear as Power ready.

## Initial supported scope

### Exact ESP32-S3 board profiles

- [ ] **Generic ESP32-S3 N16R8, 44-pin dual USB-C** — AliExpress item
  `1005008201847680`; use the user-supplied pinout and label the controller pin
  as `5VIN`; confidence is **Pinout verified / power circuitry unverified**.
- [ ] Mark GPIO35–GPIO37 unavailable for this N16R8 profile because octal PSRAM
  consumes them, even if the physical headers expose them.
- [ ] Do not claim verified USB power sharing, 5VIN backfeed protection,
  regulator current, or onboard jumper behaviour for the generic board.
- [ ] **Espressif ESP32-S3-DevKitC-1** — manufacturer-verified profile, including
  the relevant board revision and memory-specific restrictions.
- [ ] **Seeed Studio XIAO ESP32S3** — manufacturer-verified compact profile.
- [ ] Queue Adafruit ESP32-S3 Feather as the next board after the MVP rather than
  expanding the initial scope before the first vertical slice works.

### Hardware items

- [ ] Multiple Matrix Output routes on one physical controller.
- [ ] Profile-backed addressable LED strips and matrices, beginning with a
  verified WS2812-class 5 V profile.
- [ ] Multiple external power supplies and per-output supply assignment.
- [ ] INMP441 microphone.
- [ ] Button.
- [ ] Potentiometer.
- [ ] Rotary encoder.
- [ ] Defer SD/audio, DMX, RTC, HUB75, clocked LED chipsets, and additional board
  families until the profile and rule systems are proven.
- [ ] Show an explicit “diagram profile unavailable” message for unsupported
  hardware; do not draw speculative wiring.

## Phase 1 — Architecture decision and terminology

- [ ] Add an architecture/design document under `docs/` recording the product
  contract and electrical invariants above.
- [ ] Define these terms consistently in code and UI:
  - **Target family** — current compile/upload target such as ESP32-S3.
  - **Physical board profile** — exact development-board PCB and revision.
  - **Build Profile** — project-specific supplies, physical measurements,
    conductor choices, visibility, and progress.
  - **Hardware manifest** — hardware facts derived from graph nodes.
  - **Electrical assembly** — components, ports, nets, recommendations, and BOM.
  - **Signal ready**, **Power ready**, and **Build ready**.
- [ ] Document that “GPIO valid” never means “electrically safe.”
- [ ] Document confidence levels:
  - **Manufacturer verified** — official pinout and schematic reviewed.
  - **Pinout verified** — reliable header map but incomplete power schematic.
  - **Visual match only** — no wiring generated.
- [ ] Record Build Diagram as part of the desktop viewport contract, including
  behaviour at `1440×900` and the supported `1280×720` minimum.

### Phase 1 gate

- [ ] Product, safety, readiness, and confidence terminology are unambiguous.
- [ ] No implementation begins with a competing interpretation of controller
  power, LED power, or the exact-board requirement.

## Phase 2 — Backward-compatible Build Profile persistence

- [ ] Add an optional, versioned `buildProfile` field to the persisted workspace.
- [ ] Keep `blankWorkspace()` free of speculative populated hardware choices.
- [ ] Preserve existing projects that have no Build Profile.
- [ ] Extend `captureWorkspace()`, cloning, project save/load, share/export, and
  import paths to retain the optional Build Profile.
- [ ] Add tests covering old workspaces, missing fields, malformed optional data,
  cloning, project switching, JSON export/import, and share payloads.
- [ ] Store the selected physical board profile ID separately from the existing
  controller-family/FQBN selection.
- [ ] Clear or invalidate an incompatible physical-board selection when the
  target family changes.
- [ ] Model supplies as an array rather than a single fixed supply.
- [ ] Give each output and controller-power branch an explicit supply or
  regulator-path assignment.
- [ ] Store per-output physical facts:
  - LED voltage.
  - LED density or pitch.
  - Physical length.
  - Feed-cable length.
  - Wire gauge.
  - Connector rating.
  - Current cap.
  - Confirmed/manual injection points.
- [ ] Store visibility state per primary hardware item.
- [ ] Store Done state with a wiring fingerprint, not as a bare boolean.
- [ ] Ensure Build Profile changes are project-specific and do not leak between
  projects through global upload preferences.

### Likely touchpoints

- `src/state/workspacePersistence.ts`
- `src/state/graphStore.ts` or a dedicated build-profile store
- `src/state/projectStore.ts`
- `src/utils/shareGraph.ts`
- Existing workspace/project persistence tests

### Phase 2 gate

- [ ] Existing saved projects load with no migration damage.
- [ ] A Build Profile survives reload, export/import, duplication, and project
  switching.
- [ ] No exact board or wiring-progress choice is stored only in transient UI
  state.

## Phase 3 — Hardware profile registry and original SVG assets

- [ ] Create a data-driven board/component profile registry.
- [ ] Do not implement one React component or node type per board.
- [ ] Define stable profile IDs independent of labels.
- [ ] For every board profile, record:
  - Target family/FQBN compatibility.
  - Manufacturer, model, revision, and aliases.
  - Memory variant constraints.
  - Physical dimensions.
  - Front-view SVG asset.
  - Pin order, labels, electrical roles, and SVG anchor coordinates.
  - Power input pins and accepted voltages.
  - Logic voltage.
  - Onboard peripherals and occupied pins.
  - Unavailable/caution pins.
  - USB and regulator caveats.
  - Confidence level and source references.
- [ ] Draw original project-owned board illustrations; do not copy arbitrary
  seller/manufacturer artwork without compatible licensing.
- [ ] Store all required assets locally and include them in the PWA/offline path.
- [ ] Add a profile-validation utility that rejects duplicate pins, duplicate
  anchors, missing SVG anchors, invalid voltage declarations, and unknown roles.
- [ ] Add component profiles for LED strip, matrix, INMP441, button, pot,
  encoder, fuse, supply, distribution block, resistor, capacitor, level shifter,
  and buck converter.
- [ ] Represent uncertain generic-board power data explicitly rather than with
  normal-looking defaults.

### Phase 3 gate

- [ ] All three initial boards pass profile validation.
- [ ] Every visible pin anchor maps to exactly one electrical terminal.
- [ ] The generic N16R8 board visibly carries its reduced-confidence warning.
- [ ] Board identification cards make the three physical layouts easy to tell
  apart before selection.

## Phase 4 — Shared graph-derived hardware manifest

- [ ] Extract/refactor the hardware-pin inventory currently centred in
  `collectPinUses()` so validation and Build Diagram consume one source of truth.
- [ ] Preserve all existing pin-conflict and board-capability behaviour.
- [ ] Include conditional hardware pins:
  - Clock pin only for clocked chipsets.
  - HUB75 pins only when eventually supported.
  - DMX512 pins only in physical DMX mode.
  - SD/audio alternatives according to selected mode.
- [ ] Give every manifest item a stable relationship to its source graph node.
- [ ] Include Matrix Output dimensions, layout, chipset, voltage, current cap,
  and route ordinal.
- [ ] Include all currently supported peripheral pins and power requirements.
- [ ] Exclude preview-only or unused hardware where firmware would not consume it.
- [ ] Ensure pin edits immediately update Graph Health, deploy validation, and
  the manifest identically.
- [ ] Add focused fixtures for one output, several outputs, and each MVP
  peripheral.

### Likely touchpoints

- `src/utils/validateGraph.ts`
- `src/state/nodeLibrary.ts`
- `src/state/uploadStore.ts`
- `src/state/boardGpio.ts`
- New hardware/build manifest module and tests

### Phase 4 gate

- [ ] No duplicate pin-derivation implementation exists.
- [ ] Changing one GPIO produces the same value in firmware configuration,
  validation, Connections, and Build Diagram.

## Phase 5 — Electrical assembly and rule engine

- [ ] Implement the assembly engine as pure, UI-independent functions.
- [ ] Produce normalized components, terminals, nets, ownership relationships,
  issues, assumptions, readiness, and BOM lines.
- [ ] Separate signal nets, logic-power nets, LED-power nets, and ground nets.
- [ ] Add the hard invariant preventing LED load from traversing a controller.
- [ ] Add controller power branches for verified USB, VIN/5VIN, and compatible
  regulated paths.
- [ ] Add multiple supplies and per-output assignment.
- [ ] Add common-ground validation for every non-isolated signal path.
- [ ] Add per-supply main-protection recommendations.
- [ ] Add mandatory per-output branch protection.
- [ ] Size fuses against configured load, wire ampacity, and connector rating.
- [ ] Insert voltage conversion when a supply cannot power the controller/logic
  directly.
- [ ] Require converter output voltage and continuous-current confirmation.
- [ ] Add compatible logic-level conditioning where required.
- [ ] Add a data-line resistor per relevant LED signal.
- [ ] Add a correctly polarized bulk capacitor at relevant LED supply inputs.
- [ ] Keep the exact component/module choice selectable when pinout differs.
- [ ] Calculate per-output and per-supply current separately.
- [ ] Replace or augment the existing one-size 60 mA estimate with reviewed
  chipset profiles while preserving a conservative fallback.
- [ ] Calculate injection from physical/electrical inputs.
- [ ] Allow manual injection overrides but retain validation against conductor
  and connector limits.
- [ ] Produce unresolved requirements instead of speculative ratings.
- [ ] Compute Signal ready and Power ready independently.

### Required invariant tests

- [ ] Reject LED power sourced from controller 5 V/3V3/USB paths.
- [ ] Reject direct 12 V-to-5VIN or similar overvoltage paths.
- [ ] Reject missing common ground on a non-isolated LED data path.
- [ ] Reject undersized wire, connector, fuse, or converter declarations.
- [ ] Keep Signal ready possible while Power remains unresolved.
- [ ] Require both states for Build ready.
- [ ] Handle two LED outputs on one supply.
- [ ] Handle two outputs on different supplies.
- [ ] Handle a 12 V LED supply plus a buck-powered 5 V controller.
- [ ] Handle a long strip with incomplete injection inputs without inventing
  injection spacing.

### Phase 5 gate

- [ ] The pure assembly fixtures produce credible connections and BOMs without
  mounting any React components.
- [ ] Every electrical invariant has a regression test.

## Phase 6 — Build Diagram workspace shell

- [ ] Add a checkable **Build Diagram** item under View.
- [ ] Add a session/UI mode that replaces the normal canvas workspace.
- [ ] Preserve graph viewport, selection, and panel state while entering/leaving.
- [ ] Support exit through the View item, a visible Back to Design action, and
  `Esc` without conflicting with existing Escape priorities.
- [ ] Implement the three-column layout:
  - Left: board, supplies, hardware list, visibility, Done, readiness.
  - Centre: SVG diagram and viewport controls.
  - Right: Connections, selected item, BOM, warnings, export.
- [ ] Make side panels independently collapsible/resizable.
- [ ] Define graceful behaviour at the supported minimum viewport.
- [ ] Show hardware inventory before exact-board selection, but no controller
  pins or physical wires.
- [ ] Provide a clear exact-board selection call to action.
- [ ] Filter the board picker to profiles compatible with the current target
  family.
- [ ] Provide comparison/identification information for each physical board.

### Likely touchpoints

- `src/App.tsx`
- `src/state/uiStore.ts`
- `src/components/MenuBar/MenuBar.tsx`
- `src/components/Layout/`
- New `src/components/BuildDiagram/` area
- View/menu and layout tests

### Phase 6 gate

- [ ] Entering/leaving Build Diagram loses no graph state.
- [ ] No wire appears before an exact board is selected.
- [ ] The shell remains operable at `1280×720`.

## Phase 7 — Deterministic SVG diagram and routing

- [ ] Render components as SVG with accessible names and descriptions.
- [ ] Use a deterministic layout so small property changes do not scramble the
  entire diagram.
- [ ] Default placement:
  - Controller on the left/centre.
  - Signal conditioning between controller and outputs.
  - Outputs and peripherals to the right.
  - Supplies/distribution along the bottom.
- [ ] Route wires orthogonally through reserved signal, ground, and power lanes.
- [ ] Draw junction dots only for real electrical connections.
- [ ] Avoid visual crossings where routing can reasonably separate them.
- [ ] Add pan, zoom, Fit all, Fit visible, Focus selected, and Reset layout.
- [ ] Support a large diagram canvas without a hard hardware-count limit.
- [ ] Render only the necessary detail at the current zoom level if performance
  requires progressive detail.
- [ ] Keep the controller visible whenever a visible item needs controller pins.
- [ ] Make visibility parent-aware:
  - Hiding an output hides its private branch, fuse, resistor, conditioning,
    injection, and wires.
  - Shared infrastructure remains while another visible device uses it.
  - Required safety items cannot float without their parent.
- [ ] Add Show all, Hide completed, Show unfinished only, and Isolate selected.
- [ ] When only the microphone is shown, render only controller + microphone +
  required connections and filter Connections accordingly.
- [ ] Bold selected-item pin definitions on the controller and in the right panel.
- [ ] Highlight selected wires and dim unrelated visible wires.

### Phase 7 gate

- [ ] No dangling wire or floating accessory appears under any visibility state.
- [ ] A complex multi-output fixture can be reduced to one clear item in one
  action.
- [ ] Diagram selection and Connections selection stay synchronized.

## Phase 8 — Wiring progress and readiness workflow

- [ ] Add a visibility eye and a distinct hollow-circle/green-check Done control
  to every primary build item.
- [ ] Keep visibility and Done independent.
- [ ] Do not automatically hide an item merely because it was marked Done.
- [ ] Persist progress per project.
- [ ] Compute a wiring fingerprint from all material inputs, including:
  - Physical board profile.
  - GPIO assignments.
  - Supply and voltage path.
  - Fuse/protection configuration.
  - Signal conditioning.
  - Connector and conductor choices.
  - Injection configuration.
- [ ] Clear Done automatically when its fingerprint changes.
- [ ] Explain the invalidation with “Wiring changed—recheck this connection” and
  identify the material category that changed where practical.
- [ ] Leave unaffected items completed.
- [ ] Show progress counts and Signal/Power/Build readiness summaries.
- [ ] Prevent unresolved warnings from being mistaken for completion.

### Phase 8 gate

- [ ] No stale Done marker survives a material wiring change.
- [ ] Reloading a project restores legitimate progress and visibility.

## Phase 9 — Connections, BOM, and exports

- [ ] Generate Connections from the same normalized nets used by SVG rendering.
- [ ] Filter Connections to visible/selected hardware as agreed.
- [ ] Generate BOM categories:
  - Configured hardware.
  - Required protection.
  - Recommended components.
  - Power distribution.
  - Conductors/connectors.
  - Unresolved selections.
- [ ] Distinguish generic specifications from exact selected product/module
  profiles.
- [ ] Add SVG export.
- [ ] Add print styling for browser Save as PDF before adopting a PDF library.
- [ ] Add BOM CSV and connection-table CSV export.
- [ ] Add explicit export mode selection:
  - **Current view** respects eye/isolation state.
  - **Complete build** includes all configured hardware and is the default.
- [ ] Ensure Complete build cannot silently omit currently hidden items.
- [ ] Stamp unresolved exports as **Draft — unresolved build requirements**.
- [ ] Include board confidence and material assumptions in exported reference
  documents.

### Phase 9 gate

- [ ] Live SVG, exported SVG, Connections, and BOM describe the same assembly.
- [ ] Current-view and complete-build exports behave exactly as labelled.

## Phase 10 — Verification and release

- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Add focused unit tests for profile validation, manifest derivation,
  electrical rules, readiness, fingerprint invalidation, and export filtering.
- [ ] Add component tests for menu entry, board gating, visibility, Done,
  selection emphasis, and responsive panels.
- [ ] Review each exact board against its source documentation and physical pin
  order before marking it supported.
- [ ] Keep the generic N16R8 board at reduced confidence until its power
  schematic is independently verified.
- [ ] Validate the MVP diagram with at least:
  - One WS2812-class output.
  - Two outputs on one supply.
  - Two outputs on different supplies.
  - INMP441 + LED output.
  - Button, pot, and encoder.
  - 12 V output with a buck-powered controller.
  - Long strip with calculated injection.
- [ ] Verify keyboard navigation, focus visibility, screen-reader labels, colour
  contrast, and zoom usability.
- [ ] Verify all board/component assets work offline after PWA installation.
- [ ] Update Help, release notes, `docs/NAVIGATOR.md`, and the beta support matrix.
- [ ] Document unsupported nodes and the process for adding reviewed profiles.

### Final release gate

- [ ] Existing saved projects remain safe.
- [ ] Exact-board selection is mandatory for physical wiring.
- [ ] No supported fixture can route LED load through a controller.
- [ ] Every supported electrical recommendation identifies its assumptions.
- [ ] Signal ready, Power ready, and Build ready cannot contradict validation.
- [ ] Complex diagrams remain usable through visibility, isolation, selection,
  pan, and zoom.
- [ ] Current-view and complete-build exports are trustworthy.
- [ ] Only reviewed board/device combinations are promoted as supported.

## Follow-up expansion checklist

Do not start these until the MVP release gate is complete.

- [ ] Adafruit ESP32-S3 Feather profile.
- [ ] Additional ESP32-S3 physical boards and revisions.
- [ ] Other ESP32 target families.
- [ ] Clocked APA102/HD108-style outputs.
- [ ] SD card and I2S audio hardware.
- [ ] RTC/I²C modules and shared-bus modelling.
- [ ] DMX512 transceiver wiring.
- [ ] HUB75 ribbon/panel power modelling.
- [ ] Additional sensors and controller inputs.
- [ ] Optional manual component placement with Reset layout.
- [ ] Optional verified product/SKU library for BOM items.

## Handoff notes and principal risks

- The current selected board is largely a compile target. Do not confuse it with
  an exact physical PCB.
- The generic N16R8 board’s header map is usable, but its power-sharing circuitry
  is not verified. Keep that uncertainty visible.
- Accurate board and component assets are an ongoing maintenance obligation.
- One master diagram can become physically large. Visibility, isolation,
  deterministic spacing, and rendering performance are core requirements, not
  polish tasks.
- Power calculations depend on user-supplied physical data. Honest unresolved
  states are preferable to confident-looking guesses.
- Reuse existing validation and power logic where valid, but do not preserve a
  simplifying assumption if it conflicts with the agreed multi-supply physical
  model.
- Keep the implementation profile-driven so adding hardware is primarily a
  reviewed data/asset task rather than another branch of UI logic.

