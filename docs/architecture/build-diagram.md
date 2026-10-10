# Build Diagram Architecture

Scope: `Hardware`. This document owns the generated-wiring contract, including
the requirements formerly kept in the Build Diagram handoff. Independent
electrical verification remains [HW-14 in the active backlog](../../todo.md).

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
- A configured battery pack replaces the fixed DC source. Exact catalogue
  parts declare cell chemistry, pack-electronics functions, converter terminals
  and isolation; the diagram does not infer these properties from part names.
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

### Persistence And Compatibility

Exact-board selection, visibility and Done state are saved per project.
Wiring-progress fingerprints remain tied to graph and board identity. Legacy
Build Profile planning fields may deserialize, but owned supplies, manual
injection, controller-power choices and installation facts are ignored by the
generated recommendation workflow. Derived electrical results are recalculated
rather than stored as a second editable source of truth.

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
An invalid GPIO remains a blocker; generation cannot silently change a firmware
pin to make the drawing pass.

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
- In a battery build, the protection board's protected negative is common
  ground. Only the protection board touches the cell negative. Pack positive
  lands on the cell-positive pad, and the fused protected positive becomes
  the `+BATT` source for converters and charging hardware.
- Every LED data route includes a 74AHCT125-class 3.3 V to 5 V conditioning
  stage and a 330 ohm series resistor for the current ESP32-S3/WS2812 scope.
- The level shifter has connected VCC, ground, and active-low enable terminals.
- Every PSU distribution output includes a bulk electrolytic capacitor across
  positive and ground, and every LED injection site includes local ceramic
  decoupling across the same pair.
- The wiring drawing labels each PSU zone with its recommended voltage, current,
  and wattage, its main fuse and its trunk gauge, all sized for full white.
  A configured FastLED current limit appears on its output card as a running
  limit only.
- Every I2S MEMS microphone route includes supply, ground, BCLK/SCK, WS and
  SD/DOUT, plus a ground symbol on the channel-select pad that picks the left
  slot. Each of those pads is found by the name its own module prints, because
  the three catalogued modules use three different silkscreen orders and print
  supply as `VDD` or `3V` and channel select as `L/R` or `SEL`.
- No line may stop near a part: generated wires terminate on visible terminals.

### Where a wire descends

Between the controller and the series resistors there is one right-hand descent
band, and every wire in it must own its vertical.

- **Bus wires** — LED data — rank first, from `RIGHT_CONTROLLER_LANE_X`. They
  stop above y~520, so they may hug the board past the USB block.
- **Control wires** — every peripheral module's signals — rank after them, and
  never nearer than `CONTROL_CORRIDOR_MIN_SLOT` (x=296). A control wire carries
  on down to the module lanes, straight through the USB block that ends at
  x=291, so the floor is clearance rather than tidiness.

Ranking control wires *after* the bus family is what keeps the two from sharing
a vertical. Interleaving both families by pin height, which the shared lane map
used to do, put a right-rail control pin sitting above every output pin in slot
0 and sent it down through the bus band.

Modules themselves all live in one wrapping peripheral row with their pads along
the bottom edge. A row's control lanes sit below it, ordered by pad x so no
climb crosses another lane's run, and deep enough to clear that row's own
stub captions — including the lower channel-select caption, which is charged
only to the rows that carry one.

## Generated Electrical Defaults

The current bounded WS2812-class rules use:

- 5 V nominal LED power.
- 60 mA per pixel conservative uncapped full-white load for injection count,
  conductor, connector, voltage-drop, and branch-fuse calculations.
- 20% supply-current/wattage headroom.
- Every recommendation, supply included, is sized for the uncapped full-white
  load. A configured FastLED current limit lowers running power and heat but
  never shrinks the hardware, because a limit that is changed, cleared or never
  flashed must not overload a supply that was sized for it. (Until 2026-09-27
  the supply, though not the wiring, was sized from the limit.)
- Recommended nameplate current rounds to whole amps through 10 A. Above 10 A,
  it uses 10 A increments, rounding down only when the headroom target is less
  than 2 A above the lower increment and remains above the full-white load.
- 60 pixels per metre when the graph has no physical density metadata.
- 500 mm one-way feed cable when no reviewed physical route is available.
- 5 A maximum design load for start/end feeds and 10 A maximum for centre
  feeds that split into no more than 5 A in either direction.
- 0.4 V maximum calculated feed drop over the complete 500 mm one-way copper
  feed circuit.
- Fuse and wire are coordinated: a fuse carries its load at no more than 75%,
  and the wire is then sized to carry that fuse's standard rating, not just
  the load. Sizing the wire to the load alone could leave no standard fuse
  between the load's minimum and the wire's ampacity.
- Conductor ampacities come from one table, NFPA 70 (2023) Table 310.16,
  90 C copper, not more than three current-carrying conductors, 30 C ambient,
  covering 18 AWG to 2 AWG. Bundles derate in steps down to 50% from ten
  conductors, per 310.15(C)(1). Until 2026-09-27 the table carried much higher
  figures of uncertain origin (10 AWG at 65 A); it was replaced rather than
  extended so that trunk and branch are judged on one basis.
- Approximately 100 A maximum recommended capacity per PSU group.
  Injection branches and modest data routes share one PSU while their full-white
  loads fit; larger builds are split into separately fused positive-power
  zones with common signal ground and no paralleled PSU positive outputs.
- Every PSU group has a main fuse at the supply positive and a trunk to its
  fuse blocks, 500 mm one way with its own 0.1 V drop allowance, both sized
  for the group's full-white branch load. Main fuses are bolt-down (MIDI/ANL
  class) ratings up to 150 A; a group whose fuse no listed conductor carries
  is unresolved rather than drawn.
- Reviewed conductor, connector, voltage-drop, derating, and fuse tables for
  each feed and trunk.
- A battery source window from protected minimum voltage through full and
  ceiling voltage. Converter input current, main fuse and trunk wire use the
  minimum; converter overvoltage checks use the ceiling. The selected fuse
  class must cover both voltage and prospective fault-current interrupt rating.
- Battery runtime is reported at uncapped full white and, separately, at any
  configured FastLED running limit. Hardware sizing never uses that limit.
  Full-white runtime below two hours warns, and pack current above 30 A asks
  for review by a professional experienced with high-power, low-voltage work.

These values produce conservative protection and a full-white supply
recommendation from the information the graph can know. They are stated in
the UI and exports rather than presented as questions to a beginner.

## Board Confidence

- **Manufacturer verified:** official pinout and board documentation reviewed.
- **Pinout verified:** header map reviewed; board-level caveats remain visible.
- **Visual match only:** no controller wiring may be generated.

The generic `ESP32-S3 N16R8, 44-pin dual USB-C` profile is pinout verified.
Its power-entry label is `5VIN`, GPIO35-GPIO37 are unavailable on N16R8 modules
because octal PSRAM consumes them, and its unverified USB/backfeed behaviour is
shown as a note rather than turned into a beginner planning questionnaire.

The ESP32-C6-DevKitC-1, LOLIN D1 Mini, Raspberry Pi Pico W and Teensy 4.1
are manufacturer verified from their makers' pinouts, drawings and
schematics; the ESP32-C3 Super Mini, a multi-vendor clone, is pinout
verified against a photographed board. All five draw their own render on the
sheet, with each wire on its measured pad. The Pico W's power input is VSYS,
which its Schottky diode isolates from USB; the D1 Mini's 5V pin is USB VBUS
itself, with no diode. The Arduino Nano ESP32 is manufacturer verified from
Arduino's datasheet and pinout. It has no 5 V input: its VIN takes 6 to 21 V,
which the pin's `inputVoltage` records, so the power plan refuses to feed it
from a 5 V controller converter and keeps it on USB power.

The WT32-ETH01 is manufacturer verified from Wireless-Tag's datasheet and
pinout drawing. It has no USB (`hasUsb: false`), so its render spec carries no
USB point. The sheet draws a "5 V supply · into 5V · no USB" block in the USB
block's place, and the 5V pad joins the +5V net by symbol. The power plan and
the connection export name that pad instead of a USB lead. A controller
converter lands on the same pad, without the USB back-feed warning.

The `ESP32 DevKit v1, 30-pin (ESP-32D)` profile is pinout verified from a
user-supplied pinout image with the 15 + 15 rail count confirmed against the
physical board. It is the only classic-ESP32 profile, so it is offered for both
catalogue entries that map to that silicon (`esp32:esp32:esp32doit-devkit-v1`
and `esp32:esp32:esp32`) and never for an ESP32-S3 project. GPIO0 is absent
from its pin list on purpose — the BOOT button is that pad's only connection,
so there is nothing to wire to.

## Viewport And Export Contract

The user opens the **Build Diagram** tab, confirms the exact controller board
if needed, inspects the generated diagram, connections and BOM, then exports
the current view or complete build reference. Hiding, isolating or marking
hardware Done changes only the view or assembly progress. These actions use
icons with accessible names, and the copy explains the recommended wiring.

- Target authoring size: `1440x900`; supported minimum: `1280x720`.
- Left panel: generic controller-family outline, horizontal reviewed-pinout
  picker, compact graph-hardware action rows, and power summary.
- Centre: generated wiring diagram in a non-scrolling viewport, with left-drag
  panning from any non-interactive sheet artwork or surrounding canvas and
  cursor-centred wheel or trackpad-pinch zoom. Selectable hardware keeps its
  primary-button click gesture.
- Right panel: idle on first load, then exact-board notes, generated readiness,
  connections, BOM, and export controls after a board or hardware selection.
- Panels scroll independently and the diagram remains the priority below the
  target width.
- SVG, print/PDF, Connections CSV, and BOM CSV outputs carry the ruleset version
  and generated readiness state.

## Verification

Maintain unit coverage for immediate graph-derived calculations and small/large
matrix supply and feed recommendations. Component coverage must check:

- physical wires by circuit ID, including both ends of every fuse and the
  separation of independent PSU positive rails;
- complete button, potentiometer and encoder signal, supply where needed,
  and ground connections;
- exact-board-only input, no installation questionnaires, and invalid-GPIO
  blocking;
- visibility, isolation, accessible icon controls, persistence and export scope;
- 4x4 LED previews, cursor-centred zoom, visible total-load labels and PSU BOM
  recommendations; and
- compact initial sidebars, panel sizing, board details and the horizontal
  reviewed-pinout picker.

The retired handoff recorded successful automated tests, lint and production
builds. Those historical results do not qualify physical wiring. The independent
review in [HW-14](../../todo.md) still owns verification of formulas, source
tables and wording before authoritative-guidance claims are made.

## Current Scope

- Exact profiles for the generic ESP32-S3 N16R8 dual-USB-C board, Espressif
  ESP32-S3-DevKitC-1, Seeed Studio XIAO ESP32S3, and the 30-pin ESP32 DevKit v1
  (ESP-32D).
- WS2812-class strips and matrices, I2S MEMS microphones, momentary buttons,
  analog potentiometers, and rotary encoders.
- One independent conditioned data route per supported `MatrixOutput`; four
  routes consume the four channels of one 74AHCT125 and later routes add chips
  in groups of four.
- Automatic supply count, feed count, conductor, connector, fuse, distribution,
  level-shifter, resistor, capacitor, and controller-power recommendations.
- Experimental lithium battery sources with series/parallel cell packs,
  combined or separate protection, balancing and charging boards, regulated
  5 V output, catalogue-defined converter terminals, battery runtime and fuse
  interrupt-rating checks.
- Unsupported graph hardware is reported and omitted rather than wired
  speculatively.

The formulas and source-table transcription still require independent
electrical review before the feature is presented as authoritative engineering
advice. Exports remain a low-voltage design-assistance reference and must be
checked against exact component datasheets and applicable local requirements.
