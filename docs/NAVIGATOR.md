# Documentation Navigator

Index of project documentation. See `CLAUDE.md` (repo root) for the
build/architecture overview aimed at contributors.

## Architecture

- [Desktop viewport contract](architecture/desktop-viewport-contract.md)
  — the supported desktop minimum, the expected graceful-degradation behavior,
    and the “must stay reachable” checklist for chrome, panels, dialogs, and
    status information.
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
    — the Pattern Library → Collection → Show Engine flow for a random
    pattern/transition show, including helper-backed library mirroring,
    transition pools, and the current controller-sketch codegen shape.
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
    — proposal (not started) for driving HUB75 scan-panel matrices via
    `ESP32-HUB75-MatrixPanel-DMA` as a third `MatrixOutput` route family
    alongside the existing clockless/SPI addressable chipsets.
- [Plans](development/plans/)
  - [Node review findings](development/plans/node-todo.md)
    — the category-by-category control, validation, evaluator, and codegen
    audit, including completed fixes and retained follow-ups.
  - [T-HMI feature integration](development/plans/thmi-feature-integration.md)
    — how to replay the divergent `feature/thmi-touchscreen-ui` branch (FFT
    audio, 13 transitions, T-HMI firmware) onto current `main` as PRs.
- [Reports](development/reports/)
  - [Node library review](development/reports/node-review.md)
    — a pass over all 150 node types cross-checking the registry, live preview,
    and firmware generator: preview/firmware divergences (a `Kaleidoscope`
    codegen stub, `Mod` by zero, frame-rate-coupled timing), unbounded
    property values, and node-metadata improvements.
  - [fbuild workarounds](development/reports/fbuild-workarounds.md)
    — every accommodation the upload helper makes for the fbuild build engine,
    with symptoms, code references, and version-verification status; written to
    double as an upstream bug report.

## Reference

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

## Historical design intent (non-normative)

Located in `.docs/` at the repo root. These preserve the early brief and are
not current implementation guidance:

- `.docs/Proposal-FastLED_Studio` — node-type catalogue and deployment workflow
- `.docs/Design_Specification.md` — visual design system
- `.docs/Developer_Handoff_Specification` — implementation guide
