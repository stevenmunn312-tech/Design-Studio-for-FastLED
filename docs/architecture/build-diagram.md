# Build Diagram Architecture

## Purpose

Build Diagram is a separate workspace mode that projects the logical node graph
into a physical hardware/build view. The graph remains the source of truth for
effects and firmware behaviour. Build Diagram adds project-specific physical
board identity, installation facts, calculated electrical requirements, and
wiring progress without introducing a controller node into the graph itself.
It is opened as a full-workspace mode from `View -> Build Diagram` rather than
as another permanently visible editor panel.

## Product contract

- Build Diagram is a physical/electrical projection of the graph, not a
  replacement for the graph.
- An exact physical board profile is required before controller pins or
  controller-side wires can be trusted.
- The workspace uses one large diagram canvas with pan/zoom controls rather
  than automatic pagination.
- Layout is left for hardware/build facts, centre for the diagram, and right
  for readiness, connections, BOM, and export state.
- Visibility and wiring progress are separate controls for each primary
  hardware item.
- Selection highlights the relevant hardware and wires; isolation reduces the
  diagram to the selected item, the controller, and required shared
  infrastructure.
- Requirements calculated, Signal ready, Power ready, and Build ready are
  independent states; Build ready is valid only when Signal ready and Power
  ready both pass.
- Export modes must distinguish Current view from Complete build so hidden
  items are never silently omitted from a complete reference.

## Terminology

- **Target family**: the current compile/upload target family, such as ESP32-S3.
- **Physical board profile**: the exact development-board PCB and revision used
  for real-world wiring.
- **Build Profile**: project-specific hardware selections, physical
  installation facts, advanced assumptions, optional owned-part declarations,
  visibility state, and wiring-progress state.
- **Hardware manifest**: hardware facts derived from graph nodes and their
  firmware-relevant pin usage.
- **Calculated electrical plan**: derived loads, supply requirements,
  conductors, connectors, fuses, converters, injection, and stated
  assumptions.
- **Electrical assembly**: normalized components, terminals, nets, calculated
  plan, recommendations, validation results, and BOM lines.
- **Requirements calculated**: enough reviewed hardware identity and
  installation facts exist to produce an electrical specification and shopping
  plan.
- **Signal ready**: controller-side pins, shared reference requirements, and
  required signal conditioning are valid for the selected exact board.
- **Power ready**: the actual or explicitly selected power-path parts satisfy
  the calculated electrical plan.
- **Build ready**: both Signal ready and Power ready pass.

## Safety invariants

- GPIO-valid never implies electrically safe.
- External LED load current must never be routed through a controller GPIO,
  regulator, USB connector, header current path, or board trace not reviewed
  for that load.
- Every LED output requires direct supply power and a common ground reference
  with the controller for non-isolated data links.
- Controller power is modeled as its own low-current branch, separate from LED
  load branches.
- Every independently powered LED output requires branch protection.
- Main protection is per external supply.
- Conductor and connector requirements are sized before protection selection.
- A direct overvoltage path to the controller is a blocking Power error.
- Missing reviewed rule-table inputs must keep Power unresolved; the feature
  must prefer honest incompleteness over confident guesses.

## Confidence levels

- **Manufacturer verified**: official pinout and schematic/path documentation
  reviewed.
- **Pinout verified**: header map reviewed, but the power-path behaviour is not
  fully verified.
- **Visual match only**: board appearance may help identification, but no
  wiring should be generated from it.

The generic `ESP32-S3 N16R8, 44-pin dual USB-C` profile currently remains
**Pinout verified** only. Its header map is usable, the controller power label
should be treated as `5VIN`, and GPIO35-GPIO37 must be treated as unavailable
on N16R8 modules because octal PSRAM consumes them. USB power sharing,
backfeed protection, regulator current, and jumper behaviour remain unverified.

## Data ownership

- Graph nodes remain the source of truth for controller family, pin
  assignments, dimensions, layout, chipset, and firmware configuration.
- Build Profile stores the exact board selection and physical installation
  facts separately from graph state so electrical data never leaks into node
  definitions.
- Derived results are not an editable source of truth and should be
  recalculated from Build Profile inputs plus reviewed rule/profile versions.

## Viewport contract

Build Diagram is part of the desktop viewport contract:

- Target authoring size: `1440×900`
- Supported minimum: `1280×720`
- Layout: left hardware/build panel, centre diagram workspace, right
  requirements/connections/BOM panel
- Below target width, the diagram remains the priority; side panels collapse
  and scroll independently rather than forcing the centre workspace off-screen

## Initial MVP scope

- Exact-board selection for ESP32-S3 physical profiles
- Graph-derived hardware manifest for Matrix Output, INMP441 microphone,
  button, potentiometer, and rotary encoder
- Project-specific Build Profile persistence
- Build Diagram workspace shell with board gating, hardware inventory, and
  progress state

## Initial reviewed board profiles

- `generic-esp32-s3-n16r8-44pin-dual-usbc`
  - Confidence: Pinout verified
  - Notes: user-supplied pinout image reviewed; use `5VIN` naming; GPIO35-37
    unavailable on N16R8 modules
  - Caveat: board-level power-path behaviour is still unresolved
- `espressif-esp32-s3-devkitc-1`
  - Confidence: Manufacturer verified
  - Notes: official DevKitC-1 documentation reviewed, including memory-variant
    caveats
- `seeed-xiao-esp32s3`
  - Confidence: Manufacturer verified
  - Notes: compact layout with reviewed expansion-pad GPIO exposure

## Current foundation status

- Build Diagram gating, board selection, visibility filters, isolation, and
  wiring-progress fingerprinting are implemented as of August 9, 2026.
- The centre workspace renders a deterministic SVG-backed layout with exact
  board pin labels, connection highlighting, and viewport zoom/focus controls.
- Build Profile inputs now cover exact-board choice, per-output physical
  install facts, controller power-path intent, and collapsible advanced
  assumptions for future electrical planning.
- Readiness and export state now distinguish missing planner inputs from
  reviewed signal mapping and from the still-unimplemented electrical
  assembly/BOM export layer, so unresolved work stays explicit.
- The electrical assembly/rule engine is still the next major layer and must
  build on the same Build Profile, hardware manifest, and confidence model.

The electrical assembly/rule engine remains a separate layer on top of these
foundations and must reuse the same manifest and Build Profile terminology.
