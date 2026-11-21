# Supported Platform Policy

This document explains what Design Studio for FastLED v1.0.0 supports
versus what is best-effort or explicitly experimental.

## Support tiers

### Supported

Supported combinations are listed in
[`beta-support-matrix.md`](beta-support-matrix.md). A supported row means the
repo contains a recorded end-to-end validation note for that exact combo.

### CI-covered

CI-covered environments are useful confidence signals, but they are still not a
manual support promise for browser behavior or physical hardware workflows.

### Experimental

Anything not promoted in the support matrix remains experimental, even if
the UI exposes it or codegen exists for it.

## Host-platform policy

- Focus is desktop-class environments. Every supported hardware row was
  recorded on Windows 11 with Chrome; macOS, Linux and other browsers can
  author, preview and upload, but they are experimental until a row records
  them.
- Mobile browsers and touch-first tablet workflows are not part of the support
  promise. A phone reaching a board's Web Remote is a board feature, covered
  by that board's rows.
- Offline authoring/preview is supported only after a successful online load of
  the app shell; helper-backed workflows still require the local helper on the
  same machine.
- The helper is a local-machine tool. Remote/shared helper hosting is outside
  the supported model.
- Portable desktop bundles keep the helper and frontend on localhost, store
  projects and patterns in the user's Documents folder, and keep build data in
  the native per-user application-data folder.
  A platform bundle remains experimental until its signed artifact has a
  clean-machine smoke record; see `desktop-distribution.md` and the
  [clean-machine smoke test](clean-machine-smoke-test.md). On Windows the
  Microsoft Store signs the MSIX; the portable ZIP stays unsigned.

## Hardware/upload policy

- The supported end-to-end hardware combinations and exercised workflows are
  exactly the rows listed in the support matrix, with its
  [known limitations](beta-support-matrix.md#known-limitations-in-v100).
- Other boards, chipsets, layouts, upload engines, and advanced show/audio
  paths may work, but they are still experimental until recorded validation
  exists.
- Export-only workflows (`View Code`, `Export .ino`) are available even when a
  board/upload combination is experimental.

## Issue triage expectations

- Regressions in supported rows should be treated as release blockers.
- Bugs in CI-covered but unsupported environments should still be fixed when
  practical, but they do not block a release by themselves.
- A change that would break opening a v1 save is a release blocker unless it
  ships with a migration ([format baseline](versioning-and-releases.md#development-lines-and-the-v1-baseline)).
- Experimental-path bugs are welcome, but fixes may be deferred until that path
  is promoted into the matrix.
