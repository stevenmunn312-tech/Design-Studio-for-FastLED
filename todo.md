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

## LED Preview

- [x] Evaluate the actual node graph at runtime instead of the placeholder animation loop
- [ ] WebGL shader pipeline to replace the Canvas 2D renderer (spec: 60 fps target)
- [x] Resize preview — reads width × height from MatrixOutput node (up to 64 × 64)
- [ ] 3D rotate mode — drag to orbit the matrix

## Audio

- [x] Wire Web Audio API `AnalyserNode` for real microphone FFT
- [x] Connect FFT output to `FFTAnalyzer` node outputs (bass / mids / treble float values)
- [x] Beat detection — drive `BeatDetect` node from the audio engine
- [x] Audio visualizer bar display in the preview panel (16 bars, cyan → magenta gradient per spec)

## Upload Pipeline

- [x] C++ code generator — walk the node graph and emit FastLED `.ino` / `.cpp`
- [ ] WebSerial / WebUSB upload flow — board selection, validation, progress in status bar
- [ ] Compilation error surface — parse toolchain errors and show in status bar

## Nodes

- [x] Clamp, MapRange, Multiply, Sin, Cos math nodes
- [x] HSV→RGB, BlendColors, BlendFrames, BrightnessMod, HueShift, BassPulse, MidrangeWaves, TrebleSparks, BeatFlash
- [x] Noise2D, RadialBurst, Spiral, Kaleidoscope, Particles, Invert, GradientFrame, GradientSampler, PaletteSampler
- [x] Control/Logic: Abs, Mod, Min, Max, Random, Counter, Gate, Not, Compare
- [ ] Remaining: Perlin (proper simplex noise), 3D noise, more composite/transition effects
- [ ] Multi-Pattern Master Node — pattern queue, transitions, hardware input routing
- [ ] Transition nodes — Crossfade, Wipe, Dissolve, Zoom, Pixel Shuffle
- [ ] Custom node — inline C++ snippet editor

## Polish

- [x] Node creation fade-in + scale animation (spec: 200 ms, scale 0.9 → 1.0)
- [x] Connection spark effect at port on successful link (150 ms expand+fade ring)
- [x] Keyboard shortcuts — Ctrl+Z undo, Ctrl+Y redo, Ctrl+S save, Delete selected node
- [ ] MiniMap node colors already correct; add minimap edge colors
- [x] Inspector: color picker for color-type properties instead of raw number fields
- [x] Solarized Dark and Studio Light theme variants (cycle via MenuBar ☾/✦/☀ button)
- [x] Reduced-motion toggle and high-contrast mode (WCAG AA) — MenuBar ⏸ / ◑ buttons
