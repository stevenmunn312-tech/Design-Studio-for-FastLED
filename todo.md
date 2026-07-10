# TODO

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
- [ ] **Supersample toggle** on MatrixOutput — render at 2×, downscale by pixel averaging (FastLED `downscale`); lower priority than per-node splatting
- [x] **ColorBoost** — added as a small composite node (`ColorBoost`) with luminance-preserving channel scaling in both preview and firmware codegen
- [x] **4D Perlin noise** — bundled `Noise` now has a `noise4d` variant using a circular `z/t` path through `inoise16(x, y, z, t)` for seamless looping; preview mirrors the same loop with a browser-side approximation

### Noted, lower priority

- [ ] **Animated GIF on the `Image` node** — frames + fps in `properties.image`, PROGMEM frame array in codegen; Studio-scale mirror of `fx/video` playback
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
