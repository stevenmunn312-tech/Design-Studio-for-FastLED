# FastLED Studio

A browser-based node-graph editor for designing LED lighting effects. Wire together nodes on a canvas, watch a real-time LED matrix preview update at 60 fps, then generate FastLED/Arduino C++ firmware and flash it to your microcontroller.

## Features

- **Visual node graph** — drag, drop, and wire 50+ node types across audio, pattern, math, and hardware categories
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
| Audio | Cyan | FFT Analyzer, Beat Detect, Audio → Hue |
| Pattern | Magenta | Fire 2012, Plasma, Simplex 2D, Kaleidoscope, Particles |
| Math | Lime | Sin, Lerp, BeatSin, CHSV, XY → Index |
| Output | Blue | Matrix Output |
| Hardware | Orange | Button, Potentiometer |

## Workflow

1. **Set up output** — drag a **Matrix Output** node and set your grid width/height/chipset/pin
2. **Add a pattern** — drag any pattern node (e.g. Plasma, Fire 2012, Noise Field) and connect its `Frame` output to Matrix Output's `Frame` input
3. **Layer effects** — add Blur 2D, Brightness, Hue Shift, or transition nodes between pattern and output
4. **Add audio** — drag a Microphone node → FFT Analyzer, then wire bass/mids/treble to audio-reactive pattern nodes; click the microphone button in the preview panel to start
5. **Generate firmware** — click **↑ Upload** in the menu bar to open the upload panel, preview the generated code, then download the `.ino` or connect a board via WebSerial

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
  codegen/        C++ code generator (cppGenerator.ts)
  components/
    Canvas/       ReactFlow canvas, StudioNode, GlowEdge, context menus
    Inspector/    Property inspector panel
    MenuBar/      Top bar with save/load/upload/theme controls
    Preview/      LED preview (LEDPreview.tsx + WebGL renderer)
    Sidebar/      Node palette with search
    StatusBar/    Status message bar
    Upload/       Upload modal (WebSerial + code preview)
  state/
    graphStore.ts   Node/edge state + undo history
    uiStore.ts      UI panel state + theme
    audioStore.ts   Zustand bridge over AudioEngine
    nodeLibrary.ts  Static registry of all node definitions
    graphEvaluator.ts  Runtime graph evaluation → Frame[][]
  themes/         tokens.css (all CSS variables)
```
