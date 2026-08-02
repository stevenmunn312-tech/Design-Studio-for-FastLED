# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses pre-1.0 semantic
versioning (`0.y.z`) until the first stable release.

## [Unreleased]

## [0.4.0] - 2026-08-02

### Added

- Added a **3D Wireframe** pattern node. It renders rotating built-in
  Platonic-solid presets or an uploaded custom mesh with orthographic or
  perspective projection, optional depth shading, independent X/Y/Z spin,
  live preview, and matching FastLED code generation. Oversized custom meshes
  are automatically decimated within the node's validated vertex/edge limits.

- Added an RTC clock and time-of-day scheduling. An **RTC Clock** source node
  publishes calendar fields plus `valid`/`synced`/`stale` status from one of
  four time sources: the sketch's compile-time build stamp, a manually
  entered date/time, NTP over Wi-Fi, or a battery-backed DS3231 on the board's
  default I²C bus. The DS3231 path uses Arduino Wire directly, needs no RTClib
  dependency, and maps the chip's oscillator-stop flag to `stale`. A
  **Schedule Trigger** node reads that clock through ordinary ports and fires a
  time-of-day window (with a 0–1 progress output) or a one-shot daily trigger,
  gated by day-of-week rules. A **Clock Display** node renders the time as a
  digital or analog face, or runs as a local stopwatch/timer. Preview mirrors
  whichever time source is selected; generated firmware runs a free-running
  software clock for the first three sources (NTP corrects it once Wi-Fi/sync
  succeeds rather than staying dark until then), and Graph Health flags
  unsupported boards, incomplete
  schedules, and an unwired clock display. NTP time sync shares the same
  Wi-Fi bootstrap and browser-local credential store as Art-Net input.
  Experimental until hardware validation passes for software-clock drift, a
  real NTP sync, and a physical DS3231 are recorded.

- Added DMX / Art-Net input. A **DMX / Art-Net** source node carries one
  512-channel universe down a single `dmx` wire, and a **DMX Channel** node
  decodes one slot into a normalized value, a raw byte, and active/changed
  flags. Preview receives Art-Net through a UDP listener in the local helper,
  with connection, packet-rate, and live-channel status on the node. Generated
  firmware implements both transports: Art-Net over Wi-Fi on ESP32/ESP8266, and
  real DMX512 through an RS-485 transceiver on ESP32 (`esp_dmx`, vendored
  automatically by the `fbuild` engine). Validation blocks DMX512 on non-ESP32
  targets and network modes on boards without Wi-Fi, folds the DMX UART pins
  into the shared GPIO conflict check, and flags missing or conflicting Wi-Fi
  settings. Experimental until a hardware validation pass is recorded.

- Added multiple Matrix Output routes in one project. Each route can select an
  independent frame branch and configure its own pins, chipset/color order,
  dimensions, physical layout, brightness, and fit/crop mapping. Preview can
  switch between routes; generated firmware initializes all controllers and
  updates them with one synchronized show call, with cross-output GPIO/layout,
  aggregate power, and RAM validation.

- Added preview recording and export: a **⏺ Record** button in the LED
  preview header opens a dialog that captures the matrix as a PNG snapshot,
  an animated GIF, or a WebM video, with duration, frame rate, scale
  (pixels per LED), seamless-loop crossfade, and LED-look vs. flat-pixel
  style options. Clips render offline and deterministically from the graph
  (stateful nodes run in an isolated state namespace, so the live preview
  is undisturbed), and the GIF encoder is built in with no new dependencies.

- Added an always-available Graph Health drawer with continuously refreshed,
  node-attributed diagnostics for wiring, expressions, pin conflicts,
  preview-only behavior, output power, internal RAM, show structure, and board
  compatibility. Each issue includes a specific repair and can locate the
  affected node or open the relevant workspace control.

- Added a dockable **Performance Deck** for pinning graph properties as large
  knobs, faders, toggles, or selectors. Performers can save and recall parameter
  scenes, morph between two scenes, invoke a panic/restore action, and learn MIDI
  or keyboard bindings without leaving the live graph.

- Added **Pattern Ratings**, an offline quality pass over saved and bundled
  patterns that scores structure, colour balance, brightness, stability, graph
  health, and audio wiring. Rated selections can be turned directly into a
  Pattern Collection, and the bundled audio-reactive shelf was expanded and
  polished using the same checks.

- Added **Palette from Image**, which extracts two to eight representative
  colours from an uploaded image using weighted median-cut quantisation and
  bakes the resulting palette into generated firmware.

- Added opt-in beta hardware coverage reports. The deploy panel identifies
  whether the current host/board/layout/workflow has a recorded support row and
  lets testers explicitly copy or download a privacy-reviewed report; nothing
  is submitted automatically.

- Expanded the node catalogue and node controls with additional Ease variants,
  board-aware pin selection, richer Audio Hue weighting, matrix-aware shape
  sizing, and the completed node-reference/card set for the current library.

### Changed

- Reworked project management around named, autosaved workspaces with recent
  project access, create/duplicate/rename/delete controls, per-project upload
  targets, helper-backed disk mirroring, recovery snapshots, and explicit
  save/continue prompts. Legacy autosaves migrate into the default project.

- Improved the first-run path with guided starters, a redesigned Start gallery,
  clearer in-app help, progressive node-library disclosure, quick audio recipes,
  and refreshed README imagery and pixel branding.

- Expanded the Matrix Output workflow with a streamlined setup wizard, build
  engine switching, custom board-manager URLs and core updates, board-aware GPIO
  guidance, live flash/RAM capacity reporting, wiring diagnostics, and clearer
  upload/readiness errors.

- Added resizable workbench panels and layout presets, improved graph fitting and
  tidy/splice behavior, and completed keyboard/screen-reader smoke coverage for
  the core authoring and upload path.

- Updated the helper toolchain to `fbuild 2.5.4` and broadened recorded hardware
  coverage to include ESP8266 strip upload, wiring diagnostics, and live stream,
  plus ESP32-S3 microphone-driven generative-show transitions and particles.

- Kept RTC/NTP, DMX/Art-Net, PSRAM, tiled/custom layouts, and the music-sync SD
  pipeline explicitly experimental until their remaining hardware-validation
  runs are recorded in the beta support matrix.

### Fixed

- Fixed sustained live streaming freezes caused by unread helper output pipes,
  blocked serial writes, and receiver reads that could wait forever after a
  dropped byte. Also fixed all 1-row/1-column layouts silently dropping every
  streamed frame because display dimensions were used instead of frame
  dimensions.

- Fixed music-sync SD provisioning and playback issues found on real hardware:
  first-write acknowledgement timeouts, undersized ESP32 app partitions,
  excessive audio-library memory use, an invalid DAC API, and incorrect playback
  position tracking.

- Fixed show-codegen buffer/brace issues, Kaleidoscope code generation,
  brightness amplification, stale upload ports, upload contrast/error recovery,
  and misleading unsupported-node comments in generated show firmware.

- Fixed project and graph-state regressions including lost browser-only projects,
  an unreachable project manager, invisible no-save state, group navigation
  discarding undo history, duplicate ids during multi-pattern drops, and node
  drags requiring two Undo presses.

- Fixed pattern-library selection and rendering issues, invalid palette fallbacks,
  sidebar preference loss on an empty canvas, record-dialog Escape handling,
  Save As picker fallback, context-menu layering, preview sizing, and excessive
  code generation/store subscriptions during ordinary graph interaction.

### Security

- Wi-Fi credentials entered for Art-Net input or NTP time sync are held in a
  browser-local store keyed by node id instead of as node properties, so they
  never travel in project files, share links, or the helper-backed `Projects/`
  mirror. Previously saved values migrate into the local store and are stripped
  from the project on load. Generated firmware still embeds the credential in
  plain text, since a sketch has no other way to join a network.

- Refreshed vulnerable transitive development dependencies used by linting and
  production builds. Both the production and full npm dependency audits now
  report zero known advisories.

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
