# Supported Platform Policy

This document explains what FastLED Studio's public beta is prepared to support
versus what is still best-effort or explicitly experimental.

## Support tiers

### Supported

Supported combinations are listed in
[`beta-support-matrix.md`](beta-support-matrix.md). A supported row means the
repo contains a recorded end-to-end validation note for that exact combo.

### CI-covered

CI-covered environments are useful confidence signals, but they are still not a
manual support promise for browser behavior or physical hardware workflows.

### Experimental

Anything not promoted in the beta support matrix remains experimental, even if
the UI exposes it or codegen exists for it.

## Host-platform policy

- Focus is desktop-class environments.
- Mobile browsers and touch-first tablet workflows are not part of the support
  promise for this beta.
- Offline authoring/preview is supported only after a successful online load of
  the app shell; helper-backed workflows still require the local helper on the
  same machine.
- The helper is a local-machine tool. Remote/shared helper hosting is outside
  the supported model for this beta.

## Hardware/upload policy

- The only supported end-to-end hardware combo is the one listed in the beta
  support matrix.
- Other boards, chipsets, layouts, upload engines, and advanced show/audio
  paths may work, but they are still experimental until recorded validation
  exists.
- Export-only workflows (`View Code`, `Export .ino`) are available even when a
  board/upload combination is experimental.

## Issue triage expectations

- Regressions in supported rows should be treated as release blockers.
- Bugs in CI-covered but unsupported environments should still be fixed when
  practical, but they do not block a beta cut by themselves.
- Experimental-path bugs are welcome, but fixes may be deferred until that path
  is promoted into the matrix.
