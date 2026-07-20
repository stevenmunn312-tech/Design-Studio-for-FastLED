# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses pre-1.0 semantic
versioning (`0.y.z`) until the first stable release.

## [Unreleased]

## [0.3.0] - 2026-07-20

Renamed the project to **Design Studio for FastLED** following trademark
feedback that "FastLED ___" read as an official FastLED product rather than a
compatible companion tool.

### Changed

- Renamed the app from "FastLED Studio" to "Design Studio for FastLED"
  throughout: display text (README, docs, in-app UI, generated-firmware
  comments), `package.json`/PWA manifest identifiers, localStorage key
  prefixes, the desktop app's per-user data folder, release-artifact naming,
  and the Windows/macOS launcher files.
- Replaced the branding SVGs and the empty-canvas start-screen wordmark PNG
  with versions reading "Design Studio" (paired with the existing "for
  FastLED" tagline), and retook the README screenshots against the renamed
  app.
- Updated hardcoded repository links (Help modal, hardware-validation report
  links, issue templates, README, CONTRIBUTING) to the renamed GitHub
  repository, `stevenmunn312-tech/Design-Studio-for-FastLED`.

### Fixed

- Check out Git history in the desktop draft-release job before invoking the
  GitHub CLI to create or update a release.

## [0.2.0] - 2026-07-17

First public beta.

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
- Contribution scaffolding for the beta: `CONTRIBUTING.md` plus GitHub issue
  forms for bug reports, hardware validation reports, and feature requests.
- An in-app **About** tab in Help (also reachable from View → About) showing
  the app version, maintainer, MIT license, and credits for Stefan Petrick /
  AnimARTrix, FastLED, Essentia, and the bundled open-source dependencies.
- A tagged/manual GitHub Actions workflow that builds, launch-smokes,
  checksums, and uploads portable desktop archives for Windows, Linux, macOS
  Apple Silicon, and macOS Intel/Rosetta, with optional draft pre-release
  assembly after every platform passes.

### Changed

- The public-beta support promise is now narrower and explicit: only recorded
  end-to-end validation rows are promoted from experimental status.
- Release/readiness references in `README.md`, `CLAUDE.md`, `docs/NAVIGATOR.md`,
  and `todo.md` now point to the release docs as the source of truth.
- `README.md` now states the beta stability scope explicitly: breaking changes
  are expected between beta releases, file formats are not final, and saved
  work should be exported before upgrading.

### Removed

- Untracked leftover working-session screenshots from the repository root and
  `artifacts/`, and gitignored those paths.

### Fixed

- Allow the desktop packaging dependency set to resolve on Intel macOS by
  keeping `cryptography` below the upper bound required by `esptool 5.3.1`.
- Replace the unusable macOS executables in the upstream `fbuild 2.5.0` wheel
  with binaries compiled from its exact tagged source commit on each Mac
  architecture before freezing the desktop bundle.

## [0.1.0] - Initial pre-beta baseline

### Added

- Browser-based node-graph authoring for FastLED matrix patterns with live
  preview, code generation, hardware upload helpers, generative shows, and
  music-synced SD-show tooling.
