# TODO

## Core Graph

- [x] Port type validation — reject connections between incompatible data types (e.g. `audio` → `float`)
- [ ] Connection error feedback — red line + shake animation + "Incompatible port types" tooltip on invalid drop
- [x] Node snap to 20 px grid
- [x] Undo / redo — 100-step history stack
- [x] Autosave — serialize graph to `localStorage` every 10 seconds
- [x] Save / load — export graph as JSON, import from file (MenuBar ↓ Save / ↑ Load, also Ctrl+S)
- [x] Node search — filter sidebar by typing
- [ ] Right-click context menu on canvas — "Add node", "Paste", "Select all"
- [ ] Right-click context menu on node — "Duplicate", "Delete", "Disconnect all"

## LED Preview

- [x] Evaluate the actual node graph at runtime instead of the placeholder animation loop
- [ ] WebGL shader pipeline to replace the Canvas 2D renderer (spec: 60 fps target)
- [ ] Resize preview up to 512 × 512 LED simulation
- [ ] 3D rotate mode — drag to orbit the matrix

## Audio

- [ ] Wire Web Audio API + `AudioWorklet` for real microphone FFT (off main thread)
- [ ] Connect FFT output to `FFTAnalyzer` node outputs (bass / mids / treble float values)
- [ ] Beat detection — drive `BeatDetect` node from the audio worklet
- [ ] Audio visualizer bar display in the preview panel (16 bars, cyan → magenta gradient per spec)

## Upload Pipeline

- [ ] C++ code generator — walk the node graph and emit FastLED `.ino` / `.cpp`
- [ ] WebSerial / WebUSB upload flow — board selection, validation, progress in status bar
- [ ] Compilation error surface — parse toolchain errors and show in status bar

## Nodes

- [ ] Add remaining spec node types: Clamp, MapRange, Sin/Cos, Noise (1D/2D/3D), Perlin, HSV↔RGB, Palette Sampler, Gradient Generator, Blend Colors, Particles, Radial Burst, Spiral, Kaleidoscope, Bass Pulse, Midrange Waves, Treble Sparks, Beat-Triggered Flash, all Compositing nodes, all Control/Logic nodes
- [ ] Multi-Pattern Master Node — pattern queue, transitions, hardware input routing
- [ ] Transition nodes — Crossfade, Wipe, Dissolve, Zoom, Pixel Shuffle
- [ ] Custom node — inline C++ snippet editor

## Polish

- [x] Node creation fade-in + scale animation (spec: 200 ms, scale 0.9 → 1.0)
- [ ] Connection spark effect at port on successful link (spec: 80 ms)
- [x] Keyboard shortcuts — Ctrl+Z undo, Ctrl+Y redo, Ctrl+S save, Delete selected node
- [ ] MiniMap node colors already correct; add minimap edge colors
- [x] Inspector: color picker for color-type properties instead of raw number fields
- [ ] Solarized Dark and Studio Light theme variants
- [ ] Reduced-motion toggle and high-contrast mode (WCAG AA)
