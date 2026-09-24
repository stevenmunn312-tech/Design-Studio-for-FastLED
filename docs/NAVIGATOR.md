# Documentation Navigator

Index of project documentation. See `CLAUDE.md` (repo root) for the
build/architecture overview aimed at contributors.

## Active work

- [Ordered Hardware → v1 backlog](../todo.md) — the single active checklist.
- [Archived backlog to 2026-09-24](archive/hardware-todo-to-2026-09-24.md) — every
  item's full evidence narrative before the backlog was restructured.
- [Hardware branch review, 2026-09-08](development/reports/hardware-branch-review.md)
  — reproduced integration defects, control/display workflow and next milestone.

## User guides

- [Hardware workbench](user/hardware-workbench.md)
  — the current Hardware-branch workflow for choosing a board, adding physical
    parts, assigning pins, learning an IR remote, wiring a knob or button to a
    property or named action (Control Map remains the optional compact bundle),
    designing and wiring display widgets, switching LED preview
    routes, deploying firmware, and using the embedded Output/Serial console.
- [Stereo VU Meter](user/stereo-vu-meter.md)
  — adding and wiring paired side strings, stereo/mono source behavior, all
    twelve visualizations, direction/current safety, baked fallback compatibility,
    and the bench-evidence checklist.

## Architecture

- [Desktop viewport contract](architecture/desktop-viewport-contract.md)
  — the supported desktop minimum, the expected graceful-degradation behavior,
    and the “must stay reachable” checklist for chrome, panels, dialogs, and
    status information.
- [Build Diagram architecture](architecture/build-diagram.md)
  — the exact-board contract, Build Profile terminology, confidence model,
    safety invariants, and current workspace foundations for physical/electrical
    assembly guidance.
- [Multi-output routing](architecture/multi-output-routing.md)
  — the composition-canvas contract, per-route fit/crop mapping, synchronized
    firmware output, and cross-route GPIO/power/RAM validation.
- [Decisions (ADRs)](architecture/decisions/)
  - [0001 — Pattern node-group architecture (two-tier dataflow)](architecture/decisions/0001-pattern-node-group-architecture.md)
    — the paradigm (dataflow), the encapsulation model (pattern groups become
    nodes in a compositing graph), and the phased plan toward it.

## Development

- [Design notes](development/design/)
  - [Direct controls and LED output status](development/design/direct-controls-and-output-status.md)
    — named Touch widget outputs, property inputs exposed on demand,
      optional control bundles and LED-output status screens; includes
      the ordered implementation checklist and the four reference
      workflows of the current model. Steps 1–9 and 11 landed; step 10
      representative firmware compiled on both engines; bench still open.
  - [Wire-first touch controls](development/design/wire-first-touch-controls.md)
    — create a touch control by dropping a wire on the property it drives, so
      its type, range, step and label come from the property rather than from a
      repair afterwards; the widget then waits in a derived "Connected" group
      until it is placed. Nothing auto-deletes — one inert state with three
      causes, dimmed on the wire and on the widget, and reported in Graph
      Health in both directions. Complete.
  - [The live touch screen](development/design/live-touch-screen.md)
    — why Run left the screen designer and floats over the graph instead, the
      difference between an overlay being open and being on screen, driving a
      touch-widget property from the graph as a second remote, and the one
      rule that replaced the editor's old runtime reset. Complete.
  - [On-glass widget labels](development/design/on-glass-widget-labels.md)
    — Show Label, the rule that a label is drawn once (as content, or as a
      caption, never both), why the caption takes its strip out of the widget's
      own box and what that makes the two renderers agree on. Browser side
      complete; the LVGL half is asserted but not yet on glass.
  - [One canvas, four workspaces](development/design/workspace-tabs.md)
    — replacing the split graph/hardware canvas with Hardware · Build Diagram ·
    Graph · Upload tabs, why co-visibility was not what connected them, and how
    the two costs (an unseen change, a node nobody can find in the library) get
    paid for with behaviour instead of screen area.
  - [Generative pattern show](development/design/generative-pattern-show.md)
    — the Pattern Library → Collection → Pattern Slideshow flow for a random
    pattern/transition show, including helper-backed library mirroring,
    transition pools, and the current controller-sketch codegen shape.
  - [Transition catalogue](development/design/transition-catalogue.md)
    — what an A→B transition style is, the three implementations and two
    registries it spans, why style ids are append-only *and* must stay dense,
    the endpoint-exactness rule that keeps preview and firmware together, and
    what reads at LED resolution.
  - [Collection-driven performance](development/design/collection-driven-performance.md)
    — plug a Pattern Collection into the Performance Generator so the music-sync
    rules engine schedules the user's own patterns, with a "Use group inputs"
    toggle that modulates each pattern's palette/speed/intensity.
  - [Code node](development/design/code-node.md)
    — pasting raw FastLED C++ as a node: verbatim codegen plus a lightweight
    C++→JS shim that approximates the code in the live preview.
  - [ANIMartRIX / float field](development/design/animartrix-float-field.md)
    — a new `field` data type (per-pixel scalar grid) plus `FieldFormula`,
    `FieldToFrame`, `DistanceField`, `FieldMath`, and `FieldWarp` nodes that
    unlock ANIMartRIX-style coordinate → scalar → colour pipelines.
  - [DMX / Art-Net input](development/design/dmx-artnet-input.md)
    — the `dmx` data type carrying a whole 512-channel universe down one wire,
    the `DMXInput` source / `DMXChannel` decoder split, and the parity rules
    between helper-backed Art-Net preview, Art-Net firmware, and ESP32 DMX512.
  - [RTC clock and scheduled triggers](development/design/rtc-clock-and-schedule.md)
    — the software clock and its `Compile Time` / `Manual` / `NTP` sources, why
    the clock is a wire rather than a scene singleton, and the window/trigger
    edge rules `ScheduleTrigger` holds identical across preview and firmware.
  - [Node reference layout and upkeep](development/design/node-reference-layout.md)
    — the approved Help article structure, generated visual contract, live
    example behavior, and maintenance checklist for new nodes.
  - [HUB75 output](development/design/hub75-output.md)
    — current design/status note for driving HUB75 scan-panel matrices via
    `ESP32-HUB75-MatrixPanel-DMA` as a single-output `MatrixOutput` route
    family alongside the existing clockless/SPI addressable chipsets.
  - [Formula-driven pattern nodes](development/design/formula-pattern-nodes.md)
    — `FormulaField` (stateless, curated closed-form fields like rose
    curves/superformula; field category) and `FormulaPoints` (stateful
    curated point/trajectory generators like phyllotaxis/Lissajous
    paths/attractors; pattern category), plus a `PHI` formula-language
    constant. All three are implemented; the note records their shared
    preview/codegen contract and remaining hardware-validation status.
  - [Board node and hardware capability model](development/design/board-node-architecture.md)
    — the implemented singleton Board/profile contract, board-wide controller
    settings, automatic PSRAM and USB serial policies, plus the capability
    abstractions still deferred.
  - [Hardware nodes](development/design/hardware-nodes.md)
    — the implemented one-component/two-view model: the workbench owns physical
    existence and wiring, while the graph shows signal-carrying parts; it also
    records the remaining Audio and Storage capability work.
  - [Auxiliary displays](development/design/auxiliary-displays.md)
    — 7-segment/OLED/TFT peripherals as hardware-owned root parts: the `string`
    signal, segment/OLED/fixed TFT drivers, and the freeform screen editor
    and LVGL generators are implemented; physical validation remains separate.
    Records the touch/evaluate/publish/
    flush frame order, bus-aware pin sharing, why a display is a codegen
    terminal, and the evidence gates no device ships without.
  - [Simple displays](development/design/simple-displays.md)
    — what a small non-touch panel shows and how it is told: one `Display`
    input whose plugged-in source picks the layout, the source-driven layout contract and its
    relationship to larger panels, and what an unwired panel says instead of
    sitting blank.
  - [Large displays and control routing](development/design/large-displays-and-control-routing.md)
    — colour-panel ownership and control routing: the panel owns its
    screen design (`displayId`, no mount wire), Music Player's song
    fields unpack through Song Info, and Control Map remains the
    optional compact bundle beside the direct named actions in
    [direct controls](development/design/direct-controls-and-output-status.md).
  - [Display firmware compile checks](development/display-compile-checks.md)
    — the twelve current-model fixtures, their Arduino CLI/fbuild figures and
    the commands that rebuild them, including the two refused shapes that must
    still generate well-formed C++.
  - [IR remote firmware compile checks](development/ir-compile-checks.md)
    — the normal/slideshow/player/no-IR fixtures, per-board Arduino CLI and
    fbuild results, and the gaps still open for D-05a step 13.
  - [Presence-sensor firmware compile checks](development/presence-sensor-compile-checks.md)
  - [Light-sensor firmware compile checks](development/light-sensor-compile-checks.md)
    — real normal/slideshow/player/no-sensor fixtures for the HLK-LD2410C,
    their classic-ESP32 results, resource figures and measured sensor overhead.
- [Testing](development/testing/)
  - [Touch, LVGL and heap budgets](development/testing/display-budget-bench.md)
    — what a running board reports about itself, how to read it in the Upload
    tab, and the four runs plus one-hour soak whose numbers become the
    acceptance budgets. Tables deliberately empty until measured.
- [Plans](development/plans/)
  - [Hardware expansion roadmap](development/plans/hardware-expansion-roadmap.md)
    — prioritised candidate modules for switching, monitoring, sensing,
      networking, power conversion and additional controller profiles, plus
      the evidence and safety gates required before any item is supported.
  - [IR remote controls for graph properties](development/plans/ir-remote-controls.md)
    — the implemented wire-first IR receiver contract, learned stable button mappings,
      repeat semantics and the Step Value adapter used to change runtime graph
      properties without mutating authored fields; compile and hardware
      qualification remain open.
  - [Workspace shelves handoff](development/plans/workspace-shelves-handoff.md)
    — what the workspace tabs exposed: a sidebar still stocked for the graph
    while standing on the bench, and an LED preview that does not survive the
    Build Diagram. Proposes a parts shelf, information shelves, and the order to
    do them in.
  - [Audio part expansion](development/plans/audio-part-expansion.md)
    — microphones using existing firmware profiles, and the DAC-to-power-amp
    chain (Option B, landed) that the 12 V analog amplifiers required.
  - [Build Diagram contract](development/plans/build-diagram-handoff.md)
    — implemented generated wiring/BOM behavior; the independent electrical
      review of what it generates is HW-14 in the root todo.

  - [Hardware renders](development/plans/hardware-renders.md)
    — verified Blender source, render/import contract and catalogue ownership.
- [Reports](development/reports/)
  - [Stereo VU bench record](development/reports/stereo-vu-bench.md)
    — preserved exact-rig evidence from the completed implementation plan.

  - [Input peripheral bench records](development/reports/input-peripheral-bench.md)
    — hardware validation for the `input` node category: the LDR light-sensor
    run with its measured ADC range, which input nodes still have no record,
    and the failure signatures (loose ground reads as a dead feature, a
    dark-room calibration is 30x wrong for a lit one).
  - [fbuild workarounds](development/reports/fbuild-workarounds.md)
    — every accommodation the upload helper makes for the fbuild build engine,
    with symptoms, code references, and version-verification status; written to
    double as an upstream bug report.

## Reference

- [Display nodes](reference/displays.md)
  — exact module choices, fixed-screen wiring, custom widget roles, editor and
    Run workflow, assets, generator limits, and troubleshooting.
- [Node cards](reference/node-cards.md)
  — a generated reference card image for every node in the library (ports,
    typed port colours, inline controls at their defaults, evaluated preview
    thumbnails). Regenerate with `npm run gen:node-cards` after changing
    `nodeLibrary.ts`; images live in `public/node-cards/` and the same node
    inventory feeds the Help modal's node-reference pages.

## Release

- [Beta support matrix](release/beta-support-matrix.md)
  — the only combinations currently promoted from experimental to public-beta
    supported, plus the CI-only coverage and the validation gaps still to fill.
- [Beta hardware validation](release/beta-hardware-validation.md)
  — opt-in community evidence reports, privacy boundaries, maintainer triage,
    and the SD-show hardware checklist.
- [Supported platform policy](release/supported-platform-policy.md)
  — how support tiers map onto the beta matrix, desktop-only expectations, and
    how supported vs. experimental paths are triaged.
- [Versioning and releases](release/versioning-and-releases.md)
  — the pre-1.0 semantic-versioning rules, tag format, and release checklist.
- [Desktop distribution](release/desktop-distribution.md)
  — the bundled launcher architecture, per-platform build procedure, mutable
    data locations, local validation evidence, and remaining signing work.
- [Keyboard and screen-reader smoke test](release/accessibility-smoke-test.md)
  — the repeatable keyboard-only and NVDA release scenario, browser-assisted
    preflight evidence, and the completion record for the accessibility gate.

## Documentation maintenance

Keep active work in root todo, contracts in architecture/design notes and evidence
in reports/release records. Superseded initial briefs and completed duplicate
trackers were removed in the 2026-09-08 review; Git retains their history.
