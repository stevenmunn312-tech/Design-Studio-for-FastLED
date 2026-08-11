# Plan - Generated Build Diagram

Status: **Corrected implementation complete; verification in progress**

## Corrected Product Contract

This contract supersedes the earlier planner-style implementation.

Build Diagram takes hardware from the graph and generates the recommended
wiring diagram and parts list for the user. It must not ask a beginner to
provide the power design, installation topology, owned supplies, fuse choices,
wire sizes, connector ratings, injection locations, or signal-conditioning
parts that the feature exists to recommend.

The only required user confirmation is the exact controller board. The graph
already supplies the remaining supported hardware and GPIO assignments.

## User Flow

1. Open **View -> Build Diagram**.
2. Confirm the exact physical controller board if it is not already selected.
3. Receive a complete generated diagram, connection table, and BOM for the
   graph's controller, outputs, sensors, and recommended supporting hardware.
4. Optionally hide, isolate, or mark hardware complete with icon controls.
5. Export the current view or complete build reference.

There is no installation questionnaire and no owned-parts validation gate in
the primary workflow.

## Required Generation

- [x] Derive controller target, hardware items, GPIO assignments, LED chipset,
  pixel count, and matrix dimensions from the graph.
- [x] Require only an exact physical board profile before drawing controller
  pins and wires.
- [x] Calculate conservative WS2812-class current from graph pixel count.
- [x] Pack injection branches and modest data routes into PSU groups with 20%
  headroom, splitting only when the practical per-PSU ceiling is exceeded.
- [x] Display each PSU zone's worst-case load prominently in the wiring drawing
  and list its recommended supply in the BOM; use whole-amp recommendations
  through 10 A and 10 A increments above it, rounding down only within 2 A of
  the lower increment and never below load.
- [x] Split large LED loads into generated fused start/end feeds capped at 5 A
  and centre feeds capped at 10 A.
- [x] Recommend conductor size, connector rating, fuse rating, and distributed
  feed locations for each output.
- [x] Include fused distribution, main protection, and common ground.
- [x] Include a separate low-current USB-C controller-power path.
- [x] Include a 74AHCT125-class level shifter and 330 ohm series data resistor
  for ESP32-S3 to 5 V WS2812-class routes.
- [x] Include a bulk electrolytic across each PSU distribution output and local
  ceramic decoupling at every LED injection site.
- [x] Include complete INMP441 VDD, ground, BCLK/SCK, WS, and SD/DOUT wiring.
- [x] Include complete graph-derived button, potentiometer, and rotary-encoder
  signal, 3.3 V where required, and ground wiring.
- [x] Generate a dynamic connections list and BOM from the calculated plan.
- [x] Keep unsupported hardware explicit rather than drawing speculative wires.

## Diagram Acceptance Criteria

- [x] Every branch fuse is connected at both ends.
- [x] Each external supply is connected to its positive distribution zone and
  the common signal-reference ground; separate PSU positive rails never join.
- [x] Every matrix or strip has connected data, positive, and ground terminals.
- [x] Every generated LED feed contains both positive and ground conductors.
- [x] Bulk and local ceramic capacitors connect across positive and ground.
- [x] The level shifter has connected input, output, VCC, ground, and enable.
- [x] The microphone has connected VDD, ground, and all three I2S signal routes.
- [x] The controller has a visible, separate USB-C power recommendation.
- [x] Wires terminate on visible component terminals rather than stopping nearby.
- [x] Hardware visibility, isolation, and Done actions use icons with accessible
  names instead of large text-button stacks.
- [x] Beginner-facing copy tells the user what to use and how to wire it; it
  does not ask them to invent the design.

## Readiness Contract

- **Graph hardware** passes when supported graph hardware exists.
- **Exact board** passes when a compatible physical board profile is selected.
- **Wiring plan** passes when supported terminals have generated routes.
- **Signal plan** passes when GPIOs are valid and required conditioning is
  automatically included.
- **Power plan** passes when the generated supply, feed, protection, conductor,
  connector, capacitor, and common-ground recommendation is complete.
- **Build reference** passes when the exact board, signal plan, and power plan
  pass.

Readiness does not depend on user-owned parts or manual material confirmation.
An invalid GPIO remains a blocker because the app cannot safely invent a
different firmware pin behind the user's back.

## Persistence And Compatibility

- [x] Preserve exact-board selection, visibility, and Done state per project.
- [x] Keep wiring-progress fingerprints tied to graph and board identity.
- [x] Continue to deserialize legacy Build Profile planning fields so existing
  project files are not broken.
- [x] Ignore legacy owned-supply, manual-injection, controller-power, and
  installation-fact fields in the generated recommendation workflow.
- [x] Recalculate derived electrical results rather than persisting them as a
  second editable source of truth.

## Verification

- [x] Unit tests cover immediate graph-derived electrical calculation.
- [x] Unit tests cover small and large matrix supply/feed recommendations.
- [x] Component tests assert every required physical wire by circuit ID.
- [x] Component tests verify exact-board-only input and absence of the rejected
  planner questionnaires.
- [x] Component tests verify icon controls, invalid-GPIO blocking, visibility,
  isolation, panel sizing, export scope, and board details.
- [x] Component tests verify 4x4 LED previews, wheel zoom, visible total-load
  labels, and BOM PSU recommendations.
- [x] Component tests verify the compact initial sidebars and horizontal
  reviewed-pinout board picker.
- [x] Full repository tests pass.
- [x] Lint and production build pass.
- [ ] Independent electrical review confirms formulas, source tables, and
  wording before authoritative-guidance claims are made.

## Non-Goals

- Asking what supplies or wiring the user already owns.
- Requiring beginners to choose fuses, conductors, connectors, injection
  points, converters, level shifters, or controller power paths.
- Treating purchase or assembly progress as an electrical-readiness blocker.
- Drawing unsupported hardware or unknown board pinouts speculatively.
- Routing external LED current through the controller board.
