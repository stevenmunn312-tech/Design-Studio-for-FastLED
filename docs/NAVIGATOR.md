# Documentation Navigator

Index of project documentation. See `CLAUDE.md` (repo root) for the
build/architecture overview aimed at contributors.

## Active work

- [Ordered Hardware → v1 backlog](../todo.md) — the single active checklist.
- [Hardware branch review, 2026-09-08](development/reports/hardware-branch-review.md)
  — reproduced integration defects, control/display workflow and next milestone.

## User guides

- [Hardware workbench](user/hardware-workbench.md)
  — the current Hardware-branch workflow for choosing a board, adding physical
    parts, assigning pins, designing and wiring display widgets, switching LED preview
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
    signal, segment/OLED/fixed TFT drivers, and the freeform `Display` editor
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
    — the implemented tier 2/3 panel/document split and its open integration gaps: one panel node
    plus a separate document node, `Display` and `Custom Display` as exclusive
    typed inputs, Music Player's song fields moved to an unpacker node, and a
    Player Controls input that mints only the functions a build actually wires.
  - [Display firmware compile checks](development/display-compile-checks.md)
    — historical Arduino CLI/fbuild evidence and commands; the current
    fixture needs the panel/document update before it can establish new coverage.
- [Plans](development/plans/)
  - [Audio part expansion](development/plans/audio-part-expansion.md)
    — proposed microphones using existing firmware profiles, amplifier
    expansion, and the DAC-to-power-amp
    question a 12 V analog amplifier forces before any of them can be added.
  - [Build Diagram contract](development/plans/build-diagram-handoff.md)
    — implemented generated wiring/BOM behavior; independent electrical review
      is tracked in root todo as HW-14.

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
