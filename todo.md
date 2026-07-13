# TODO

## Release readiness — public beta

### P0 — release blockers

- [x] **Make imported and shared graphs untrusted by default.** A `trusted` bit now travels with every `PersistedWorkspace` (persisted per-project, `workspacePersistence.ts`). Share-link, Graph JSON import, and project-file loads force `trusted: false` unconditionally — never reading a self-declared claim out of the parsed content (`App.tsx`, `MenuBar.tsx`, `projectFileIO.ts`'s `parseProjectFile`); pattern-library drops (`instantiatePattern`/`createCollectionFromPatterns`/`addPatternToCollection` in `graphStore.ts`) do the same. `evaluateGraph`/`evaluateGraphFull` take `trusted` as a final parameter threaded through to the `CustomFormula`/`FieldFormula`/`Code` cases, which render a blank frame/zero field instead of evaluating when untrusted — `LEDPreview.tsx` reads the live value every tick. A persistent `TrustBanner` (new component) explains the block and offers "Trust and run"; `App.tsx`/`MenuBar.tsx` also fire a one-shot confirm dialog (`utils/trustPrompt.ts`) right after a share/import/open completes. Missing/legacy `trusted` = trusted, since it predates this feature and is the user's own prior local work. `MatrixOutputUpload`'s Upload/Export .ino/Upload-show-to-SD actions separately warn (non-blocking, since export/upload is already an explicit, reviewable action) before sending an untrusted project's generated code to hardware. Not yet wired into `showPreview.ts`'s collection-pattern preview path (a narrower residual gap, tracked as a follow-up, not a live exploit surface since the sandboxing below already closes the actual code-execution risk).
- [x] **Replace unrestricted formula evaluation.** `new Function` is gone from `CustomFormula`/`FieldFormula`. `src/state/formulaLang.ts` is a small hand-written tokenizer + recursive-descent parser + AST evaluator: every identifier resolves at *parse time* against three fixed sets (scalar variables, callable FastLED shims, a fixed-arity `Math` subset), so property access, indexing, `new`, assignment, and unknown identifiers (`fetch`, `globalThis`, …) are structural parse errors, not runtime lookups. Source-length and recursion-depth caps guard against pathological nesting. Adversarial + regression tests in `formulaLang.test.ts` cover exactly the cases the todo item named (`globalThis`, constructors, property/index access, assignment, network/storage calls, oversized/deeply-nested input) plus real formulas from the node library.
- [x] **Sandbox Code-node preview execution.** The compiled C++→JS shim now runs in a dedicated Web Worker per Code-node instance (`src/state/codeSandbox.worker.ts`), bootstrapped to close `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`/`importScripts`/`indexedDB`/`caches`/`BroadcastChannel`/sub-worker spawning before any pasted code runs — Workers already have no DOM/storage/cookies/parent-navigation by construction. The main-thread controller (`codeSandboxRuntime.ts`) enforces a ~100ms per-tick timeout that `worker.terminate()`s and respawns a runaway/infinite-loop worker (the persisted `leds[]` trail state is lost when that happens — an accepted, documented trade-off). Evaluation is decoupled from the render tick (`evalCodeAsync` always returns the latest *completed* frame immediately, same pattern `previewStore` already uses), so a Code node's displayed frame can lag by roughly one round trip. Raw C++ export/upload stays verbatim pass-through (unchanged); the upload/export trust warning above covers "code from someone else." See `docs/development/design/code-node.md` for the updated design note.
- [x] **Fix the Show Pipeline GPIO collision.** Matrix Output's default LED data pin and SD Card's default chip-select pin were both GPIO 5. SD Card's `sdCsPin` default (node library, player/provisioner sketch generators, and the showUpload fallback) is now GPIO 10, which doesn't collide with Matrix Output's LED data pin (5), clock pin (6, SPI chipsets only), or the SD/mic I2S pin defaults (26/25/22, 39/40/41).
- [x] **Validate hardware pin assignments before export/upload.** `findPinConflicts()` (`src/utils/validateGraph.ts`) collects every GPIO-typed property across `MicInput`, `MatrixOutput` (data pin always, clock pin only for SPI chipsets), `ButtonInput`, `PotInput`, `EncoderInput`, and `SDCard`, and flags any GPIO number reused across two roles — including two roles on the same node — as a conflict (there's no shared-bus concept in the generated firmware today, so any reuse is a real conflict, not an intentional one). Folded into `validateGraph`'s errors, and `MatrixOutputUpload` now disables Upload / Flash Stream Receiver / Live Stream / Upload show to SD and lists the conflicts inline whenever one exists (Export .ino / View Code stay available for debugging).
- [x] **Restore a green test baseline.** The StudioNode matrix-aspect-ratio test asserted the pixel height on the `<canvas>` itself; `NodePreview`'s `FrameThumb` now sets that height on the `.frameWrap` wrapper div instead (the canvases fill it via CSS `100%`). Updated the test to assert the wrapper's height — the rendered layout (112px tall preview at a 16×8 matrix ratio) is unchanged, only the assertion target. Full suite (1746 tests), lint, and build are green.

### P1 — hardware confidence and release engineering

- [x] **Define the beta support matrix.** Added `docs/release/beta-support-matrix.md` and linked it from `README.md` / `docs/NAVIGATOR.md`. The matrix now promotes only one fully recorded end-to-end combo to public-beta support — ESP32-S3 + WS2812B + 16×16 rectangular matrix + `fbuild` + normal USB Upload — separates CI-only host coverage from real hardware validation, and keeps every browser, every `arduino-cli` path, every non-rectangular layout, live streaming, SD-show provisioning, PSRAM, and the advanced show/audio paths marked experimental until a validation note captures their exact tested combo.
- [ ] **Run a repeatable hardware smoke suite.** For each supported combination, verify compile, upload, color order, matrix orientation, brightness, power cap, microphone input where applicable, live stream, reconnect/re-upload, and a representative generated pattern. Record firmware size, RAM use, and observed result.
- [ ] **Validate advanced ESP32-S3 paths on hardware.** Cover PSRAM modes, panel tiling/rotation, custom XY maps, non-crossfade show transitions, beat-triggered show advance, particle overlays, baked song envelopes, group-input modulation, and serial live streaming.
- [x] **Add upload-helper tests and CI.** `backend/tests/` (pytest + FastAPI `TestClient`, no real serial/build tools involved) covers request validation, engine selection (`_active_engine`), FQBN↔fbuild-env translation, pattern/project path safety (`_sanitize_filename` and defence-in-depth against traversal names), live-stream serial-port ownership (a fake `serial.Serial` stands in for hardware), `/api/upload-show`'s failure phases (provisioner compile/upload, SD transfer, player compile/upload, full success), and generated `platformio.ini` fbuild configuration. Writing the port-ownership tests surfaced a real bug: `/api/stream/frame` assigned `_stream_serial = None` in its except branch without `global`, which made Python treat the name as function-local and raise `UnboundLocalError` on *every* call (even the success path) — fixed. `.github/workflows/ci.yml` gained a `backend` job (`pip install -r backend/requirements-dev.txt && pytest backend/tests`), kept deliberately separate from `backend/requirements.txt` so CI doesn't need to fetch fbuild/esptool.
- [x] **Pin Python dependencies reproducibly.** `backend/requirements.txt` and `backend/requirements-dev.txt` now pin the helper's direct deps to verified versions, `backend/constraints.txt` locks the full transitive graph, and `backend/DEPENDENCIES.md` documents install/update steps. CI now adds a cross-platform `backend-install` matrix (Ubuntu/macOS/Windows) that installs both prod + dev sets with the shared constraints file, runs `pip check`, and imports the key packages; the existing Ubuntu backend test job now installs through the same constraints file. Locally verified by installing the pinned set into a clean target directory with the bundled Python runtime and running `pytest backend/tests` (50 passed).
- [x] **Add release metadata.** Added a root `LICENSE` (MIT) plus `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`, and `SECURITY.md`; added `docs/release/supported-platform-policy.md` and `docs/release/versioning-and-releases.md`; linked the set from `README.md` / `docs/NAVIGATOR.md`; and added `package.json`'s `license` field. `THIRD_PARTY_NOTICES.md` now records the current bundled/runtime dependency set, calls out `essentia.js`'s AGPL notice and origin acknowledgement, notes that Inter and JetBrains Mono are referenced but not bundled, treats the current `public/` branding/icon assets as project-authored, and documents the FastLED / helper-vendored-library obligations that apply if future release artifacts redistribute those upstream copies.
- [ ] **Provide a consumer-friendly distribution.** Evaluate signed Windows/macOS/Linux desktop packages or a bundled launcher/runtime so beta users do not need to manage Node and Python manually. Keep the source launcher as the developer path.

### P1 — first-run UX and workflow

- [x] **Turn the empty canvas into an interactive start screen.** `NodeGraphCanvas` now replaces the passive empty-state copy with a launch card offering `Start with Rainbow`, `Audio-reactive demo`, `Browse starter patches`, and `Blank canvas`. Starter actions load in one click through the shared `startFlow` helper, immediately request a fit-to-view on the fresh nodes, and remember the last start choice so the first-run path animates both the node previews and the main LED preview without a separate gallery trip.
- [x] **Promote starters outside the File menu.** `MenuBar` now has a persistent **✦ Start** button outside the File menu, opening a redesigned `TemplatesPopup` start gallery. The gallery renders thumbnail graph previews for each starter, adds a `Blank Canvas` card, and remembers the user's last start choice (`uiStore.lastStartChoice`) so someone who prefers blank canvas sees that preference reflected without hiding the starter cards.
- [x] **Split the current Show Pipeline template.** `src/state/starterTemplates.ts` now replaces the combined Show Pipeline starter with two focused templates: `Generative Show` (`Pattern Collection → Show Engine → Matrix Output`) and `Music-synced SD Show` (`Music Library → Performance Generator → SD Card → Matrix Output.sdcard`). `TemplatesPopup` renders short completion steps for each template, and `validateGraph()` / `MatrixOutputUpload` now treat an SD-card-only Matrix Output path as valid for the music-sync upload workflow instead of forcing the misleading `PerformanceGenerator.frame` preview wire.
- [x] **Add progressive disclosure to the 132-module library.** `Sidebar` now opens in a curated **Beginner** view with an **All** toggle, persists that choice plus `favorites` and a `recent` rack in `localStorage`, and adds lightweight intent tags to module cards so search can match both behavior and node names. The top of the library now also offers three prewired recipe drops — `Audio to brightness`, `Beat-triggered random`, and `Add trails` — which instantiate small starter subgraphs on the canvas (reusing singleton nodes when possible and warning when an existing `MatrixOutput` needs the final wire finished manually).
- [x] **Improve compatible-node discovery.** `CanvasContextMenu` now turns drag-to-create into a ranked picker: compatible nodes are sorted by input fit (`spliceInput`, exact-handle matches, FFT three-band fan-out, and same-type pass-through), each card shows the node description plus a short “why this fits” hint, and the picker also offers bridge-chain drops such as `Audio → frame`, `Audio → color`, `Color → frame`, `Frame → field`, `Field → frame`, `Music → SD card`, and `Shows → SD card`. Choosing a bridge card instantiates the whole helper chain prewired from the dragged output so users can keep moving instead of manually assembling adapters.
- [x] **Unify the project mental model.** The app now uses one vocabulary across File actions, dialogs, status messages, README, Help, and recovery UI: **Project** = the autosaved working workspace; **Project File** = a portable full-workspace file (`Open Project File`, `Save Project File As`); **Graph JSON** = raw graph interchange (`Import Graph JSON`, `Export Graph JSON`); **Share Link** = a URL copy of the full workspace; **Recovery Snapshot** = a recent browser-local restore point (`Recover Snapshot`). Related confirm/status copy now says “current project workspace” where imports or restores replace what is on the canvas, so users are told exactly what kind of thing they are opening, saving, or replacing.
- [x] **Replace ambiguous save prompts.** `NewProjectPrompt` now uses explicit actions — `Save and continue`, `Continue without saving`, and `Cancel` — instead of `Yes` / `No`. The dialog shows the current project name plus the destination (`project "Name"` or `a new blank project`), focuses the primary action on open, keeps Escape-to-cancel behavior, and `MenuBar` now waits until the target project/file is known before prompting so the destination text is concrete instead of generic.

### P1 — guided hardware workflow

- [x] **Build a Matrix Output setup wizard.** `MatrixOutputSetupWizard` now guides users through board selection, build-engine readiness, matrix dimensions/layout, chipset/pins/color order, and a final power + wiring-test step, while the slimmed Matrix Output node keeps a clear `Setup...` entry point and the advanced board/upload controls remain available in dedicated popups instead of overwhelming the node body.
- [x] **Add a wiring diagnostic/test pattern.** `src/codegen/wiringDiagnosticGenerator.ts` now generates a standalone Matrix Output test sketch, flashed from a new **🧪 Flash Wiring Test** action in `MatrixOutputUpload`, so users can verify hardware before wiring a creative graph. The sketch reuses the current Matrix Output board/chipset/pin/layout settings, cycles through RGB color-order solids, brightness/current-limit bars, an orientation gradient with corner markers, per-panel numbering with a top-left notch, and both logical-XY and direct physical-index chases (with on-matrix index readouts) for serpentine/rotation/dead-pixel checks. Covered by `src/codegen/__tests__/wiringDiagnosticGenerator.test.ts` and `src/components/Upload/__tests__/MatrixOutputUpload.test.tsx`.
- [x] **Validate layout inputs inline.** `validateMatrixLayout()` (`src/state/xyLayout.ts`) now reports exact Matrix Output layout problems: uneven panel divisibility, invalid `tileRotations` entries/count, and empty/invalid/wrong-length/non-permutation `customXYMap` JSON. `findMatrixLayoutErrors()` folds those into `validateGraph`'s errors, `MatrixOutputUpload` blocks Upload / Flash Stream Receiver / Live Stream / Upload show to SD / Export `.ino` and shows the inline error text, and `matrixTileLayout()` suppresses the cosmetic panel-grid overlay while the panel layout is invalid. `buildXYTable()` still keeps its row-major fallback as a safety net, but users no longer hit it silently.
- [x] **Estimate electrical load.** `estimatePowerLoad()` (`src/utils/validateGraph.ts`) computes LED count from MatrixOutput's grid dims and a worst-case full-white draw (~60 mA/LED, the typical WS2812-class figure), against the configured `powerLimit` cap when set. `MatrixOutputUpload` shows a compact readout (LED count, worst-case amps, configured cap or a recommended PSU size when no cap is set), and `validateGraph` warns when worst-case draw would exceed the configured cap.
- [x] **Estimate firmware resources before upload.** `estimateFirmwareRam()` (`src/utils/validateGraph.ts`) walks backward from MatrixOutput to find every node that actually feeds the sketch (unreached nodes get no buffer, matching codegen), summing the physical `leds` array, each reachable `frame`/`field` render buffer, and known heavy simulation-node state (Fire2012's heat map, Game of Life's cell grids, Reaction-Diffusion's u/v grids, WaveSim's p/c/n grids, Particles' fixed pool) — split into internal-RAM vs. PSRAM-offloaded totals based on MatrixOutput's `usePsram` toggle (stateful-node state always stays internal, per the PSRAM section above). `MatrixOutputUpload` shows a compact KB readout, and `validateGraph` warns when the internal estimate is large enough to be worth a PSRAM nudge. Retaining the post-compile flash/RAM report remains a follow-up.
- [x] **Clarify helper/engine readiness.** `MatrixOutputUpload` now renders an inline **Upload readiness** checklist before the main upload actions: helper, active engine, board toolchain/core, selected port, and local-access/permissions each get a `Ready` / `Checking` / `Fix` status plus a one-click recovery action (`Retry helper`, `Fix engine`, `Install core`, `Choose port`, `Refresh ports`) when they are the thing blocking upload. Upload / Flash Stream Receiver / Upload show to SD now stay disabled until that checklist is green, while Live Stream separately requires a detected port + running helper. Covered by `src/components/Upload/__tests__/MatrixOutputUpload.test.tsx`.

### P2 — UI, visual system, and accessibility

- [x] **Reduce menu-bar competition.** `MenuBar` now adds a compact **View** menu that holds the appearance/preferences toggles (`Theme`, `Motion`, `Contrast`, `UI FX`, and `Signal dimming`) as menu items with current-state labels, instead of spending permanent top-bar space on them. The main bar keeps the workflow controls visible: File, undo/redo, Tidy, Start, Perform, Stage, preview style, and Mic. Covered by `src/components/MenuBar/__tests__/MenuBar.test.tsx`.
- [x] **Define the signature visual hierarchy.** Added shared quiet-chrome tokens and retuned the main visual layers so the LED matrix and active patch state carry the brightest glow: idle node/edge halos are lower, selected/active-path nodes retain stronger emphasis, mini node previews no longer compete with the main preview, and static panel/handle chrome uses softer borders and shadows. Verify visually in the user's running dev server per the repo's no-preview-tool rule.
- [x] **Give display typography a distinctive instrument voice.** Bundled Audiowide locally under `public/fonts/` with its OFL notice, promoted it to `--font-display`, and applied it only to restrained instrument-facing surfaces: app/preview identity, sidebar rack headers/recipe titles, visualizer kickers, stage title, and active stage pattern names. Body controls remain on Inter and dense data/status readouts stay on JetBrains Mono. CSS was checked against dark, solarized, and light theme token contrast without widening the decorative face into node controls.
- [x] **Standardize dialogs.** `AppDialogHost` (`src/components/AppDialog/`) renders alert/confirm/prompt dialogs driven from `uiStore`'s `requestAlert`/`requestConfirm`/`requestPrompt`, with explicit action labels, `role="dialog"` + `aria-modal`, initial focus (primary button or prompt input), a Tab focus trap, Escape-to-cancel, and focus restoration to the triggering element on close. All `window.alert`/`prompt`/`confirm` call sites (menu bar, sidebar, node context menu, group controls, projects/recover/templates popups) now go through it.
- [x] **Complete keyboard and screen-reader behavior.** MenuBar dropdowns now use roving keyboard focus with ArrowUp/ArrowDown/Home/End, Escape returns focus to the trigger, and Tab closes the menu while preserving normal focus movement; transient StatusBar messages announce through polite/assertive live regions (`role="status"` / `role="alert"`), and hidden sidebar/preview panels remain `aria-hidden` + `inert` when collapsed. Covered by focused MenuBar and StatusBar accessibility regressions.
- [x] **Document the desktop viewport contract.** Added `docs/architecture/desktop-viewport-contract.md` (linked from `docs/NAVIGATOR.md` and `README.md`) defining the desktop target (`1440×900`), supported minimum (`1280×720`), and the expected degrade path below that. Backed it with two layout guardrails: `MenuBar.module.css` menus now cap their height and scroll internally on short windows, and `StatusBar.module.css` now keeps the left status message prioritized while the right chip rail scrolls horizontally instead of spilling off-screen. Verified with a green lint/build pass and the existing panel/Stage-mode scroll behavior already in `App.tsx` / `App.module.css`.
- [x] **Complete PWA polish.** The manifest now ships concrete PNG install assets alongside the SVG (`icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` generated from `public/icon.svg`), `index.html` advertises the `apple-touch-icon`, and Vite PWA's precache glob now includes PNG branding assets such as `fastled-studio-pixel-brand.png`. `README.md` and `HelpModal` now explicitly state the split between offline authoring/preview and helper-backed hardware workflows (upload, live stream, board discovery, project-file dialogs). Verified by a production build plus emitted `dist/manifest.webmanifest` / `dist/sw.js` containing the new icons and cached branding assets.
- [x] **Update public documentation.** `README.md` and `HelpModal` now match the current app: no obsolete WebSerial claim, current starter onboarding (`✦ Start` / empty-canvas launcher), current project-vs-JSON-vs-share terminology, current microphone node naming (`Mic Input`), and the modern Matrix Output actions (`Upload`, `Flash Stream Receiver`, `Live Stream`, `Upload show to SD`, `View Code`, `Export .ino`). The docs also add generative-show and music-sync SD-show walkthroughs so README, Help, `CLAUDE.md`, and `todo.md` are back in step.

### P2 — existing node improvements

- [x] **Add node presets and variation tools.** Node context menus now expose `Save Preset...`, direct preset loads, `Randomize Look`, `Mutate`, and `Reset` for suitable configurable nodes. Presets persist per node type in `localStorage` (`nodePresets.ts`), include only scalar preset-friendly settings, skip code/media/graph identity fields, and hide the feature on hardware/input/output nodes so pins, board/toolchain, and Matrix Output rig settings are not scrambled. Randomize/mutate use `PROPERTY_META` slider/select bounds, color helpers, and one `updateNodeProperties` call so each variation/reset is a single undoable edit. Covered by `nodePresets.test.ts` and `NodeContextMenu.test.tsx`; full `npm test`, `npm run lint`, and `npm run build` are green.
- [x] **Add deterministic seeds to generative nodes.** `seed: 0` preserves the old free-running behaviour, while nonzero seeds now drive repeatable preview state and generated firmware for bundled Noise / FractalNoise / GaborNoise / FieldNoise, TwinkleFox / Confetti / Juggle, Particles, Flow Field, Starfield, Boids, Reaction Diffusion, Game of Life, the existing Fire / Fire2012 paths, and Show Engine pattern/transition/dwell selection. Seed controls are exposed as sliders, group subgraphs inherit the same node properties through normal codegen, exported show sketches use `random16_set_seed(...)` when the Show Engine seed is nonzero, and focused evaluator/codegen tests cover seeded preview reproducibility plus firmware seed emission.
- [x] **Expand Beat Flash controls.** `BeatFlash` now has flash `color` (r/g/b, hidden once a palette is picked) or an optional wired/selected `palette` (sampled by elapsed decay phase), `intensity` (0–2 overdrive), `blendMode` (`screen`/`add`), an `attack` ramp (0 = old instant-snap default, up to 1.5s), and a `preserveBase` toggle (on = blend into the base frame as before; off = the lit pixels are fully replaced by the flash color). All defaults reproduce the exact old visual (white, screen, instant, decay 0.85) for backward compatibility. Evaluator (`src/state/graphEvaluator.ts`) and codegen (`src/codegen/cppGenerator.ts`) share the same attack/decay/blend math; 8 new tests cover both.
- [x] **Expose variant-specific Particles controls.** `Particles` gained `size` (particle render radius, applies to every mode), `count` (explicit pool size for the fixed-population modes — swarm/orbit/bounce/fireflies — decoupled from spawn `rate`), `spread` (spawn-area width for fountain/gravity/sparkle/rain/confetti/snow/waterfall), and `gravity`/`bounce` (scale the built-in accel/restitution constants for fountain/gravity/fireworks/waterfall, and gravity/waterfall respectively). Each is gated to the modes that actually read it via `isPropertyEnabled` (shown-but-disabled elsewhere, matching the existing `Transition` convention) — only `size` always applies. Evaluator and codegen share the same per-mode formulas; 11 new tests.
- [x] **Expand fire controls.** `Fire` and `Fire2012` both gained `direction` (up/down/left/right — rotates which edge sparks and which way heat rises), `turbulence` (widens the sideways diffusion kernel; 1 reproduces each node's original fixed-width kernel exactly), `paletteMix` (blends the palette colour with plain heat-brightness grayscale), `mirror` (folds the flame symmetric across its width), and `seed` (0 = free-running `random8()`/`Math.random`, unchanged; nonzero switches to a deterministic per-instance LCG so the same seed reproduces the same flame). The heat simulation always runs in a canonical primary/secondary grid (primary = distance from the flame base) so one direction-aware mapping serves every orientation; Fire and Fire2012 keep their own distinct heat algorithms (single-neighbor vs. two-row-lookahead kernels). Evaluator and codegen share the same grid/formulas — codegen bakes the grid as the `WIDTH`/`HEIGHT` macro names (not JS-literal sizes) so it stays correct under supersampling. 13 new tests.
- [x] **Expand percussion/ripple controls.** Percussion Blobs, Rain Ripples, and Kick Shock each gained `count` (pool capacity — the pool array is now sized at codegen time instead of hardcoded 8/8/12), `decay` (a lifetime multiplier — for Kick Shock this also divides the ring's expansion speed by the same factor, keeping total travel distance constant, since just extending the `age>life` cutoff alone did nothing visible once the ring had already expanded past the matrix), `thickness` (Kick Shock/Rain Ripples ring-band width multiplier) or `size` (Percussion Blobs blob-radius multiplier), `spawnSpread` (0–1, blends each new spawn's origin between a shared fixed point and a fully random one — defaults preserve the old behavior exactly: 0 for Kick Shock's centered shockwave, 1 for the other two's fully-random spawns), and `blendMode` (`add`/`max` — how overlapping effects combine; defaults match each node's prior hardcoded behavior). Evaluator and C++ codegen share the same formulas; 25 new tests.
- [x] **Improve Text authoring.** The Text node is now newline-aware end to end: `textBlockLayout()` / `textLines()` in `src/state/font.ts` precompute per-line bitmap columns plus block width/height, and both the evaluator and C++ generator render multi-line text with the same 1-row interline gap, shared alignment math, horizontal/vertical scroll, and wrap behavior. The Inspector now treats `text` as a multiline textarea and upgrades the font row into a small font manager that shows built-in vs custom source, dimensions, glyph count, the JSON shape (`{ w, h, glyphs }`), and reset/replace actions. Covered by new font/evaluator/codegen/Inspector tests plus a green lint/build pass.
- [x] **Add transition thumbnails and scrubbing.** `Transition` and `TransitionSet` nodes now render compact A/B thumbnail samples for the full 16-style transition catalogue. `Transition` gets an inline scrub control that writes `t` directly (so no temporary float wire is needed) plus thumbnail selection for `transitionType`; `TransitionSet` keeps its pool toggles but upgrades them to visual thumbnail cards with a local scrubber for inspecting the pool at any progress point. Covered by focused node-body tests.
- [x] **Build a direct palette editor.** `CustomPalette` now persists local `colors` + `positions`, renders a draggable stop rail with color pickers, add/remove/reorder actions, and reusable presets, and bakes the positioned palette into the same 16-stop output used by preview and generated firmware. Wired color inputs still override their matching stops. `Poline` now has direct anchor swatches plus reusable anchor presets while retaining its existing `points` and `position` controls. Covered by custom palette helper, node-body, evaluator/codegen tests.
- [x] **Handle preview-only nodes explicitly.** `MidiInput` already carries an on-node `Preview-only` caption (`PREVIEW_NOTES` in `StudioNode.tsx`); the missing piece was firmware validation staying silent. `findPreviewOnlyWarnings()` (`src/utils/validateGraph.ts`) now warns whenever a browser-only node (currently just `MidiInput`; the check is a shared set so future additions get the same warning for free) is actually wired to something, since the generated firmware always substitutes its idle default. Folded into `validateGraph`'s warnings.
- [x] **Resolve Performance Generator's frame semantics.** Removed the misleading `frame` output entirely — a firmware-facing one could only ever render black (a normal, non-SD-show sketch has no audio transport to drive it), and the existing wiring-based activation for "show the playing song in the main preview" was really a preview-only feature disguised as a graph edge. `PerformanceGenerator` now exposes only `shows`; watching a generated show live is an explicit `showInMainPreview` node property with its own checkbox in the node body ("Show in main LED preview"), read directly by `showPlaybackSignal.ts`/`showPlayback.ts` instead of scanning the graph for a `frame`→`MatrixOutput` edge. Updated/added tests across `nodeLibrary`, `graphEvaluator`, `cppGenerator`, `StudioNode`, and `showPlaybackSignal`.

### P3 — high-value node additions

- [x] **Clock / Transport node.** `Clock` (signal category) free-runs from a `bpm` property and outputs `bpm`, a continuous `phase` (0–1 within the current beat), and `beat`/`bar`/`sub` boolean pulses (`beatsPerBar`/`subdivision` properties). Wiring a pulse into `tap` or `sync` re-zeros phase and derives a live BPM from the pulse interval via an EMA (the same mechanism serves manual tap-tempo and locking onto an external beat, e.g. a wired `BeatDetect.beat` or `MidiInput` gate); `reset` re-zeros phase/bar/subdivision counters. Evaluator (`graphEvaluator.ts`) and codegen (`cppGenerator.ts`, millis()-based) share the same edge semantics; 6 new tests.
- [x] **Trigger utility nodes.** A bundled `Trigger` node (math, like `Math`/`Ease`) with a `triggerOp` variant: Debounce (commits a change only once stable for `stableTime`), Toggle/Flip-Flop, One Shot (holds true for `holdTime` after a rising edge, ignoring retriggers while already high), Pulse Divider (fires every `divideBy`th rising edge), and Trigger Delay (fires once, `delayTime` after the edge). Evaluator + millis()-based codegen share the same edge semantics; 10 new tests.
- [x] **Frame Feedback / Delay node.** Added `FrameFeedback`, a bounded recursive delay effect that stores its own output in a fixed ring buffer, then blends a delayed/faded/translated/rotated/scaled copy over the live input without permitting graph cycles. Preview and firmware share the same delay/fade/transform/blend behavior; firmware RAM estimates include the internal history cost as `(delayFrames + 1) × NUM_LEDS × sizeof(CRGB)`, and the history stays internal even when Matrix Output's PSRAM toggle offloads ordinary render buffers.
- [x] **Segments / Zones node.** `Zones` (composite category) defines up to four named rectangles (normalized 0–1 x/y/w/h, each individually enabled/disabled) and routes a wired `frame` per zone into its rectangle over an optional `base`; later zones (A→D) paint over earlier ones where rectangles overlap, and an unwired or disabled zone leaves whatever `base`/an earlier zone already put there (non-destructive partial wiring). Evaluator (`graphEvaluator.ts`) and codegen (`cppGenerator.ts`) share the same seed-then-paint compositing; 7 new tests.
- [ ] **Multi-output controller support.** Allow multiple independently configured LED controllers/strips, pins, color orders, and layouts, including validation of shared resources and an explicit composition/routing model.
- [x] **Hardware Test Pattern node or mode.** Covered by the new Matrix Output **🧪 Flash Wiring Test** mode: it flashes a reusable standalone diagnostic sketch with color-order solids, logical/physical index chases, panel numbering, brightness/current-limit bars, and dead-pixel bring-up checks without requiring a normal creative graph.

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
- [x] Review intentional preview fallbacks and make them explicit in the UI — `PREVIEW_NOTES` in `StudioNode.tsx` renders a muted on-node caption for the `ButtonInput`/`PotInput`/`EncoderInput` stubs and the black `PerformanceGenerator.frame` placeholder; the audio fallback was already explicit (FFTAnalyzer's MIC LIVE / TEST SIGNAL / SILENT pill + opt-in Test toggle, BeatDetect's LIVE / PREVIEW badge). (The `PerformanceGenerator.frame` placeholder this described was later removed outright — see "Resolve Performance Generator's frame semantics" below.)

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
