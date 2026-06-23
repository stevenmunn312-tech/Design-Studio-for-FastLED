# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**FastLED Studio** is a browser-based node-graph editor for designing LED lighting effects. Users wire together nodes on a canvas, see a real-time LED matrix preview, then generate FastLED/Arduino C++ firmware for upload to microcontrollers like the ESP32-S3.

Core user flow: drag nodes from sidebar → wire ports together → preview updates live → generate C++ → upload via WebSerial.

## Commands

```bash
npm run dev            # start Vite dev server (http://localhost:5173)
npm run build          # tsc -b type-check + Vite production build (also emits PWA service worker)
npm run lint           # ESLint (flat config in eslint.config.js)
npm run preview        # serve the production build locally
npm test               # vitest run (one-shot)
npm run test:watch     # vitest in watch mode
npm run test:coverage  # vitest with v8 coverage
```

Run a single test file or test by name:

```bash
npx vitest run src/state/__tests__/graphEvaluator.test.ts   # one file
npx vitest run -t "cycle"                                   # tests matching a name
```

Tests use vitest with `globals: true` and the `jsdom` environment (configured in `vite.config.ts`, not a separate vitest config). The same three gates — `lint`, `test`, `build` — run in CI on every PR via `.github/workflows/ci.yml`.

## Stack

- **React 19 + TypeScript** via Vite; CSS Modules for all component styles
- **@xyflow/react v12** — node graph canvas, handles, edges, minimap
- **Zustand v5** — all app state (`graphStore`, `uiStore`, `audioStore`); uses `subscribeWithSelector`
- No Tailwind; styling is pure CSS variables defined in `src/themes/tokens.css`
- **Vitest** (jsdom) for unit tests, with **@testing-library/react** for component tests (e.g. `StudioNode` — stub `<Handle>` since it needs flow context); **vite-plugin-pwa** generates an auto-updating service worker so the app is installable/offline-capable

## Architecture

### State Layer

**`src/state/graphStore.ts`** owns the React Flow node/edge arrays and wraps `applyNodeChanges`, `applyEdgeChanges`, `addEdge`. Also tracks `selectedNodeId` and exposes `updateNodeProperty`. The `onConnect` action embeds `style: { stroke: color }` on new edges so the MiniMap can pick up per-category edge colors.

It is a **multi-graph workspace** (ADR 0001): the *active* graph stays in the top-level `nodes`/`edges` (so all consumers are unchanged), while inactive graphs (pattern groups) live in `graphData`, keyed by id, with metadata in `graphs`. `createGroup` encapsulates selected nodes into a new subgraph (adding a `GroupOutput` terminal) and replaces them with a single `Group` node; `enterGraph` switches the active graph (pausing/clearing undo history around the swap). `getGroupRegistry()` assembles the `{ groupId: { nodes, edges } }` map that `evaluateGraph` needs, and `LEDPreview` passes it every frame so groups preview live at both tiers.

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

**Typed port colours:** each handle (input/output dot) is tinted by its port `dataType` via `portColor()` (`nodeLibrary.ts`), so ports that can connect share a colour — `float`/`bool` share one (they interconvert per `portsCompatible`), `color`/`palette`/`frame`/`audio` are distinct. The node header/border still uses the category accent. Handles also carry a `label · dataType` title.

**Inline property editors:** the node body renders editable controls (colour swatch for `r/g/b`, checkbox for booleans, number/text fields) for each property, Blender-style — so editing happens on the node with live preview. These render in a `.props` section **below** the port rows, so they don't affect the handle offsets above. Interactive controls carry the `nodrag` (and `nowheel` for number fields) class so React Flow doesn't pan/drag while editing. The `font` object is excluded (edited via the Inspector). The **Inspector** panel still exists but is opt-in (`inspectorOpen` defaults false; toggle from the menu bar).

### Edge Rendering

`GlowEdge` (`src/components/Canvas/GlowEdge.tsx`) renders three stacked SVG `<path>` elements (wide halo → mid bloom → thin animated core) plus a dot at the target. Color is resolved at render time from `useReactFlow().getNode(source)?.data.category`. The MiniMap picks up edge colors from `style.stroke` set at connect time in `graphStore.onConnect`.

Edges ("noodles") are created `reconnectable: 'target'`, so a noodle can be unplugged from a node's **input** end: grab it at the input port and drag — drop on empty space to disconnect (`removeEdge`), or onto another compatible port to re-route (`reconnectNoodle`). The canvas wires React Flow's `onReconnectStart`/`onReconnect`/`onReconnectEnd`; a ref tracks whether the drag landed on a port.

### Live Preview Pipeline

`LEDPreview.tsx` drives a `requestAnimationFrame` loop that calls `evaluateGraph(nodes, edges, tick, gridW, gridH)` every frame. When the graph is empty, `idleFrame()` shows a rainbow shimmer instead. The per-frame body is wrapped in `try/catch` so a single malformed frame logs and is skipped rather than tearing down the loop.

**`src/state/graphEvaluator.ts`** is the runtime engine. It topologically evaluates nodes in dependency order using memoisation per frame. Key types:

```ts
export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x]
```

Stateful nodes (`Fire`, `Fire2012`, `BeatFlash`, `Counter`, `Particles`, `PatternMaster`, `ReactionDiffusion`, `GameOfLife`, `FlowField`) persist state in module-level `Map` objects keyed by `stateKey(id)` — the node id prefixed with the group-instance path, so two instances of the same group don't share state. `formulaCache` compiles `CustomFormula` expressions once via `new Function(...)`.

`evalNode()` guards against graph cycles with an `inProgress` set: re-entering a node still on the evaluation stack returns `{}`, so the upstream input falls back to its default instead of recursing into a stack overflow. Keep this guard in place when editing the evaluator.

**Groups (ADR 0001):** `evaluateGraph(nodes, edges, tick, W, H, groups)` takes an optional group registry. A `Group` node recurses into `groups[groupId]` (a subgraph) and returns the frame from that subgraph's `GroupOutput` terminal; a `groupStack` breaks group-level recursion. The `instancePrefix`/`groupStack` params are internal recursion bookkeeping — callers leave them defaulted.

A **3D view** toggle (`uiStore.preview3d`) wraps the canvas in a CSS `perspective` container and applies a drag-driven `rotateX/rotateY` to orbit the matrix panel — no Three.js or renderer changes; the canvas content is still drawn the same way each frame.

**`src/components/Preview/webglRenderer.ts`** — `WebGLLEDRenderer` uploads the frame as a texture and renders via a GLSL fragment shader. The shader draws each LED as a smooth circular disc with a 5×5-neighbor glow contribution. Y is flipped in the shader (`u_res.y - gl_FragCoord.y`) to match the JS frame's top-left origin. Falls back to Canvas 2D if WebGL is unavailable.

### Audio Pipeline

`src/audio/audioEngine.ts` — `AudioEngine` (singleton) uses `getUserMedia` → `AudioContext` → `AnalyserNode`. It polls FFT on every animation frame and fires subscribers with `{ bass, mids, treble, beat, spectrum }`. Beat detection uses a 30-frame rolling average of bass energy with a 1.4× threshold and 300 ms cooldown.

`src/state/audioStore.ts` bridges `AudioEngine` → Zustand. `FFTAnalyzer` and `BeatDetect` nodes in the evaluator read from `useAudioStore.getState()` directly (not through React).

App.tsx auto-starts audio when a `MicInput` node is added to the graph; auto-stops when it's removed.

### C++ Code Generator

`src/codegen/cppGenerator.ts` — `generateCpp(nodes, edges)` topologically sorts the graph and emits a FastLED `.ino` sketch. Each node type has a `case` in the `emit()` switch that writes to `loopLines[]`. The `needsT` flag enables a `float t = millis() / 1000.0f` variable only when needed. Inputs are resolved to C++ expressions via `floatExpr()`, `colorExpr()`, `boolExpr()`.

### Upload Panel

`src/components/Upload/UploadPanel.tsx` — modal overlay with:
- Live code preview textarea (left pane), with a copy button
- Board selector → arduino-cli **FQBN**, `.ino` download, and a generated **`arduino-cli`** command block (core/lib install → compile → `board list` → upload) with copy (right pane)
- `validateGraph()` (extracted to `src/utils/validateGraph.ts`, unit-tested) checks for MatrixOutput, connected frame port, and isolated nodes, returning `{ errors, warnings }`; the panel shows results as colored chips in the footer

Building/flashing is done **locally via `arduino-cli`** (the panel emits the commands) rather than a cloud compile service or in-browser WebSerial flashing — keeping the app a pure static frontend. The board → FQBN/core map lives in `UploadPanel.tsx`.

### Design Tokens

All colors, spacing, and typography are CSS variables in `src/themes/tokens.css`. Each node category maps to an accent color. Category metadata (display order, label, accent CSS var, and literal hex for canvas/SVG) lives in one place — the `CATEGORIES` table in `src/state/nodeLibrary.ts`, which also exports `CATEGORY_COLOR` (hex) and `CATEGORY_ACCENT_VAR` (CSS var). Do not re-inline these maps in components.

| Category | Hex | CSS var |
|----------|-----|---------|
| audio | `#00ffff` | `--accent-audio` |
| hardware | `#ffa500` | `--accent-hardware` |
| math | `#a8ff00` | `--accent-math` |
| color | `#ff4d8d` | `--accent-color` |
| pattern | `#ff00ff` | `--accent-pattern` |
| composite | `#00e0a4` | `--accent-composite` |
| output | `#00bfff` | `--accent-output` |

Categories group nodes by **primary output type** (the real type system is the per-port `dataType`, of which category is a coarse, UI-facing reflection): `color` produces colors/palettes, `pattern` is frame *generators*, `composite` is frame→frame operations. Sidebar grouping order follows the authoring pipeline (sources → math → color → pattern → composite → output).

Key layout constants: sidebar `280px`, inspector `280px`, menu bar `48px`, status bar `40px`, node `220px × 140px`, base spacing `8px`.

## Node Library

Nodes are grouped into categories. Adding a new node type requires:
1. One entry in `src/state/nodeLibrary.ts`
2. A `case` in `graphEvaluator.ts` `evalNode()` switch (for live preview)
3. A `case` in `cppGenerator.ts` `emit()` switch (for C++ codegen)
4. A one-line tooltip in `NODE_DESCRIPTIONS` (`nodeLibrary.ts`) — enforced by `nodeLibrary.test.ts`

Current nodes by category (see `nodeLibrary.ts` for the authoritative list):
- **audio**: FFTAnalyzer, BeatDetect, MicInput, AudioHue
- **hardware**: ButtonInput, PotInput
- **math**: MathAdd, Multiply, Clamp, MapRange, Sin, Cos, Lerp, TimeNode, Abs, Mod, MinNode, MaxNode, Random, Counter, Gate, Not, Compare, BeatSin, XYMapper
- **color**: HSVToRGB, BlendColors, CHSV, Temperature, GradientSampler, PaletteSampler, PaletteSelector, CustomPalette, PaletteBlend
- **pattern** (frame generators): SolidColor, Span, Rect, Circle, Line, Text, NoiseField, Fire, Fire2012, Plasma, SpectrumBars, BassPulse, MidrangeWaves, TrebleSparks, BeatFlash, Noise2D, RadialBurst, Spiral, Kaleidoscope, Particles, GradientFrame, Simplex2D, Noise3D, Worley, FractalNoise, Blobs, FlowField, ReactionDiffusion, GameOfLife, PatternMaster, CustomFormula
- **composite** (frame→frame): BlendFrames, BrightnessMod, HueShift, Invert, Blur2D, LayerBlend, Mask, Crossfade, Wipe, Dissolve, Sequencer
- **output**: MatrixOutput

Some node types are created programmatically rather than dragged from the sidebar (so they have no `NODE_LIBRARY` entry): `Group` and `GroupOutput`/`GroupInput` are minted by `graphStore.createGroup` (see the multi-graph/group section above).

The `Text` node renders with the built-in 3×5 bitmap font in `src/state/font.ts`. The font is plain data (`FONT`, `BitmapFont`, `textColumns`, `asFont`) shared by the evaluator and the C++ generator so preview and firmware match exactly. A Text node can carry a **custom font** in `properties.font` (a `{ w, h, glyphs }` object, uploaded as JSON via the Inspector); `asFont()` validates it and everything else (rendering, scrolling, codegen) reads the resolved font's dimensions, so no other code changes are needed.

## Specification Docs

The original design intent lives in `.docs/`:

- `.docs/Proposal-FastLED_Studio` — full node-type catalogue and deployment workflow
- `.docs/Design_Specification.md` — visual design system (colors, typography, animations, component specs)
- `.docs/Developer_Handoff_Specification` — implementation guide (CSS variables, data schemas, performance requirements, upload pipeline steps)

Derive interaction behavior, animation durations, and component dimensions from these rather than inventing them.
