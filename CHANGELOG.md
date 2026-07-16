# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses pre-1.0 semantic
versioning (`0.y.z`) until the first stable release.

## [Unreleased]

### Added

- Public-beta release docs: a beta support matrix, supported-platform policy,
  versioning/tagging procedure, third-party notices, and security reporting
  instructions.
- A multiline-aware Text authoring path with a clearer font manager in the
  Inspector, keeping preview and codegen aligned for custom fonts.
- Concrete PWA install icons and explicit offline/hardware-workflow guidance in
  the README and Help modal.
- Backend Python dependency pinning via direct requirements, a shared
  constraints file, and CI coverage for clean installs on Windows, macOS, and
  Linux.
- A documented desktop viewport contract covering the supported minimum window
  size and the expected degrade path below it.
- A self-contained desktop distribution path: PyInstaller freezes the existing
  frontend/upload helper, bundles fbuild and esptool, isolates mutable user data,
  launch-smokes the result, and emits a portable platform archive.

### Changed

- The public-beta support promise is now narrower and explicit: only recorded
  end-to-end validation rows are promoted from experimental status.
- Release/readiness references in `README.md`, `CLAUDE.md`, `docs/NAVIGATOR.md`,
  and `todo.md` now point to the release docs as the source of truth.

## [0.1.0] - Initial pre-beta baseline

### Added

- Browser-based node-graph authoring for FastLED matrix patterns with live
  preview, code generation, hardware upload helpers, generative shows, and
  music-synced SD-show tooling.
