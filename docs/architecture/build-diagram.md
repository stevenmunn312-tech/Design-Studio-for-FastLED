# Build Diagram Architecture

## Purpose

Build Diagram turns the hardware already configured in the logical graph into a
beginner-readable physical wiring reference and shopping list. It is not a form
for asking the user to design the electrical system.

The graph remains the source of truth for hardware type, quantity, dimensions,
chipset, and GPIO assignment. Build Diagram adds one required piece of physical
identity: the exact controller board. Once that board is selected, the app
generates the recommended circuit, supporting parts, protection, power
distribution, and wiring.

## Product Contract

- The only required user confirmation is the exact physical controller board.
- Matrix, strip, microphone, button, potentiometer, encoder, and other supported
  hardware come from the graph; the user does not re-enter them.
- The app recommends the supplies, distribution, fuses, conductors, connectors,
  power-injection feeds, logic conditioning, resistors, and capacitors needed by
  the graph-derived hardware.
- The app does not ask what power supply or wiring the user already owns before
  producing a complete recommendation.
- A supported graph with a valid exact-board pin map produces a complete wiring
  reference without planning blockers or material-confirmation gates.
- Visibility, isolation, and Done controls affect the workspace view and
  progress only; they do not change the generated electrical design.
- Current-view exports may reflect visibility. Complete-build exports must
  always include every graph-derived item and generated supporting part.

## Data Ownership

- **Graph:** controller family, GPIO assignments, hardware nodes, LED chipset,
  pixel count, matrix dimensions, and firmware configuration.
- **Physical board profile:** exact connector positions, valid GPIO exposure,
  power-entry labels, and board confidence notes.
- **Build Profile:** exact-board selection plus view-only state such as item
  visibility and wiring progress. Legacy planning fields may still deserialize
  for backward compatibility but are not required inputs to generation.
- **Electrical plan:** derived recommendation recalculated from the graph,
  board profile, and versioned electrical rules. It is not editable source data.

## Readiness

- **Graph hardware:** supported physical hardware was found in the graph.
- **Exact board:** the selected profile matches the controller target family.
- **Wiring plan:** every supported hardware terminal has a generated route.
- **Signal plan:** GPIOs are valid and any required level shifting or series
  resistance is included automatically.
- **Power plan:** the generated supply, distribution, conductor, connector,
  fuse, capacitor, common-ground, and injection recommendations are complete.
- **Build reference:** exact board, signal plan, and power plan all pass.

Readiness describes completeness of the generated recommendation. It does not
wait for the user to buy parts or confirm that a recommended component exists.

## Wiring Invariants

- External LED load current never travels through controller GPIO, USB,
  regulator, or development-board traces.
- Every LED output is powered from fused external distribution and shares a
  ground reference with the controller-side data circuit.
- The controller uses its own low-current USB-C power path in the generated
  reference unless a future reviewed board profile explicitly requires another
  topology.
- Every generated LED feed has positive and ground conductors, branch
  protection, and a stated conductor/connector minimum.
- Every external supply feeds both positive distribution and common ground.
- Every LED data route includes a 74AHCT125-class 3.3 V to 5 V conditioning
  stage and a 330 ohm series resistor for the current ESP32-S3/WS2812 scope.
- The level shifter has connected VCC, ground, and active-low enable terminals.
- Every PSU distribution output includes a bulk electrolytic capacitor across
  positive and ground, and every LED injection site includes local ceramic
  decoupling across the same pair.
- The wiring drawing labels each PSU zone with its recommended voltage, current,
  and wattage. When FastLED current limiting is configured, it also shows the
  cap-aware operating budget and the uncapped full-white fault ceiling.
- Every INMP441 route includes VDD, ground, BCLK/SCK, WS, and SD/DOUT.
- No line may stop near a part: generated wires terminate on visible terminals.

## Generated Electrical Defaults

The current bounded WS2812-class rules use:

- 5 V nominal LED power.
- 60 mA per pixel conservative uncapped full-white load for injection count,
  conductor, connector, voltage-drop, and branch-fuse calculations.
- 20% supply-current/wattage headroom.
- A configured FastLED current limit becomes the PSU operating-capacity sizing
  basis, while the uncapped load remains visible and continues to govern branch
  wiring and protection. Without a configured limit, PSU sizing uses the
  full-white load.
- Recommended nameplate current rounds to whole amps through 10 A. Above 10 A,
  it uses 10 A increments, rounding down only when the headroom target is less
  than 2 A above the lower increment and remains above the applicable PSU
  sizing basis.
- 60 pixels per metre when the graph has no physical density metadata.
- 500 mm one-way feed cable when no reviewed physical route is available.
- 5 A maximum design load for start/end feeds and 10 A maximum for centre
  feeds that split into no more than 5 A in either direction.
- 0.4 V maximum calculated feed drop over the complete 500 mm one-way copper
  feed circuit, with the same continuous-load reserve used for fuse sizing.
- Approximately 60 A maximum recommended capacity per cap-aware PSU group.
  Injection branches and modest data routes share one PSU while their operating
  budgets fit; larger builds are split into separately fused positive-power
  zones with common signal ground and no paralleled PSU positive outputs.
- Reviewed conductor, connector, voltage-drop, derating, and fuse tables for
  each feed.

These values produce conservative branch protection and a cap-aware operating
PSU recommendation from the information the graph can know. They are stated in
the UI and exports rather than presented as questions to a beginner.

## Board Confidence

- **Manufacturer verified:** official pinout and board documentation reviewed.
- **Pinout verified:** header map reviewed; board-level caveats remain visible.
- **Visual match only:** no controller wiring may be generated.

The generic `ESP32-S3 N16R8, 44-pin dual USB-C` profile is pinout verified.
Its power-entry label is `5VIN`, GPIO35-GPIO37 are unavailable on N16R8 modules
because octal PSRAM consumes them, and its unverified USB/backfeed behaviour is
shown as a note rather than turned into a beginner planning questionnaire.

The `ESP32 DevKit v1, 30-pin (ESP-32D)` profile is pinout verified from a
user-supplied pinout image with the 15 + 15 rail count confirmed against the
physical board. It is the only classic-ESP32 profile, so it is offered for both
catalogue entries that map to that silicon (`esp32:esp32:esp32doit-devkit-v1`
and `esp32:esp32:esp32`) and never for an ESP32-S3 project. GPIO0 is absent
from its pin list on purpose — the BOOT button is that pad's only connection,
so there is nothing to wire to.

## Viewport And Export Contract

- Target authoring size: `1440x900`; supported minimum: `1280x720`.
- Left panel: generic controller-family outline, horizontal reviewed-pinout
  picker, compact graph-hardware action rows, and power summary.
- Centre: generated wiring diagram with hidden scrollbars, left-drag panning
  from empty canvas space, and cursor-centred mouse-wheel zoom.
- Right panel: idle on first load, then exact-board notes, generated readiness,
  connections, BOM, and export controls after a board or hardware selection.
- Panels scroll independently and the diagram remains the priority below the
  target width.
- SVG, print/PDF, Connections CSV, and BOM CSV outputs carry the ruleset version
  and generated readiness state.

## Current Scope

- Exact profiles for the generic ESP32-S3 N16R8 dual-USB-C board, Espressif
  ESP32-S3-DevKitC-1, Seeed Studio XIAO ESP32S3, and the 30-pin ESP32 DevKit v1
  (ESP-32D).
- WS2812-class strips and matrices, INMP441 microphones, momentary buttons,
  analog potentiometers, and rotary encoders.
- One independent conditioned data route per supported `MatrixOutput`; four
  routes consume the four channels of one 74AHCT125 and later routes add chips
  in groups of four.
- Automatic supply count, feed count, conductor, connector, fuse, distribution,
  level-shifter, resistor, capacitor, and controller-power recommendations.
- Unsupported graph hardware is reported and omitted rather than wired
  speculatively.

The formulas and source-table transcription still require independent
electrical review before the feature is presented as authoritative engineering
advice. Exports remain a low-voltage design-assistance reference and must be
checked against exact component datasheets and applicable local requirements.
