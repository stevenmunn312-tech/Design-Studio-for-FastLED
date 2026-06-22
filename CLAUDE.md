# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**FastLED Studio** is a browser-based node-graph editor for designing LED lighting effects. Users wire together nodes on a canvas, see a real-time LED matrix preview, then generate FastLED/Arduino C++ firmware for upload to microcontrollers like the ESP32-S3.

Core user flow: drag nodes from sidebar → wire ports together → preview updates live → generate C++ → upload via WebSerial.

## Commands

```bash
npm run dev       # start Vite dev server (http://localhost:5173)
npm run build     # tsc type-check + Vite production build
npm run lint      # ESLint
npm run preview   # serve the production build locally
```

No test suite exists yet.

## Stack

- **React 19 + TypeScript** via Vite; CSS Modules for all component styles
- **@xyflow/react v12** — node graph canvas, handles, edges, minimap
- **Zustand v5** — all app state (`graphStore`, `uiStore`, `audioStore`); uses `subscribeWithSelector`
- No Tailwind; styling is pure CSS variables defined in `src/themes/tokens.css`

## Architecture

### State Layer

**`src/state/graphStore.ts`** owns the React Flow node/edge arrays and wraps `applyNodeChanges`, `applyEdgeChanges`, `addEdge`. Also tracks `selectedNodeId` and exposes `updateNodeProperty`. The `onConnect` action embeds `style: { stroke: color }` on new edges so the MiniMap can pick up per-category edge colors.

**`src/state/uiStore.ts`** owns panel visibility (`sidebarOpen`, `inspectorOpen`, `showUploadPanel`), status bar message/level, FPS counter, theme, reduced-motion, and high-contrast flags. `setStatus` auto-clears `info`/`success` after 5 s.

**`src/state/audioStore.ts`** is a thin Zustand bridge over `AudioEngine.instance`. It calls `engine.subscribe()` at store-creation time so FFT data flows into Zustand state on every animation frame.

**`src/state/nodeLibrary.ts`** is the static registry (`NODE_LIBRARY: NodeDefinition[]`). Adding a new node type = add one entry here. No other registration required — the Sidebar reads this array directly.

### Node Rendering

`StudioNode` (`src/components/Canvas/StudioNode.tsx`) is the single custom node type (`{ studioNode: StudioNode }`). **Critical invariant:** React Flow requires `Handle` components to be `position: absolute`. Handle `top` offsets are calculated from constants that must stay in sync with the CSS:

```ts
// StudioNode.tsx — must match StudioNode.module.css
const HEADER_H = 32   // .header height
const BODY_PAD = 8    // .body padding-top (--space-1)
const ROW_H    = 24   // .portRow height
const ROW_GAP  = 4    // .body gap
const handleTop = (i: number) => HEADER_H + BODY_PAD + i * (ROW_H + ROW_GAP) + ROW_H / 2
```

Changing any of those CSS values without updating the constants will silently misalign all connection handles.

### Edge Rendering

`GlowEdge` (`src/components/Canvas/GlowEdge.tsx`) renders three stacked SVG `<path>` elements (wide halo → mid bloom → thin animated core) plus a dot at the target. Color is resolved at render time from `useReactFlow().getNode(source)?.data.category`. The MiniMap picks up edge colors from `style.stroke` set at connect time in `graphStore.onConnect`.

### Live Preview Pipeline

`LEDPreview.tsx` drives a `requestAnimationFrame` loop that calls `evaluateGraph(nodes, edges, tick, gridW, gridH)` every frame. When the graph is empty, `idleFrame()` shows a rainbow shimmer instead.

**`src/state/graphEvaluator.ts`** is the runtime engine. It topologically evaluates nodes in dependency order using memoisation per frame. Key types:

```ts
export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x]
```

Stateful nodes (`Fire`, `Fire2012`, `BeatFlash`, `Counter`, `Particles`, `PatternMaster`) persist state in module-level `Map` objects keyed by node ID. `formulaCache` compiles `CustomFormula` expressions once via `new Function(...)`.

**`src/components/Preview/webglRenderer.ts`** — `WebGLLEDRenderer` uploads the frame as a texture and renders via a GLSL fragment shader. The shader draws each LED as a smooth circular disc with a 5×5-neighbor glow contribution. Y is flipped in the shader (`u_res.y - gl_FragCoord.y`) to match the JS frame's top-left origin. Falls back to Canvas 2D if WebGL is unavailable.

### Audio Pipeline

`src/audio/audioEngine.ts` — `AudioEngine` (singleton) uses `getUserMedia` → `AudioContext` → `AnalyserNode`. It polls FFT on every animation frame and fires subscribers with `{ bass, mids, treble, beat, spectrum }`. Beat detection uses a 30-frame rolling average of bass energy with a 1.4× threshold and 300 ms cooldown.

`src/state/audioStore.ts` bridges `AudioEngine` → Zustand. `FFTAnalyzer` and `BeatDetect` nodes in the evaluator read from `useAudioStore.getState()` directly (not through React).

App.tsx auto-starts audio when a `MicInput` node is added to the graph; auto-stops when it's removed.

### C++ Code Generator

`src/codegen/cppGenerator.ts` — `generateCpp(nodes, edges)` topologically sorts the graph and emits a FastLED `.ino` sketch. Each node type has a `case` in the `emit()` switch that writes to `loopLines[]`. The `needsT` flag enables a `float t = millis() / 1000.0f` variable only when needed. Inputs are resolved to C++ expressions via `floatExpr()`, `colorExpr()`, `boolExpr()`.

### Upload Panel

`src/components/Upload/UploadPanel.tsx` — modal overlay with:
- Live code preview textarea (left pane)
- Board selector dropdown, WebSerial connect/disconnect, `.ino` download, Flash button (right pane)
- `validateGraph()` checks for MatrixOutput, connected frame port, and isolated nodes; shows results as colored chips in the footer

### Design Tokens

All colors, spacing, and typography are CSS variables in `src/themes/tokens.css`. The five node categories each map to an accent color:

| Category | Hex | CSS var |
|----------|-----|---------|
| audio | `#00ffff` | `--accent-audio` |
| pattern | `#ff00ff` | `--accent-pattern` |
| math | `#a8ff00` | `--accent-math` |
| output | `#00bfff` | `--accent-output` |
| hardware | `#ffa500` | `--accent-hardware` |

Key layout constants: sidebar `280px`, inspector `280px`, menu bar `48px`, status bar `40px`, node `220px × 140px`, base spacing `8px`.

## Node Library

Nodes are grouped into categories. Adding a new node type requires:
1. One entry in `src/state/nodeLibrary.ts`
2. A `case` in `graphEvaluator.ts` `evalNode()` switch (for live preview)
3. A `case` in `cppGenerator.ts` `emit()` switch (for C++ codegen)

Current node count by category (see `nodeLibrary.ts` for full list):
- **audio**: FFTAnalyzer, BeatDetect, MicInput, AudioHue
- **pattern**: SolidColor, NoiseField, Fire, Fire2012, Plasma, SpectrumBars, BlendFrames, BrightnessMod, HueShift, BassPulse, MidrangeWaves, TrebleSparks, BeatFlash, Noise2D, RadialBurst, Spiral, Kaleidoscope, Particles, Invert, GradientFrame, GradientSampler, PaletteSampler, Simplex2D, Noise3D, Blur2D, LayerBlend, Crossfade, Wipe, Dissolve, PatternMaster, CustomFormula
- **math**: MathAdd, Multiply, Clamp, MapRange, Sin, Cos, Lerp, TimeNode, Abs, Mod, Min, Max, Random, Counter, Gate, Not, Compare, HSVToRGB, BlendColors, CHSV, PaletteSelector, PaletteBlend, BeatSin, XYMapper
- **output**: MatrixOutput
- **hardware**: ButtonInput, PotInput

## Specification Docs

The original design intent lives in `.docs/`:

- `.docs/Proposal-FastLED_Studio` — full node-type catalogue and deployment workflow
- `.docs/Design_Specification.md` — visual design system (colors, typography, animations, component specs)
- `.docs/Developer_Handoff_Specification` — implementation guide (CSS variables, data schemas, performance requirements, upload pipeline steps)

Derive interaction behavior, animation durations, and component dimensions from these rather than inventing them.
