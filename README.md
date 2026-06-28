# FastLED-Studio
Node‑Based Visual Designer for FastLED LED Matrix Systems

## Features

- **Visual node graph** — drag, drop, and wire 80+ node types across input, audio, math, color, pattern, composite, hardware, and output categories
- **Live LED preview** — WebGL renderer with per-LED glow at 60 fps; falls back to Canvas 2D
- **Audio-reactive** — microphone FFT via Web Audio API drives bass/mids/treble/beat outputs in real time
- **C++ code generation** — export a ready-to-flash FastLED `.ino` sketch from any graph
- **WebSerial upload** — connect an ESP32/Arduino directly in Chrome/Edge and flash without leaving the browser
- **Three theme variants** — Dark, Solarized Dark, Studio Light
- **Undo/redo** (100 steps), autosave to localStorage, save/load graph as JSON

## Getting Started

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires Node 18+. For WebSerial upload, use Chrome or Edge 89+.

## Node Categories

| Category | Color | Examples |
|----------|-------|---------|
| Input | Violet | Mic Input, Music Library |
| Audio | Cyan | FFT Analyzer, Beat Detect, Audio → Hue |
| Hardware | Orange | Button, Potentiometer, Performance Generator, SD Card |
| Math | Lime | Sin, Cos, Wave, BeatSin, Lerp, Counter, XY Mapper |
| Color | Pink | HSV→RGB, CHSV, Palette Selector, Poline, Custom Palette |
| Pattern | Magenta | Fire 2012, Plasma, Noise, Kaleidoscope, Particles, Starfield, Blobs |
| Composite | Teal | Blend, Transition (16 variants), Blur 2D, Fade to Black, Mask |
| Output | Blue | Matrix Output |

## Workflow

1. **Set up output** — drag a **Matrix Output** node and set your grid width/height/chipset/pin
2. **Add a pattern** — drag any pattern node (e.g. Plasma, Fire 2012, Noise Field) and connect its `Frame` output to Matrix Output's `Frame` input
3. **Layer effects** — add Blur 2D, Brightness, Hue Shift, or transition nodes between pattern and output
4. **Add audio** — drag a Microphone node → FFT Analyzer, then wire bass/mids/treble to audio-reactive pattern nodes; click the microphone button in the preview panel to start
5. **Generate firmware** — use the **Upload** controls built into the **Matrix Output** node: pick a board and port (⚙ Board), hit **Upload** to compile and flash via `arduino-cli`, or click **Export .ino** to download the sketch

## Build

```bash
npm run build      # type-check + production build → dist/
npm run lint       # ESLint
npm run preview    # serve dist/ locally
```

## Browser Requirements

| Feature | Minimum |
|---------|---------|
| WebGL preview | Any modern browser |
| Microphone (FFT) | Any modern browser |
| WebSerial upload | Chrome / Edge 89+ |

## Project Structure

```
src/
  audio/          AudioEngine (Web Audio API, FFT, beat detection)
  codegen/        C++ code generator (cppGenerator.ts) + show sketch generator (showGenerator.ts)
  components/
    Canvas/       ReactFlow canvas, StudioNode, GlowEdge, context menus
    Inspector/    Property inspector panel
    MenuBar/      Top bar with save/load/theme controls
    Preview/      LED preview (LEDPreview.tsx + WebGL renderer)
    Sidebar/      Node palette with search and pattern library
    StatusBar/    Status message bar
    Upload/       MatrixOutputUpload (inline in the Matrix Output node)
  state/
    graphStore.ts      Node/edge state + undo history + multi-graph groups
    uiStore.ts         UI panel state + theme
    audioStore.ts      Zustand bridge over AudioEngine
    nodeLibrary.ts     Static registry of all node definitions
    graphEvaluator.ts  Runtime graph evaluation → Frame[][]
    patternLibrary.ts  Saved pattern groups (localStorage)
    uploadStore.ts     Board/port selection + compile/upload status
    musicStore.ts      Music analysis queue and generated shows
  themes/         tokens.css (all CSS variables)
backend/          FastAPI upload helper (auto-spawned; optional)
```
