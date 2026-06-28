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
- [~] WebSerial flashing / in-browser (or cloud) compilation — intentionally **not** pursued; local `arduino-cli` keeps the app a pure static frontend (no backend/hosting/sandboxing burden)

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
- [ ] On-device validation — confirm A/V sync drift stays acceptable on real ESP32-S3 + I2S hardware
- [ ] Show editor / timeline — review and hand-tweak generated events before export

## Tooling

- [x] ESLint flat config + CI (lint / test / build on every PR)
- [x] Test suite — Vitest + jsdom (graphEvaluator, cppGenerator, graphStore, font, nodeLibrary, validateGraph)
- [x] Component tests — @testing-library/react (StudioNode)
- [x] Architecture decision record — `docs/architecture/decisions/0001-pattern-node-group-architecture.md`

## Backlog

- [ ] Add more particle types — e.g. gravity/bounce, fireworks burst, sparkle rain, comet trail, snow drift, swarm flocking
- [ ] Add more FastLED built-ins to code editor — e.g. `beatsin8`/`beatsin16`, `triwave8`, `quadwave8`, `cubicwave8`, `ease8InOutCubic`, `blend`, `lerp8by8`, `lerp16by16`, `sqrt16`, `scale8`, `nscale8`, `qadd8`, `qsub8`, FastLED palettes (`RainbowColors_p`, `LavaColors_p`, `OceanColors_p`, etc.)

## Direction & In-Flight Work

Current focus (agreed 2026-06-25): **music-sync show pipeline** + **stabilize & document**.

### Pending integration — cherry-pick from `feature/thmi-touchscreen-ui`

That branch forked before the recent refactors (#53 wallclock, #54 NoiseField,
#55 palette guard, #56 bundled nodes), so it can't be merged straight in. Replay
each feature as its own PR on top of current `main`. See
`docs/development/plans/thmi-feature-integration.md`.

- [ ] FFT-based music analyzer rewrite (2048-pt FFT + spectral analysis) — reconcile with #58's `musicAnalyzer.ts`
- [ ] In-browser audio preview with synced show timeline (feeds the *Show editor* item above)
- [ ] Spectral-analysis audio nodes + audio-node C++ codegen upgrade
- [x] 13 transition variants (Iris, ClockWipe, Push, Checkerboard, Diagonal, Blinds, Ripple/Spiral Wipe, Curtain, ScanLines, Zoom, Fade-through-Black/White) folded into the bundled `Transition` node (16 total) — preview ported as-is; C++ codegen **rewritten** against the buffer-compositing model (the branch's was placeholder stubs); 31 new tests
- [ ] T-HMI touchscreen controller firmware (`firmware/thmi/.../TMHIController.ino`)

### Stabilize & document

- [ ] Keep `CLAUDE.md` / `todo.md` in step with each merged PR
- [ ] Delete `feature/thmi-touchscreen-ui` once its features are fully replayed
