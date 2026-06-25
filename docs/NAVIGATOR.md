# Documentation Navigator

Index of project documentation. See `CLAUDE.md` (repo root) for the
build/architecture overview aimed at contributors.

## Architecture

- [Decisions (ADRs)](architecture/decisions/)
  - [0001 — Pattern node-group architecture (two-tier dataflow)](architecture/decisions/0001-pattern-node-group-architecture.md)
    — the paradigm (dataflow), the encapsulation model (pattern groups become
    nodes in a compositing graph), and the phased plan toward it.

## Development

- [Plans](development/plans/)
  - [T-HMI feature integration](development/plans/thmi-feature-integration.md)
    — how to replay the divergent `feature/thmi-touchscreen-ui` branch (FFT
    audio, 13 transitions, T-HMI firmware) onto current `main` as PRs.

## Design intent (original specs)

Located in `.docs/` at the repo root:

- `.docs/Proposal-FastLED_Studio` — node-type catalogue and deployment workflow
- `.docs/Design_Specification.md` — visual design system
- `.docs/Developer_Handoff_Specification` — implementation guide
