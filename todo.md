# TODO

## Release readiness — public beta

### P0 — release blockers

- [ ] **Make imported and shared graphs untrusted by default.** A graph received through a share link, JSON import, project file, or pattern file must not execute `CustomFormula`, `FieldFormula`, or `Code` preview source until the user explicitly trusts it. Show a clear trust banner, preserve the decision with the project, and never auto-trust merely because the graph was autosaved after import.
- [ ] **Replace unrestricted formula evaluation.** Remove `new Function` from `CustomFormula` and `FieldFormula`; parse and evaluate a documented expression grammar with only the supported variables, operators, `Math` functions, and FastLED shims. Add adversarial tests covering `globalThis`, constructors, property access, assignment, network calls, storage access, and infinite/expensive expressions.
- [ ] **Sandbox Code-node preview execution.** Run the C++→JS preview shim outside the app's main window with no DOM, storage, cookie, navigation, or network access; enforce execution time/work limits and terminate a runaway preview. Keep raw C++ export/upload explicitly user-authored and display a trust warning before uploading code received from another person.
- [x] **Fix the Show Pipeline GPIO collision.** Matrix Output's default LED data pin and SD Card's default chip-select pin were both GPIO 5. SD Card's `sdCsPin` default (node library, player/provisioner sketch generators, and the showUpload fallback) is now GPIO 10, which doesn't collide with Matrix Output's LED data pin (5), clock pin (6, SPI chipsets only), or the SD/mic I2S pin defaults (26/25/22, 39/40/41).
- [x] **Validate hardware pin assignments before export/upload.** `findPinConflicts()` (`src/utils/validateGraph.ts`) collects every GPIO-typed property across `MicInput`, `MatrixOutput` (data pin always, clock pin only for SPI chipsets), `ButtonInput`, `PotInput`, `EncoderInput`, and `SDCard`, and flags any GPIO number reused across two roles — including two roles on the same node — as a conflict (there's no shared-bus concept in the generated firmware today, so any reuse is a real conflict, not an intentional one). Folded into `validateGraph`'s errors, and `MatrixOutputUpload` now disables Upload / Flash Stream Receiver / Live Stream / Upload show to SD and lists the conflicts inline whenever one exists (Export .ino / View Code stay available for debugging).
- [x] **Restore a green test baseline.** The StudioNode matrix-aspect-ratio test asserted the pixel height on the `<canvas>` itself; `NodePreview`'s `FrameThumb` now sets that height on the `.frameWrap` wrapper div instead (the canvases fill it via CSS `100%`). Updated the test to assert the wrapper's height — the rendered layout (112px tall preview at a 16×8 matrix ratio) is unchanged, only the assertion target. Full suite (1746 tests), lint, and build are green.

### P1 — hardware confidence and release engineering

- [ ] **Define the beta support matrix.** Publish the exact tested combinations of OS, browser, board, chipset, matrix size/layout, build engine, and upload method. Label other catalogue entries experimental until validated.
- [ ] **Run a repeatable hardware smoke suite.** For each supported combination, verify compile, upload, color order, matrix orientation, brightness, power cap, microphone input where applicable, live stream, reconnect/re-upload, and a representative generated pattern. Record firmware size, RAM use, and observed result.
- [ ] **Validate advanced ESP32-S3 paths on hardware.** Cover PSRAM modes, panel tiling/rotation, custom XY maps, non-crossfade show transitions, beat-triggered show advance, particle overlays, baked song envelopes, group-input modulation, and serial live streaming.
- [ ] **Add upload-helper tests and CI.** Test Python request validation, engine selection, FQBN translation, project/pattern path safety, streaming port ownership, show-upload failure phases, and generated fbuild configuration without requiring attached hardware.
- [ ] **Pin Python dependencies reproducibly.** Replace broad `>=` requirements with tested versions or a lock/constraints file, add an update procedure, and verify fresh Windows/macOS/Linux installs in CI or release smoke testing.
- [ ] **Add release metadata.** Choose and add a project license, third-party notices, changelog, supported-platform policy, security-reporting instructions, and version/tagging procedure. Confirm Essentia.js, fonts, icons, FastLED, and bundled/generated assets meet their attribution and redistribution requirements.
- [ ] **Provide a consumer-friendly distribution.** Evaluate signed Windows/macOS/Linux desktop packages or a bundled launcher/runtime so beta users do not need to manage Node and Python manually. Keep the source launcher as the developer path.

### P1 — first-run UX and workflow

- [x] **Turn the empty canvas into an interactive start screen.** `NodeGraphCanvas` now replaces the passive empty-state copy with a launch card offering `Start with Rainbow`, `Audio-reactive demo`, `Browse starter patches`, and `Blank canvas`. Starter actions load in one click through the shared `startFlow` helper, immediately request a fit-to-view on the fresh nodes, and remember the last start choice so the first-run path animates both the node previews and the main LED preview without a separate gallery trip.
- [x] **Promote starters outside the File menu.** `MenuBar` now has a persistent **✦ Start** button outside the File menu, opening a redesigned `TemplatesPopup` start gallery. The gallery renders thumbnail graph previews for each starter, adds a `Blank Canvas` card, and remembers the user's last start choice (`uiStore.lastStartChoice`) so someone who prefers blank canvas sees that preference reflected without hiding the starter cards.
- [x] **Split the current Show Pipeline template.** `src/state/starterTemplates.ts` now replaces the combined Show Pipeline starter with two focused templates: `Generative Show` (`Pattern Collection → Show Engine → Matrix Output`) and `Music-synced SD Show` (`Music Library → Performance Generator → SD Card → Matrix Output.sdcard`). `TemplatesPopup` renders short completion steps for each template, and `validateGraph()` / `MatrixOutputUpload` now treat an SD-card-only Matrix Output path as valid for the music-sync upload workflow instead of forcing the misleading `PerformanceGenerator.frame` preview wire.
- [ ] **Add progressive disclosure to the 132-module library.** Provide Beginner/All views, favorites, recent modules, intent tags, and curated recipe/subgraph cards such as `Audio to brightness`, `Beat-triggered random`, and `Add trails`.
- [ ] **Improve compatible-node discovery.** Extend drag-to-create with ranked suggestions, brief “why this fits” descriptions, and a way to insert a complete adapter/utility chain when no direct compatible input exists.
- [ ] **Unify the project mental model.** Clearly distinguish autosaved projects, portable project files, JSON graph interchange, firmware export, snapshots/recovery, and share links. Use the same nouns in File actions, dialogs, status messages, README, and Help.
- [ ] **Replace ambiguous save prompts.** Use explicit actions such as `Save and continue`, `Continue without saving`, and `Cancel`; show the current project name and destination and preserve keyboard behavior.

### P1 — guided hardware workflow

- [ ] **Build a Matrix Output setup wizard.** Guide users through board, chipset, dimensions/layout, pins, color order, power, build engine, and connection test while keeping expert controls available on the node.
- [ ] **Add a wiring diagnostic/test pattern.** Generate numbered pixels/panels plus RGB/color-order, origin, serpentine, rotation, and brightness tests; support flashing it before the user's full graph.
- [x] **Validate layout inputs inline.** `validateMatrixLayout()` (`src/state/xyLayout.ts`) now reports exact Matrix Output layout problems: uneven panel divisibility, invalid `tileRotations` entries/count, and empty/invalid/wrong-length/non-permutation `customXYMap` JSON. `findMatrixLayoutErrors()` folds those into `validateGraph`'s errors, `MatrixOutputUpload` blocks Upload / Flash Stream Receiver / Live Stream / Upload show to SD / Export `.ino` and shows the inline error text, and `matrixTileLayout()` suppresses the cosmetic panel-grid overlay while the panel layout is invalid. `buildXYTable()` still keeps its row-major fallback as a safety net, but users no longer hit it silently.
- [x] **Estimate electrical load.** `estimatePowerLoad()` (`src/utils/validateGraph.ts`) computes LED count from MatrixOutput's grid dims and a worst-case full-white draw (~60 mA/LED, the typical WS2812-class figure), against the configured `powerLimit` cap when set. `MatrixOutputUpload` shows a compact readout (LED count, worst-case amps, configured cap or a recommended PSU size when no cap is set), and `validateGraph` warns when worst-case draw would exceed the configured cap.
- [x] **Estimate firmware resources before upload.** `estimateFirmwareRam()` (`src/utils/validateGraph.ts`) walks backward from MatrixOutput to find every node that actually feeds the sketch (unreached nodes get no buffer, matching codegen), summing the physical `leds` array, each reachable `frame`/`field` render buffer, and known heavy simulation-node state (Fire2012's heat map, Game of Life's cell grids, Reaction-Diffusion's u/v grids, WaveSim's p/c/n grids, Particles' fixed pool) — split into internal-RAM vs. PSRAM-offloaded totals based on MatrixOutput's `usePsram` toggle (stateful-node state always stays internal, per the PSRAM section above). `MatrixOutputUpload` shows a compact KB readout, and `validateGraph` warns when the internal estimate is large enough to be worth a PSRAM nudge. Retaining the post-compile flash/RAM report remains a follow-up.
- [ ] **Clarify helper/engine readiness.** Show whether the local helper, selected engine, board core/toolchain, port, and permissions are ready before the user presses Upload, with a single action for each missing prerequisite.

### P2 — UI, visual system, and accessibility

- [ ] **Reduce menu-bar competition.** Keep File, undo/redo, Tidy, performance/stage, preview style, and Mic readily available; move Theme, Motion, Contrast, UI FX, and signal-path dimming into a compact View/Preferences menu without weakening keyboard access.
- [ ] **Define the signature visual hierarchy.** Make the living LED preview and active patch signal the brightest elements; reduce persistent glow on static borders and inactive controls so selection, beats, errors, and live hardware state carry more visual weight.
- [ ] **Give display typography a distinctive instrument voice.** Trial and locally bundle a characterful display face for the brand, rack-bank labels, stage readouts, and key status text while retaining a highly legible body/control face. Validate all three themes and avoid making dense node controls decorative.
- [x] **Standardize dialogs.** `AppDialogHost` (`src/components/AppDialog/`) renders alert/confirm/prompt dialogs driven from `uiStore`'s `requestAlert`/`requestConfirm`/`requestPrompt`, with explicit action labels, `role="dialog"` + `aria-modal`, initial focus (primary button or prompt input), a Tab focus trap, Escape-to-cancel, and focus restoration to the triggering element on close. All `window.alert`/`prompt`/`confirm` call sites (menu bar, sidebar, node context menu, group controls, projects/recover/templates popups) now go through it.
- [ ] **Complete keyboard and screen-reader behavior.** Add roving focus/arrow-key behavior for menus, announce transient status through an `aria-live` region, ensure hidden panels are inert, and test node creation, connection, configuration, save/load, and upload without a mouse.
- [ ] **Document the desktop viewport contract.** Define a supported minimum size and graceful narrow/short-window behavior. Verify menus, preview, node controls, dialogs, and status information do not become unreachable.
- [ ] **Complete PWA polish.** Fix the missing favicon path ([x] done — `index.html`'s `<link rel="icon">` pointed at a nonexistent `/favicon.svg`; now points at `/icon.svg`, the file the manifest already uses), provide appropriate 192/512 and maskable icons, precache required PNG branding assets, verify first-install/offline behavior, and communicate that hardware upload still needs the local helper.
- [ ] **Update public documentation.** Remove obsolete WebSerial and upload-panel claims, replace old node names, document current microphone controls and upload behavior, add starter/show walkthroughs, and ensure README, Help, `CLAUDE.md`, and `todo.md` agree.

### P2 — existing node improvements

- [ ] **Add node presets and variation tools.** Support `Save preset`, `Load preset`, `Randomize look`, `Mutate`, and `Reset` for suitable nodes. Randomization must respect property metadata, avoid hardware pins/settings, and be undoable as one action.
- [ ] **Add deterministic seeds to generative nodes.** Expose an optional seed on noise, particles, simulations, and stochastic patterns so a look can be reproduced in preview, generated firmware, groups, and shows.
- [x] **Expand Beat Flash controls.** `BeatFlash` now has flash `color` (r/g/b, hidden once a palette is picked) or an optional wired/selected `palette` (sampled by elapsed decay phase), `intensity` (0–2 overdrive), `blendMode` (`screen`/`add`), an `attack` ramp (0 = old instant-snap default, up to 1.5s), and a `preserveBase` toggle (on = blend into the base frame as before; off = the lit pixels are fully replaced by the flash color). All defaults reproduce the exact old visual (white, screen, instant, decay 0.85) for backward compatibility. Evaluator (`src/state/graphEvaluator.ts`) and codegen (`src/codegen/cppGenerator.ts`) share the same attack/decay/blend math; 8 new tests cover both.
- [ ] **Expose variant-specific Particles controls.** Add emission position/shape, count, size, spread, lifetime, gravity/wind, bounce, and trails where relevant; gate controls by `particleType` rather than presenting irrelevant options.
- [ ] **Expand fire controls.** Add direction/orientation, turbulence or spread, heat/palette mix, mirroring, and deterministic reseeding while keeping Fire and Fire 2012 clearly differentiated.
- [ ] **Expand percussion/ripple controls.** Give Percussion Blobs, Rain Ripples, Kick Shock, and similar nodes useful count, size/thickness, lifetime/decay, spawn distribution, and blend controls.
- [ ] **Improve Text authoring.** Add horizontal/vertical alignment, scroll direction, letter spacing, preview-safe multiline behavior, and a clearer custom-font manager with validation feedback.
- [ ] **Add transition thumbnails and scrubbing.** Show a small visual sample for each Transition/Transition Set choice and let users scrub progress without wiring a temporary control signal.
- [ ] **Build a direct palette editor.** Give Custom Palette and Poline draggable color stops/anchors, stop positions, add/remove/reorder actions, and reusable palette presets while preserving port-driven colors.
- [x] **Handle preview-only nodes explicitly.** `MidiInput` already carries an on-node `Preview-only` caption (`PREVIEW_NOTES` in `StudioNode.tsx`); the missing piece was firmware validation staying silent. `findPreviewOnlyWarnings()` (`src/utils/validateGraph.ts`) now warns whenever a browser-only node (currently just `MidiInput`; the check is a shared set so future additions get the same warning for free) is actually wired to something, since the generated firmware always substitutes its idle default. Folded into `validateGraph`'s warnings.
- [ ] **Resolve Performance Generator's frame semantics.** Either make its frame output render the selected/generated show consistently in preview and firmware, or remove the misleading frame terminal and route show preview through an explicitly preview-only monitor path.

### P3 — high-value node additions

- [ ] **Clock / Transport node.** Output BPM, continuous phase, beat, bar, and selectable subdivisions; support tap tempo, free-run/external sync, reset, preview/codegen parity, and show/MIDI integration where available.
- [x] **Trigger utility nodes.** A bundled `Trigger` node (math, like `Math`/`Ease`) with a `triggerOp` variant: Debounce (commits a change only once stable for `stableTime`), Toggle/Flip-Flop, One Shot (holds true for `holdTime` after a rising edge, ignoring retriggers while already high), Pulse Divider (fires every `divideBy`th rising edge), and Trigger Delay (fires once, `delayTime` after the edge). Evaluator + millis()-based codegen share the same edge semantics; 10 new tests.
- [ ] **Frame Feedback / Delay node.** Provide a bounded previous-frame buffer with delay, fade, transform, and blend controls so recursive video-synth effects are possible without permitting graph cycles; document RAM cost and PSRAM behavior.
- [ ] **Segments / Zones node.** Define named rectangular, indexed, or mask-driven regions and route/composite frames into them for installations with multiple logical areas.
- [ ] **Multi-output controller support.** Allow multiple independently configured LED controllers/strips, pins, color orders, and layouts, including validation of shared resources and an explicit composition/routing model.
- [ ] **Hardware Test Pattern node or mode.** Expose reusable color-order, index chase, panel number, current-limit, and dead-pixel diagnostics without requiring users to construct a normal creative graph.

### Release exit criteria

- [ ] All lint, unit, component, build, upload-helper, and security tests pass from a clean checkout.
- [ ] No imported/shared content can execute preview code before explicit trust, and the trust boundary has adversarial test coverage.
- [ ] Every advertised beta hardware combination has a dated smoke-test record; experimental combinations are labelled in the UI and documentation.
- [ ] A first-time user can launch, load a starter, see an animated result, configure supported hardware, and export or upload it without consulting source-code documentation.
- [ ] Pin, layout, power, board/toolchain, and graph validation prevent known unsafe or non-functional uploads with actionable messages.
- [ ] Keyboard-only and screen-reader smoke tests cover the core authoring and upload workflow.
- [ ] Offline/PWA behavior, icons, documentation, licensing, versioning, and release artifacts have been verified from a fresh machine/account.

## Core Graph

- [x] Port type validation — reject connections between incompatible data types (e.g. `audio` → `float`)
- [x] Connection error feedback — status bar error toast on incompatible drop
- [x] Node snap to 20 px grid
- [x] Undo / redo — 100-step history stack
- [x] Autosave — serialize graph to `localStorage` every 10 seconds
- [x] Save / load — export graph as JSON, import from file (MenuBar ↓ Save / ↑ Load, also Ctrl+S)
- [x] Node search — filter sidebar by typing
- [x] Right-click context menu on canvas — "Add node", "Paste", "Select all"
- [x] Right-click context menu on node — Duplicate, Delete, Disconnect All
- [x] Shift-click / shift-drag to multi-select nodes
- [x] Unplug a noodle from a node's input (drag off to disconnect, or re-route)

## Node Groups & Compositing (ADR 0001)

- [x] Pattern node-group encapsulation — "Make Group", enter/exit a group, live preview at both tiers
- [x] Multi-graph store + `getGroupRegistry`; per-instance stateful-node isolation; group-cycle guard
- [x] Exposed group parameters via `GroupInput` nodes (external/hardware values drive a group)
- [x] Group codegen (flatten subgraphs into the root sketch)
- [x] Per-layer buffer codegen — real `LayerBlend` / `BlendFrames` / `Crossfade` / `Wipe` / `Dissolve`
- [x] `Sequencer` node — timed crossfade across inputs (preview + codegen)

## LED Preview

- [x] Evaluate the actual node graph at runtime instead of the placeholder animation loop
- [x] WebGL shader pipeline (60 fps, per-LED disc + 5×5 glow, Canvas 2D fallback)
- [x] Resize preview — reads width × height from MatrixOutput node (up to 64 × 64)
- [x] Preview renders only what reaches an output terminal (matches what gets flashed)
- [x] 3D rotate mode — drag to orbit the matrix panel in perspective (CSS 3D, no extra deps)

## Audio

- [x] Wire Web Audio API `AnalyserNode` for real microphone FFT
- [x] Connect FFT output to `FFTAnalyzer` node outputs (bass / mids / treble float values)
- [x] Beat detection — 30-frame rolling average with 300 ms cooldown
- [x] Audio visualizer bar display in the preview panel (16 bars, cyan → magenta)

## Upload Pipeline

- [x] C++ code generator — topological walk of node graph emitting FastLED `.ino`
- [x] Upload panel modal — live code preview, graph validation, board selector
- [x] WebSerial connect / disconnect at 115200 baud
- [x] `.ino` download button
- [x] Serpentine matrix layout — `XY()` remap on output (toggle on MatrixOutput)
- [x] Local build & flash via `arduino-cli` — Upload panel generates per-board compile/upload commands

## Nodes

- [x] Math: Add, Multiply, Clamp, MapRange, Sin, Cos, Lerp, Abs, Mod, Min, Max, Random, Counter, Gate, Not, Compare, BeatSin, XYMapper
- [x] Color: HSV→RGB, CHSV, BlendColors, GradientSampler, PaletteSampler, PaletteSelector
- [x] Pattern: SolidColor, NoiseField, Plasma, Fire, Fire2012, SpectrumBars, Noise2D, Simplex2D, Noise3D, RadialBurst, Spiral, Kaleidoscope, Particles, GradientFrame
- [x] Audio-reactive: BassPulse, MidrangeWaves, TrebleSparks, BeatFlash, AudioHue
- [x] Compositing / transition: BlendFrames, BrightnessMod, HueShift, Invert, Blur2D, LayerBlend, Crossfade, Wipe, Dissolve
- [x] Multi-Pattern Master — 4-slot queue, cycle/beat modes
- [x] Custom Formula — inline JS expression with x/y/t/W/H/a/b vars
- [x] Shapes: Span, Rect, Circle, Line (paint over an optional base frame)
- [x] Text — built-in 3×5 bitmap font, horizontal scroll, + custom font upload
- [x] Mask — luminance masking / feathering
- [x] Worley (cellular / Voronoi) noise
- [x] Reaction-Diffusion (Gray-Scott)
- [x] Game of Life — fading trails, auto-reseed
- [x] Palettes as first-class data — `CustomPalette` from colors, `PaletteBlend` interpolation, presets→`CRGBPalette16`
- [x] Palette propagation through ports (no longer encoded as a float)

## Polish / UX

- [x] Node creation fade-in + scale animation (200 ms)
- [x] Connection spark effect at port on successful link (150 ms)
- [x] Keyboard shortcuts — Ctrl+Z undo, Ctrl+Y redo, Ctrl+S save, Delete selected node
- [x] MiniMap with per-category node and edge colors
- [x] Category model — by output type (audio / hardware / math / color / pattern / composite / output)
- [x] Inline property editors on nodes (Blender-style); Inspector is opt-in
- [x] Node shelf tooltips
- [x] Solarized Dark and Studio Light themes (cycle via MenuBar ☾/✦/☀)
- [x] Reduced-motion toggle and high-contrast mode (WCAG AA)
- [x] PWA / offline support (service worker + manifest)

## Music-Sync Show Pipeline (PR #58)

Offline path: audio track → timed `.show` file → ESP32-S3 plays it in sync.
See *Music-Sync Show Pipeline* in `CLAUDE.md`.

- [x] `MusicLibrary` node — drop MP3s, offline Web Audio analysis (BPM, energy envelope, beats, sections, mood)
- [x] `PerformanceGenerator` node — rules engine mapping analysis → timed `ShowFile` event stream
- [x] `.show` binary format — compact event stream, binary-searchable by audio position (`src/types/showFile.ts`)
- [x] `SDCard` node — packages `.show` files + player sketch into a downloadable ZIP (`src/utils/zipExport.ts`)
- [x] Player sketch generator — FastLED + ESP32-audioI2S, slaves commands to `audio.getPosition()`
- [x] MusicLibrary panel UI + MenuBar ♪ Music button; `musicStore` analysis queue
- [x] On-device validation — confirmed A/V sync drift acceptable on real ESP32-S3 + I2S hardware
- [x] Show editor / timeline — review and hand-tweak generated events before export (`ShowTimeline.tsx`: scrubbable marker track + editable event list; retime / change command / edit params / add / duplicate / delete; edits persist via `musicStore.updateShow` and survive generator-option changes until **Revert**)

## Tooling

- [x] ESLint flat config + CI (lint / test / build on every PR)
- [x] Test suite — Vitest + jsdom (graphEvaluator, cppGenerator, graphStore, font, nodeLibrary, validateGraph)
- [x] Component tests — @testing-library/react (StudioNode)
- [x] Architecture decision record — `docs/architecture/decisions/0001-pattern-node-group-architecture.md`

## Backlog

- [x] Add more particle types — `Particles` is now a bundled node with a `particleType` variant: fountain, gravity/bounce, fireworks burst, sparkle rain, comet trail, snow drift, swarm flocking. Live preview + real fixed-pool C++ codegen (replacing the old stub) for every mode.
- [x] Add more FastLED built-ins to code editor — `sin8`/`cos8`/`sin16`, `beatsin8`/`beatsin16`, `beat8`/`beat16`, `scale8`/`nscale8`, `qadd8`/`qsub8`, `triwave8`/`quadwave8`/`cubicwave8`, `ease8InOutQuad`/`ease8InOutCubic`, `blend8`, `lerp8by8`/`lerp16by16`, `sqrt16`, `fill_solid`/`fill_rainbow`, `nblend`, `CRGB::<Name>` constants, and FastLED preset palettes via `ColorFromPalette`/`fill_palette`/`CRGBPalette16` (`RainbowColors_p`, `OceanColors_p`, `LavaColors_p`, …). The wave/easing/blend shims live in the shared `src/state/fastledShims.ts`, so the field-formula nodes get them too.
- [x] **Code node** — paste raw FastLED C++ as a node (verbatim codegen, C++→JS shim for preview); Global + Loop editors, on-node error messages; design note at `docs/development/design/code-node.md`
- [x] **Fade** node — fades a frame toward black (FastLED `fadeToBlackBy`), preview + codegen

## ANIMartRIX / Float Field pipeline

Design note: `docs/development/design/animartrix-float-field.md`

ANIMartRIX patterns use a **coordinate → scalar → color** model that the current
frame-centric graph can't express. Solution: add a `field` port type (per-pixel
`Float32Array`, values 0–1) and a small set of field nodes.

### Phase 1 — `field` type + core nodes ✅ (merged, PR #69)
- [x] Add `field` to `PORT_COLORS` and `portsCompatible` in `nodeLibrary.ts`
- [x] **`FieldFormula`** node (category: `pattern`) — per-pixel expression outputting a `field`; built-in vars: `cx`, `cy`, `r`, `angle`, `t`, `W`, `H`, `a`, `b`, `fieldIn`; FastLED shims: `sin8`, `cos8`, `sin16`, `beatsin8`, `beatsin16`, `scale8`, `qadd8`, `qsub8`
- [x] **`FieldToFrame`** node (category: `pattern`) — maps a `field` through a palette → `frame`; `palette` input + property, `brightness` property
- [x] Enhance **`CustomFormula`** — add same `cx`/`cy`/`r`/`angle` vars and FastLED shims (backward-compatible; existing graphs unaffected)
- [x] Evaluator cases for `FieldFormula` and `FieldToFrame` (compile formula once into a cache, run per pixel into `Float32Array`; `FieldToFrame` samples palette)
- [x] Codegen cases for `FieldFormula` (double `for` loop + verbatim expression) and `FieldToFrame` (`ColorFromPalette` per pixel)
- [x] `NODE_DESCRIPTIONS` entries + unit tests (sandbox shims, evaluator, codegen) — `src/state/fastledShims.ts` shared by preview + codegen

### Phase 2 — field composition nodes ✅ (merged, PR #70)
- [x] **`DistanceField`** node (category: `pattern`) — per-pixel Euclidean distance to a movable `(px, py)` point; inputs: `px`, `py` (float); `scale` (1–4) stretches the ramp; output: `field`
- [x] **`FieldMath`** node (category: `pattern`) — combine two fields pixel-by-pixel; `fieldOp` property: add, subtract, multiply, mix, min, max, difference; inputs: `a`, `b` (field); output: `field` (header reflects the op via `nodeDisplayLabel`)
- [x] **`FieldWarp`** node (category: `composite`) — sample a `field` at coordinates shifted by two offset fields (`dx`, `dy`); `strength` property; nearest-neighbour, edge-clamped; output: `field`
- [x] Evaluator + codegen + tests for each (9 new tests)
- [x] `Noise` node: now exposes a raw `field` output alongside `frame`, so bundled noise variants can feed FieldMath / FieldWarp / FieldToFrame directly

### Phase 3 — coordinate-space transforms ✅ (merged, PR #71)
- [x] **`FieldRotate`** node (category: `composite`) — rotate a field around its centre by an `angle` float input (degrees) + `spin` (deg/sec) property; wraps at boundary
- [x] **`FieldTile`** node (category: `composite`) — tile/repeat a field `tilesX`×`tilesY` times across the matrix
- [x] Evaluate whether these fold into `FieldWarp` presets or warrant standalone nodes → **standalone** (whole-field coordinate transform vs FieldWarp's per-pixel additive offsets)
- [x] Evaluator + codegen + tests (7 new)

## FastLED library parity (repo review, 2026-07-10)

From a review of the upstream FastLED repo (README, 3.9.x/3.10.x release notes,
and the bundled `src/fx` effect catalogue) against Studio's node library and
codegen. Ordered by value-for-effort.

### MatrixOutput hardware parity (quick wins) ✅

All six ship through a shared `ledHardwareFromProps`/`fastledSetupCpp`/`overclockDefineCpp`
helper in `cppGenerator.ts`, so the normal sketch, the show controller, and the
music-sync player initialise the strip identically from the MatrixOutput node.

- [x] **Global brightness** — `brightness` slider (0–255, default 200 = the old hardcoded value) on MatrixOutput; emitted as `FastLED.setBrightness(...)` and mirrored in the live preview (`applyMasterBrightness` in `LEDPreview.tsx`) so preview matches firmware
- [x] **Color correction** dropdown — `correction`: none / TypicalLEDStrip / TypicalPixelString → `FastLED.setCorrection(...)` (preview deliberately *not* corrected: correction compensates the LEDs so hardware matches the intent the preview shows)
- [x] **Temporal dithering** toggle — `dither` (default on = FastLED's own default, emits nothing); off emits `FastLED.setDither(DISABLE_DITHER)`
- [x] **Overclock** — `overclock` slider (1–1.7×) emitting `#define FASTLED_OVERCLOCK <x>` before the FastLED include; editor disabled (and define suppressed) for SPI chipsets
- [x] **Expanded chipset list** — added WS2815, WS2816, SM16824E, APA102HD, HD108; SPI chipsets (APA102/APA102HD/WS2801/HD108) now get a `clockPin` property + `CLOCK_PIN` in `addLeds` (the old two-arg emission silently used the colour-order enum as the clock pin); `NEOPIXEL` fixed to omit the order arg (its FastLED alias hardcodes GRB)
- [x] **RGBW strips** — `SK6812-RGBW` chipset option → `addLeds<SK6812, …>(…).setRgbw(RgbwDefault())`; chipset/correction strings are sanitised against the nodeLibrary option lists before hitting C++ template args

### Missing classic `fx/` effects (pattern nodes)

- [x] **TwinkleFox** — palette-driven twinkling lights (Kriegsman classic); Generative subcategory, `speed` + `palette` inputs, `density` slider (sparse sharp sparkles → most pixels lit); evocative homage like Pride2015/Pacifica (a per-pixel `twinkleHash` driving an independent brightness cycle, identical maths on preview + firmware). Not yet hardware-validated.
- [x] **Cylon / Scanner** — Larson scanner as a one-node pattern (`Scanner`: width, fade, palette, horizontal/vertical axis); live preview + firmware codegen land together so the beam sweeps identically in Studio and on hardware
- [x] **Confetti** — random fading speckles (`Confetti`: palette-driven speckles on a persistent buffer with `speed`, `density`, and `fade`); live preview + firmware codegen now mirror the same fade-and-sprinkle structure
- [x] **Juggle / Sinelon** — `Juggle` now renders N sine-driven palette dots on a persistent trail buffer; `count = 1` covers the Sinelon case, and preview + firmware codegen share the same fade-and-sweep structure

### Bigger features

- [x] **`WaveSim` — 2D wave/ripple simulation** — added as a field node with a triggerable damped-ripple solver, live preview, C++ codegen, and clean composition through `FieldToFrame` / the rest of the field pipeline
- [x] **`Path` node — parametric path drawing** — added as a Shapes & Text node with circle / heart / lissajous / rose presets, a 0–1 `t` input, and subpixel splatting in both preview and firmware codegen
- [x] **Subpixel splatting** for Circle/Line/Particles — preview + C++ now use soft additive coverage for shape/particle float coordinates instead of hard integer snapping, so motion reads much smoother on small matrices
- [x] **Supersample toggle** on MatrixOutput — a `supersample` toggle renders the whole graph at 2× the matrix resolution and averages each 2×2 block down to one LED, in both the live preview and the generated sketch (render buffers become the 2× size; the physical `leds` strip stays native, downscaled at MatrixOutput). Applies to the normal sketch + preview; show/player generators stay native
- [x] **ColorBoost** — added as a small composite node (`ColorBoost`) with luminance-preserving channel scaling in both preview and firmware codegen
- [x] **4D Perlin noise** — bundled `Noise` now has a `noise4d` variant using a circular `z/t` path through `inoise16(x, y, z, t)` for seamless looping; preview mirrors the same loop with a browser-side approximation

### Noted, lower priority

- [x] **Animated GIF on the `Image` node** — the `Image` node now handles both stills and GIF/APNG/WebP animations in one node (drop either; frames + per-frame durations stored in `properties.animation`, still in `properties.image`). Live-preview playback with source timing + `playbackRate`/`loop`, and a PROGMEM multi-frame array with a millis-driven frame lookup in codegen. The separate `AnimatedImage` node was folded in and old saves migrate on load
- [ ] Long-term: **non-matrix layouts** (strip / ring / corkscrew) — FastLED is investing in corkscrew mapping and 1D geometries; Studio is matrix-only end to end, so this is a project, not a feature
- Migrating the custom I2S+FFT engine to FastLED 3.10's native audio framework was considered and **deliberately deferred** — ours is hardware-validated and already gates around their IDF driver conflict; revisit when theirs stabilizes

## Direction & In-Flight Work

Current focus: **stabilize & document**.

### Integration from `feature/thmi-touchscreen-ui` ✅ (branch deleted)

All viable features from that branch have landed on `main`. See
`docs/development/plans/thmi-feature-integration.md` for the original replay plan.

- [x] FFT-based music analyzer rewrite — `essentiaAnalyzer.ts` + worker (Essentia.js WASM: RhythmExtractor2013, KeyExtractor, danceability-aware mood) live on `main` as a drop-in alternative to `musicAnalyzer.ts`
- [x] In-browser audio preview + synced show timeline — `showPreview.ts` + `PerformanceGeneratorBody.tsx` (`590866b`)
- [x] Spectral-analysis audio nodes + audio-node C++ codegen upgrade — on-device INMP441 I2S mic + self-contained FFT codegen (`audioEngineCpp` in `cppGenerator.ts`); `MicInput` exposes `i2sWs`/`i2sSck`/`i2sSd`/`channel`; `FFTAnalyzer`/`BeatDetect` resolve to live `_audioBass`/`_audioMids`/`_audioTreble`/`_audioBeat`. **Hardware-validated** on ESP32-S3 + INMP441 (2026-06-28).
- [x] 13 transition variants (Iris, ClockWipe, Push, Checkerboard, Diagonal, Blinds, Ripple/Spiral Wipe, Curtain, ScanLines, Zoom, Fade-through-Black/White) folded into the bundled `Transition` node (16 total); C++ codegen rewritten against the buffer-compositing model; 31 new tests

### Stabilize & document

- [x] Keep `CLAUDE.md` / `todo.md` in step with each merged PR
- [x] Delete `feature/thmi-touchscreen-ui` once its features are fully replayed

### Non-functional code audit follow-ups

- [x] Fix `ButtonInput` firmware setup: honour the `pullup` property by emitting `pinMode(pin, INPUT_PULLUP)` (or `INPUT`) in `setup()` before `digitalRead`
- [x] Make pattern-show detection follow the graph path into `MatrixOutput`; a disconnected `PatternMaster` must not replace a valid normal sketch — `isPatternShow` requires the `PatternMaster`'s `frame` output to actually reach a `MatrixOutput`
- [x] Complete Pattern Master firmware parity: support the wired `beat` trigger and selected transition pool instead of always using a time-based crossfade — `showGenerator.ts` now draws from the full 16-style pool and honours a wired beat; not yet hardware-validated
- [x] Review intentional preview fallbacks and make them explicit in the UI — `PREVIEW_NOTES` in `StudioNode.tsx` renders a muted on-node caption for the `ButtonInput`/`PotInput`/`EncoderInput` stubs and the black `PerformanceGenerator.frame` placeholder; the audio fallback was already explicit (FFTAnalyzer's MIC LIVE / TEST SIGNAL / SILENT pill + opt-in Test toggle, BeatDetect's LIVE / PREVIEW badge)

## App review suggestions (2026-07-12)

From a full app review (state stores, canvas, menu bar, codegen, upload path,
show pipeline). Ordered by expected impact within each tier.

### Highest impact

- [x] **Multi-node copy/paste** — `clipboard` now holds `{ nodes, edges }`; a new `copySelection()` gathers every `node.selected` node plus its internal edges (Ctrl+C copies the selection when 2+ nodes are selected, else falls back to the single-node `copyNode`), and `pasteNode` remaps ids for every copied node + internal edge, centring the pasted group on the drop point. Canvas context-menu Paste shows the count and works the same way
- [x] **Named projects / multiple workspaces** — `projectStore` now replaces the old single autosave slot with named, switchable workspaces (`fastled-studio.projects.v1` locally, plus helper-backed JSON files in `Projects/` on disk). MenuBar's **▤ Projects** popup provides New Blank / Duplicate Current / Recent / Rename / Delete, switching flushes the current workspace first, and the legacy `fastled-studio-graph` autosave slot migrates into the default `Main` project on first load.
- [x] Rolling autosave snapshots — `src/state/snapshotHistory.ts` keeps the last 5 whole-workspace snapshots in `localStorage` (`fastled-studio-snapshots`), taken every 2 minutes while the canvas is non-empty (skipped when nothing changed since the last tick). MenuBar's **⟲ Recover** button opens `RecoverPopup` to browse and restore one (confirms first; restoring is itself undoable via Ctrl+Z). Degrades gracefully by trimming the list if the full write doesn't fit the shared storage quota.
- [x] **Starter templates** — `src/state/starterTemplates.ts` builds seven pre-wired graphs (Rainbow Sweep, Fire, Scrolling Text, Audio Spectrum, Field Warp Demo, Generative Show, and Music-synced SD Show) straight from `NODE_LIBRARY` defaults, loaded through the existing `loadGraph`. The persistent **✦ Start** button and `TemplatesPopup` start gallery provide thumbnail previews, a remembered last-start badge, and a `Blank Canvas` entry alongside the starters.
- [x] **Live streaming to hardware** — a generic Adalight-protocol receiver sketch (`streamReceiverGenerator.ts`, flashed once via a new **⚡ Flash Stream Receiver** button) plus a **📡 Live Stream** toggle on MatrixOutput that pushes `LEDPreview`'s already-computed frames straight to the board over serial at a capped 30 fps (`streamStore.ts` + `adalight.ts`), instead of a compile+flash cycle per tweak. The Python helper (`backend/app.py`) gained `/api/stream/start|frame|stop|status`, holding the serial port open across per-frame POSTs; a normal upload always reclaims the port first. WiFi (DDP/E1.31) was left for later — serial covers the "design while watching the actual matrix" loop this item was about. Not yet hardware-validated.
- [x] **Interactive stubs for hardware input nodes** — `ButtonInput`/`PotInput`/`EncoderInput` now render a live widget in the node body (`HardwareInputBody.tsx`): a pressable button, a draggable slider, and a spin-to-turn dial (drag = rotate, tap = the encoder's integrated push-button). Values are transient run-state in `hardwareInputStore.ts` (a small zustand store, not a saved node property), written on pointer interaction and read back by `evalNode` via `.getState()` — the same bridge pattern `useAudioStore` uses for `MicInput`
- [x] **Beyond the single rectangular matrix** — a `layout` option on MatrixOutput (`matrix`/`strip`/`panels`/`custom`, `src/state/xyLayout.ts`): `panels` splits the grid into `tilesX`×`tilesY` equal panels, each independently rotatable (`tileRotations`) and chained in row or serpentine panel order (`tileSerpentine`); `custom` takes an explicit JSON permutation (`customXYMap`) as an escape hatch for anything else. Codegen bakes one `_xytable` PROGMEM lookup + `XY()` reader from whatever combination of pixel serpentine/tiling/custom map is active (replacing the old serpentine-only formula), so preview and firmware stay in lockstep by construction — the live preview needs no changes since physical wiring order never affects the rendered content. The live preview draws a matching panel-boundary gridline overlay for `panels` layouts (`matrixTileLayout()` in `graphStore.ts` + a stacked overlay canvas in `LEDPreview.tsx`, redrawn only on layout/size change). Not yet hardware-validated.

### Smaller feature gaps

- [x] **Node bypass/mute** — a `bypassed` property toggle on any node whose primary output is `frame`/`field` and has a matching-type input (e.g. every composite/effect node): the evaluator passes that input straight to the output, skipping the node's own logic and any stateful side effects; codegen mirrors it by copying the source buffer (`memmove`/`memcpy`) into the node's own buffer instead of emitting its render. `bypassPort()` in `nodeLibrary.ts` decides eligibility (shared by the evaluator, codegen, and the "bypass" checkbox in `StudioNode`, shown only where it would do something)
- [x] **Canvas annotations** — a `Comment` node (no ports, just text and color) so big show graphs stay legible. Its own `note` category (`#ffd24a`, outside the pipeline hue sweep), a multi-line textarea body, and a color picker that tints the node itself rather than the fixed category accent. No evaluator/codegen participation — excluded from the isolated-node warning and skipped explicitly in both switches
- [x] **View generated C++** — a "View Code" button next to Export .ino on MatrixOutput opens a read-only modal (`CodeViewPopup.tsx`) showing the exact sketch string that would be exported/uploaded (reuses `MatrixOutputUpload`'s existing `code` memo, no separate codegen call), with line count + Copy-to-clipboard
- [x] **Float signal visibility** — hovering a `float`/`bool` noodle shows a small readout of its current value at the edge midpoint, reading the live per-port value already published to `previewStore` by the render loop (`GlowEdge.tsx`)
- [x] **Web MIDI input** — a `MidiInput` node (note velocity/gate + CC → float/bool) via the Web MIDI API (`src/midi/midiEngine.ts` singleton + `midiStore.ts` bridge, mirroring `AudioEngine`/`useAudioStore`), no deps. `note`/`cc` properties pick which MIDI numbers to listen to; on-node status readout shows connection + live values. Preview-only — no embedded equivalent, so firmware sees the idle default
- [x] **Share via URL** — `src/utils/shareGraph.ts` compresses the whole workspace (nodes/edges/graphData/graphs) into a `#share=` URL fragment via `lz-string`; MenuBar's **⇗ Share** button copies the link to the clipboard (falls back to a prompt if clipboard access is denied). On load, `App.tsx` checks for a share hash *before* the autosave restore — a share link wins over whatever's already in this browser, since opening one is an explicit act — then clears the hash so a reload doesn't re-import it

### Workflow improvements

- [x] **Keyboard-first node add** — `Tab` (from anywhere, not typing) or double-clicking empty canvas opens the existing node search picker (`CanvasContextMenu`'s picker mode, now reachable without a drag-to-create origin via `startInPicker`); `Tab` opens at the view centre, double-click at the click point (`zoomOnDoubleClick` disabled so the gesture is free on the pane; double-click on a node still enters a group)
- [x] **"Save selection to library" in one step** — right-clicking a node that's part of a 2+ multi-selection now shows "Group N Nodes…" in `NodeContextMenu`, opening the same `CreateGroupDialog` (name + Save to library checkbox) the toolbar's ⊞ Group button uses
- [x] **Check undo granularity on slider drags** — confirmed each `updateNodeProperty` tick was landing as its own zundo snapshot; fixed via zundo's `handleSet` option with a burst-aware debounce (`debounceHandleSet` in `graphStore.ts`) that pins the pre-burst state and only pushes one history entry per ~400ms-quiet gesture (slider drag, fast typing)
- [x] **Import safety** — loading a JSON file via MenuBar's Load button now confirms before replacing a non-empty workspace (`window.confirm` in `handleFileChange`); the Sidebar's drag-drop `.json` import is unaffected since it adds to the pattern library rather than replacing the graph
- [x] **Upload ergonomics** — board+port now persist per project via `projectStore.uploadTarget` (with the old global selection kept only as the fallback for new projects), and MatrixOutput's hardware bay adds a `↻ Re-upload last sketch` shortcut that re-sends the most recently uploaded sketch for the current project without regenerating it
