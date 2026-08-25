# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and the project uses pre-1.0 semantic
versioning (`0.y.z`) until the first stable release.

## [Unreleased]

### Added

- Added a Transport Control node that drives the player through the same
  command bundle Player Controls publishes, and reads the transport back as
  title, elapsed, duration, progress, pattern name, and pattern position — the
  status a display needs, which the graph could not reach before. Seek is a
  change rather than a value, so a parked scrub does not drag playback back to
  itself, and wiring it warns that no firmware generator can emit it yet.
- Added bus-aware pin validation: I2C clients may share SDA and SCL, and SPI
  clients may share SCK, MOSI, and MISO, while chip selects, reset, and other
  exclusive lines still conflict. Two devices answering one I2C address are now
  reported as an address fault rather than as a fault in the pins they
  correctly share, and deploy validation and the Graph Health drawer read the
  same walk.
- Added a `string` port type for auxiliary-display text, with Text Value,
  Format Number, and Format Date/Time nodes. Preview and generated firmware
  format through one shared model, so a display cannot read one thing in the
  browser and another on the bench; generated code uses fixed buffers and
  `snprintf` rather than an Arduino `String` refreshed once per LED frame.
- Added the auxiliary displays design note recording the data model, frame
  ordering, generator rules, bus-sharing rules, driver candidates, and the
  measurement gates no display family ships without.
- Added LED Corkscrew as a dedicated output form with chain length, turns,
  starting angle, winding direction, diameter, and height controls; an
  unwrapped-cylinder authoring canvas; a depth-aware physical preview; and one
  shared browser/firmware sampling map.
- Added an `Audio` capability node whose source picker is derived from attached
  board audio hardware, defaults a single microphone, and clearly reports when
  no source exists.
- Added an on-board player decoder tap that feeds decoded PCM into FastLED audio
  analysis before I2S/DAC output, with the baked show envelope retained as a
  startup and decoder-failure fallback.
- Added ESP32-S3 PCM1802 stereo line-in hardware with four-wire I2S capture,
  Audio capability discovery, board-aware pin assignment and validation,
  generated FastLED analysis, and complete Build Diagram wiring/export support.
- Added a `Storage` capability node that selects the SD, onboard flash, or USB
  storage attached to the board, and resolves which provider a show reads from.
- Added a Button Bank hardware input that grows a new named button output each
  time one is connected, with per-button pin assignment and pull-up, board-aware
  automatic GPIO selection, and pin-conflict validation for every row.
- Added generic SD playback for tracks with no pre-baked event timeline: the
  player rotates the collected patterns on a wall-clock cadence while their own
  audio nodes react to the live decoder signal, and fades down during genuine
  silence.

### Changed

- FFT, beat, percussion, audio-feature, and spectrum analysis now consume the
  payload carried by their Audio connection in preview, recording, group/show,
  and generated-firmware paths instead of reading ambient audio state.
- PSRAM now defaults to an automatic policy that enables external render
  buffers only for exact board profiles with a recorded PSRAM interface, while
  retaining manual On/Off and QSPI/OPI controls.
- Serial routing on native-USB ESP32 targets now defaults to automatic
  detection from the selected port's USB identity, with explicit Native USB
  and UART bridge overrides for ambiguous devices.
- Default master brightness is now 128 rather than 200, so a first upload on a
  dense build is less likely to hit the power cap or overheat the strip.
- The Generative Show starter is now Music Player, and lays out an Audio source
  and Player Controls already wired into Pattern Master.
- The Hardware pane now shows the GPIO assigned to each part and scales its
  layout spacing with the band size.

### Fixed

- New Project now creates a blank project directly instead of opening a Save As
  dialog after the user chooses to continue without saving the previous project.
- Opening a project file or recent project no longer asks whether to save when
  the current graph contains only its automatic Board node.
- Open Project File now launches its file picker directly from the menu click,
  preventing browsers from silently blocking it after an asynchronous fallback.
- Save Project File As now opens the platform save dialog directly from the
  menu click, preserving the browser permission needed to choose both the file
  name and save location; helper-backed Windows dialogs are explicitly owned
  and topmost so they cannot wait invisibly behind the app.
- Live Stream now sends the palette and RGB frame for the LED output whose
  receiver was flashed, even when another output is selected in the preview,
  and no longer applies the Board master brightness a second time on-device.
- The Music Player starter no longer exports a sketch describing its Player
  Controls node as unsupported; the node is generated by the SD show player,
  and the sketch now says so.

## [0.7.0] - 2026-08-09

### Added

- Added HUB75 scan-panel output as a third `MatrixOutput` hardware family for
  classic ESP32, ESP32-S2, and ESP32-S3 boards. The generated firmware uses
  `ESP32-HUB75-MatrixPanel-DMA` for single panels, horizontal chains, folded
  2D grids, serpentine panel chains, and independently rotated panel tiles.
  Normal uploads, Flash Wiring Test, Live Stream, generative shows, and the
  music-sync SD player all share the same HUB75 configuration and output path.
  Single-panel output and the general wiring diagnostic have been exercised on
  a real ESP32-S3 with a P4 64×64 panel; chained, folded, rotated, streaming,
  and show/player paths remain experimental until their own hardware passes.

- Added a dedicated **Flash HUB75 Topology** wiring-test mode for folded grids.
  Each tile holds unmistakable fixed-colour corners, logical X/Y axes and
  coordinates, configured rotation, panel-chain ordinal, and a direction arrow
  that reverses on serpentine rows. The normal wiring-test cycle includes the
  same topology phase automatically when the MatrixOutput configuration is a
  valid folded HUB75 grid.

- Added a curated ten-pattern featured set and prepared matching community-site
  pattern payloads for richer public examples.

- Added WASM preview-versus-firmware parity tests and a firmware-RAM calibration
  harness, providing byte-level render comparisons and measured checks for the
  pre-upload memory estimator.

### Changed

- Updated the bundled/helper build path to fbuild 2.5.15 and moved the remaining
  GitHub Actions JavaScript runtimes from Node 20 to Node 24.

### Fixed

- Live-audio recordings no longer open on a silent frame when the first browser
  animation sample lands after capture frame zero. The leading level is
  backfilled from the first real sample without duplicating its beat pulse.

- Generated firmware now renders the same palette colours the preview shows.
  Six palettes — `rainbow`, `heat`, `ocean`, `lava`, `forest` and `party` —
  carried a `fastled:` shortcut that emitted FastLED's same-named built-in
  (`RainbowColors_p`, `HeatColors_p`, …) into the sketch, while the preview
  rendered this project's own colour stops. Same palette name, different
  colours, on the default palette of every palette-consuming node. The other
  23 palettes already baked their stops into a `paldef_*` table and matched;
  all 29 now take that path.

  Measured by compiling the generated sketch to WASM and diffing its LED bytes
  against the evaluator frame by frame: a static ramp through `rainbow` went
  from mean Δ 43.6/255 per channel (max 152) to Δ 9.0 (max 50), and Plasma
  from Δ 39–61 to a flat Δ 13.5 — the drift over time disappearing along with
  it. The remainder is a separate, smaller issue: FastLED spreads 16 palette
  entries over 16 intervals and wraps the last back to the first, while
  `samplePalette` spreads them over 15 and clamps.

  **If you have flashed a design using any of those six palettes, its colours
  will change on the next upload** — toward what the preview has always shown.
  Saved projects are unaffected; nothing about their stored shape changes.

- Generated sketches now declare only the palettes they actually name. Every
  palette was previously emitted regardless of use — 29 `CRGBPalette16`
  globals, non-const and so RAM-resident at 48 bytes each. A typical
  single-palette design now spends 48 bytes.

  Measured on a real Arduino Uno build of an 8×8 Plasma sketch: RAM fell from
  1,831 to 775 bytes (89.4% → 37.8% of the 2 KB available) and flash from
  15,032 to 7,072 bytes. That sketch was within a whisker of running out of
  SRAM purely from colour tables nothing read.

  The flash saving is the larger and less obvious half. These globals carry
  dynamic initialisers, so each one also emits constructor code that runs at
  startup — roughly 360 bytes of flash apiece on top of its 48 bytes of RAM.
  An unused palette cost about 408 bytes in total, not 48.

  The SD-show player still declares all of them, and must: a `.show` file
  stores a palette id that `SET_PALETTE` resolves during playback, so any
  palette may be selected by a file the sketch was never compiled against.
  The generative-show controller also keeps the full set, since its pattern
  bodies are rewritten in from separate codegen runs whose palette use isn't
  visible at that point; it targets ESP32-class hardware where the cost is
  under half a percent of RAM.

- The pre-upload RAM estimate now counts palette tables. It had ignored them
  entirely, under-reporting by up to ~1.4 KB. It resolves them the way codegen
  does — reading palette-typed input ports from the node library rather than
  restating which nodes consume one — counting one shared table per distinct
  named palette plus one per palette-building node. The live capacity meter
  was never affected; it reads the real figure from the linker.

## [0.6.1] - 2026-08-06

### Fixed

- Fixed the LED matrix preview collapsing to a postage stamp on short
  viewports — most visibly on Windows at 125% display scaling, where the
  browser viewport drops under the 620px height breakpoint. In that compact
  layout the canvas gave up height three times as fast as the spectrum and
  transport below it, so it rode down onto its own minimum while the
  decoration kept its space; the block was meant to do the opposite. The
  transport rows now hold a content-sized floor of their own so they cannot
  be clipped in return, and the panel scrolls when the matrix and the
  controls do not both fit.

## [0.6.0] - 2026-08-06

### Added

- Shared patterns now carry a looping 5s preview clip captured through the
  same evaluator and renderer the live preview uses, so the community
  gallery can play each card back from that clip instead of live-evaluating
  every pattern on the page at once; live evaluation is reserved for the one
  pattern a visitor actually opens.
- The sharer's own 1–5 star rating now travels with a per-pattern community
  share, seeding the site's rating with a real opinion instead of starting
  every shared pattern at zero. Whole-project shares have no single Pattern
  Library entry to have been rated, so they omit it.

### Changed

- Custom Palette and Poline nodes now show the interactive stop/anchor rail
  at the top of the node body, where the separate gradient preview strip
  used to be, removing the duplicate gradient display.

### Fixed

- Fixed whole-project community shares silently substituting an unrelated
  inner subgraph for the actual canvas content whenever the project used any
  Group nodes: the share path was flattening the top-level canvas and every
  nested group's subgraph into one node list, so the evaluator's terminal
  search could land on a stray nested `GroupOutput` instead of the canvas's
  real one.
- Fixed shared patterns with `MatrixOutput` stripped (the normal
  hardware-agnostic share shape) rendering a "tiny preview": capture fell
  back to evaluating at a hardcoded 16x16 grid while still packing bytes at
  the caller's requested size, leaving roughly three-quarters of every
  frame black.
- Reduced per-frame allocation in the AnimARTrix evaluator path by drawing
  its pixel buffer from the same recycling pool every other node type
  already uses, instead of allocating a fresh buffer every frame.

## [0.5.1] - 2026-08-03

### Changed

- Community sharing now sends a single, hardware-agnostic pattern instead of
  a whole project. A new **Share** icon on each Pattern Library entry hands
  that saved pattern's graph to the community site as-is. The existing
  command-bar **Share** action still hands over the whole active project, but
  now collapses it down to that same shape first, stripping Matrix Output
  and its wires so the shared graph plugs into anyone's rig via that node's
  own defaults rather than the sharer's board, pins, or chipset. Controller
  and LED count still travel along as separate, editable metadata.

## [0.5.0] - 2026-08-03

### Added

- Added a **Share** action to the command bar and File menu that hands the
  current named project directly to the community site: it packages the
  project along with its detected controller and LED count and opens them in
  a new community tab for the maker to review before publishing. Blocked
  pop-ups and projects over the 2 MB community upload limit are reported
  in place; the existing copyable graph share link remains available as a
  separate action, and the handoff does not persist the project or share
  authentication between sites.

### Changed

- Replaced the universal Pattern Ratings percentage with **Pattern Insights**:
  Studio now judges each pattern against an inferred or manually selected
  intent, examines the complete captured run plus multiple audio scenarios,
  and presents a verdict with weak/typical/strong evidence and actionable
  critique. Persistent personal 1–5 star ratings remain independent of Studio
  Score and can be used alongside intent and score when building collections.
  Library scans are now explicit and cancellable and are subject to the same
  per-pattern trust gate described below.

### Fixed

- Fixed preview recordings (PNG/GIF/WebM) diverging from the live preview in
  five ways: exports now render through the same renderers the on-screen
  matrix uses, so soft/dreamy/cyberpunk/neon/CRT styles and cross-LED glow
  bleed are captured correctly instead of exporting flat; a captured
  PerformanceGenerator show overlay is no longer dropped; a new warm-up
  option renders and discards leading frames so Fire/Trails/Particles/Game of
  Life/Reaction-Diffusion start settled instead of in their blank boot state;
  and 1-row/1-column strip exports no longer gain a phantom black row. A
  related fix replays a folded recording of the live microphone so
  audio-reactive graphs animate in exports instead of sampling one frozen
  instant.

- Fixed a freeze when a full Pattern Insights library scan completed:
  evidence thumbnails now render directly from packed pixel bytes and
  memoize so unrelated card updates don't redraw every canvas, instead of
  mounting the full live LED renderer three times per result card.

- Fixed a GIF export freeze by moving quantization and LZW compression off
  the UI thread, replacing the expensive gradient median-cut path with a
  fast balanced RGB palette, and adding backpressure, cancellation, and
  bounded finalization memory.

- Fixed a WebM recording freeze by rasterizing frames through the shared
  pixel-buffer renderer, skipping obsolete catch-up frames instead of
  blocking the page, and showing an explicit finalization state after the
  last frame.

- Fixed a PNG export freeze by rendering snapshots through the same shared
  rasterizer and showing an explicit finalization state while the browser
  compresses the image.

### Security

- Nested subgraphs — a Group, or a pattern reached through
  `Pattern Collection → Show Engine` — now honor the workspace's untrusted
  trust flag. `evaluateGraph`'s two recursion points previously fell back to
  their `trusted = true` default, so an imported, share-linked, or
  project-file workspace the user had not yet approved via "Trust and run"
  would still execute `CustomFormula`/`FieldFormula`/`Code` nodes as soon as
  they sat inside a group or a pattern collection — the normal shape of a
  shared pattern.

- Pattern Insights scanning now resolves trust per pattern instead of always
  rendering as trusted. Bundled curated patterns run as before; any other
  pattern containing a gated node (directly or in a nested group) prompts
  "Trust and rate" vs. "Skip this pattern" before it executes. A yes is
  remembered by content; a no is not cached, so the pattern is asked again
  on the next scan rather than left permanently unrateable.

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

- Fixed Intel macOS desktop dependency resolution by retaining the
  `cryptography <49` constraint required by `esptool 5.3.1`, compiling the
  matching fbuild 2.5.4 source in macOS packages, and adding Intel macOS to the
  cross-platform dependency-compatibility matrix.

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
