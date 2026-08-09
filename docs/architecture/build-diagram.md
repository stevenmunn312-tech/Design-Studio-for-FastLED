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

## Electrical rules and sources

The current ruleset is `build-rules-2026.08.10-v1`. It is intentionally a
bounded MVP ruleset rather than a general mains/building-wiring design tool.

- WS2812-class design load uses the existing conservative 60 mA-per-pixel
  full-white assumption. A configured firmware current cap is displayed as an
  operating case but never reduces physical branch sizing.
- Feed voltage drop uses the complete out-and-back conductor length. The
  default limit is 5%, supply headroom is 25%, and ambient/bundle derating is
  applied before a conductor can pass.
- The conductor table is a limited low-voltage GPT automotive-wire subset from
  Littelfuse. It is applicable only to comparable chassis-style installations;
  local wiring codes, insulation temperature, enclosure, termination, and
  installation method can require a larger conductor.
- Fuse selection follows Littelfuse's 75% maximum continuous-loading guidance
  and will not choose a fuse above the selected conductor or connector limit.
- Exact injection spacing remains unresolved until the selected LED product's
  reviewed copper-path resistance/current limits exist, or the user explicitly
  confirms manual injection points. The engine never falls back to an
  "every metre" heuristic.
- ESP32-S3-to-5 V WS2812-class routes recommend a 74AHCT125-class conditioning
  stage and a 330 ohm series resistor. This is recorded as a required material
  confirmation before Signal ready can pass.

Primary references:

- FastLED power management: <https://fastled.io/docs/d3/d1d/group___power.html>
- Littelfuse Fuseology and GPT wire/fuse guidance:
  <https://www.littelfuse.com/assetdocs/littelfuse-fuseology?assetguid=c81c1a21-b903-44b6-b46d-180c48f7c3c5>
- JST VH connector reference: <https://www.jst-mfg.com/product/pdf/eng/eVH.pdf>
- Espressif ESP32-S3 datasheet:
  <https://documentation.espressif.com/esp32-s3_datasheet_en.pdf>
- TI SN74AHCT125 datasheet: <https://www.ti.com/lit/ds/symlink/sn74ahct125.pdf>
- Worldsemi WS2812 family: <https://world-semi.com/ws2812-family/>

The formulas, source-table transcription, defaults, derating, fuse policy, and
wording still require independent electrical review before the feature is
promoted as authoritative guidance. Until that review, exported material is a
design-assistance reference that must be checked against the exact parts,
manufacturer instructions, and applicable local requirements.

## Current implementation status

- Build Diagram gating, exact-board selection, visibility filters, isolation,
  independently resizable panels, and wiring-progress fingerprinting are
  implemented as of August 10, 2026.
- The centre workspace renders a deterministic physical assembly diagram with
  item/wire selection, pan/zoom/focus controls, and explicit current-view or
  complete-build export scope.
- Build Profile persists physical install facts, controller power intent,
  advanced assumptions, explicit branch-part assignments, signal-conditioning
  confirmation, visibility, and Done state.
- The UI-independent electrical planner calculates conservative output and
  whole-build load, supply headroom, feed conductor, connector minimum, and
  branch fuse, then validates selected supply/wire/connector/fuse declarations.
- Requirements calculated, Signal ready, Power ready, and Build ready are
  independent. Unverified generic-board power paths and missing injection or
  selected branch parts remain blocking rather than becoming optimistic
  defaults.
- SVG, browser print/PDF, Connections CSV, and BOM CSV exports are implemented.
  SVG and CSV output carry the readiness status and ruleset version; complete
  exports do not inherit live visibility/isolation filtering.
