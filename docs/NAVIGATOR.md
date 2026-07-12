# Documentation Navigator

Index of project documentation. See `CLAUDE.md` (repo root) for the
build/architecture overview aimed at contributors.

## Architecture

- [Desktop viewport contract](architecture/desktop-viewport-contract.md)
  — the supported desktop minimum, the expected graceful-degradation behavior,
    and the “must stay reachable” checklist for chrome, panels, dialogs, and
    status information.
- [Decisions (ADRs)](architecture/decisions/)
  - [0001 — Pattern node-group architecture (two-tier dataflow)](architecture/decisions/0001-pattern-node-group-architecture.md)
    — the paradigm (dataflow), the encapsulation model (pattern groups become
    nodes in a compositing graph), and the phased plan toward it.

## Development

- [Design notes](development/design/)
  - [Generative pattern show](development/design/generative-pattern-show.md)
    — the Library → Collection → Pattern Master flow for a random pattern/
    transition show (localStorage library, audio-reactive patterns, per-pattern
    `.h` codegen), and its phased rollout.
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
- [Plans](development/plans/)
  - [T-HMI feature integration](development/plans/thmi-feature-integration.md)
    — how to replay the divergent `feature/thmi-touchscreen-ui` branch (FFT
    audio, 13 transitions, T-HMI firmware) onto current `main` as PRs.

## Design intent (original specs)

Located in `.docs/` at the repo root:

- `.docs/Proposal-FastLED_Studio` — node-type catalogue and deployment workflow
- `.docs/Design_Specification.md` — visual design system
- `.docs/Developer_Handoff_Specification` — implementation guide
