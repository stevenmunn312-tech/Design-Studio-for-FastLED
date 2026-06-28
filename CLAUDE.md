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

It is a **multi-graph workspace** (ADR 0001): the *active* graph stays in the top-level `nodes`/`edges` (so all consumers are unchanged), while inactive graphs (pattern groups) live in `graphData`, keyed by id, with metadata in `graphs`. `createGroup` encapsulates selected nodes into a new subgraph (adding a `GroupOutput` terminal) and replaces them with a single `Group` node; `enterGraph` switches the active graph (pausing/clearing undo history around the swap). Scene-level singletons in the selection (`GROUP_EXCLUDED_TYPES` — `MatrixOutput`, `MicInput`, `MusicLibrary`) are **left behind** in the parent graph rather than sealed inside the group: a left-behind `MatrixOutput` becomes an outgoing boundary edge auto-rewired to the new `Group`'s frame output, and a left-behind source feeding the selection becomes an exposed `Group` input — so "select-all → group → repeat" keeps the output and sources in place for the next pattern. `getGroupRegistry()` assembles the `{ groupId: { nodes, edges } }` map that `evaluateGraph` needs, and `LEDPreview` passes it every frame so groups preview live at both tiers.

**Pattern library (Phase 1 of the generative-pattern-show workflow — see `docs/development/design/generative-pattern-show.md`).** `src/state/patternLibrary.ts` is a Zustand store of saved pattern groups persisted to `localStorage` (`usePatternLibrary`: `savePattern`/`renamePattern`/`deletePattern`). A Group node's context menu **"Save to Library"** stores its port signature + subgraph; the Sidebar's **My Patterns** section lists them, draggable/clickable to drop a copy via `graphStore.instantiatePattern` (registers a fresh `graphData[groupId]` from a `structuredClone` of the saved subgraph).

**Pattern Collection (Phase 2).** The `PatternCollection` node holds a chosen subset of pattern groups for a show. Wiring a **Group** node's frame output into its `pattern` input is intercepted in `NodeGraphCanvas.handleConnect`: instead of creating a noodle it confirms and **absorbs** the group via `graphStore.addToCollection` — the Group node (and its edges) leave the canvas while its subgraph stays in `graphData`, and its id is appended to the collection's `properties.patternIds`. `PatternCollectionBody` renders the absorbed list (removable via `removeFromCollection`, which also drops the subgraph). The node outputs a `patternset` (the group-id list); the evaluator returns it from the `PatternCollection` case for the Pattern Master to resolve via the group registry.

**Pattern Master (Phase 3) — the generative show engine.** `PatternMaster` was repurposed from the old 4-input cycler into the show engine: inputs are a `patternset` + optional `beat`; properties are `minTime`/`maxTime`/`transitionSec` (inline sliders) and `transitions` (a pool of styles, toggled via the chip grid in `PatternMasterBody`). The evaluator's `PatternMaster` case rasterises each collected pattern by recursing into its group (`evaluateGraph`, namespaced per pattern) and drives `evalPatternShow` — a stateful machine (module-level `patternShowState`) that holds a random pattern for a random dwell in `[minTime, maxTime]`, then transitions (a random style from the pool) into another random pattern; a wired `beat` advances early once `minTime` has elapsed. The 16 transition effects are shared with the `Transition` node through the extracted `compositeTransition(type, a, b, t, W, H, opts)`. `patternset` is a new port `dataType` (a `string[]` of group ids in `PortValue`). `validateGraph` warns when no collection is wired.

**Show codegen (Phase 4).** `src/codegen/showGenerator.ts` (`isPatternShow`/`generateShowSketch`) turns a `PatternCollection → PatternMaster → MatrixOutput` graph into a **controller sketch**: one `render_pN(uint32_t ms)` per collected pattern plus a `loop()` that holds a random pattern for a random dwell and crossfades into another (the firmware mirror of `evalPatternShow`). Each pattern body is produced by **reusing `generateCpp`** on the pattern's subgraph (re-terminated at a synthetic `MatrixOutput`) and rewriting the loop into a function — buffers prefixed per pattern, helpers hoisted/deduped — so every supported node type works in a show with no extra codegen. `MatrixOutputUpload` uses `generateShowSketch` when `isPatternShow`, else `generateCpp`. First slice: single file, time-based switching, crossfade only; the other 15 transition styles, the `beat` trigger, and multi-file `.h`-per-pattern output are follow-ups. **Hardware-validated** on an ESP32-S3 (2026-06-26): a two-pattern collection compiled (51% flash, 9% RAM) and ran with smooth crossfades and ~5 s dwell matching the preview. The unimplemented follow-ups above remain untested.

**`src/state/uiStore.ts`** owns panel visibility (`sidebarOpen`, `inspectorOpen`, `showUploadPanel`), status bar message/level, FPS counter, theme, reduced-motion, and high-contrast flags. `setStatus` auto-clears any transient level (`info`/`success`/`error`) back to idle after 5 s, cancelling any prior pending timer so a newer message isn't wiped by a stale one.

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
const PREVIEW_H = 40  // WaveScope .scope height (only on Wave/ComplexWave)
const handleTop = (i, previewOffset) => HEADER_H + BODY_PAD + previewOffset + i * (ROW_H + ROW_GAP) + ROW_H / 2
```

Changing any of those CSS values without updating the constants will silently misalign all connection handles.

**Per-node live previews:** every node whose primary output is a `frame`, `palette`, or `color` shows a live preview at the top of its body (`NodePreview`): a mini LED-matrix thumbnail (canvas), a gradient strip, or a colour swatch respectively. Frame thumbnails fill the node width at the matrix aspect ratio — `StudioNode` computes the height (`BODY_CONTENT_W × gridH/gridW`, grid dims read from the MatrixOutput node) and feeds it to both `NodePreview` and `handleTop` so the ports stay aligned; palette/colour/wave previews use the fixed `PREVIEW_H`. These are driven by a **single shared evaluation pass**: `LEDPreview`'s render loop calls `evaluateGraphFull` (which returns the terminal frame *and* every node's output ports in one `createEvalNode` pass, so stateful nodes aren't double-advanced) and publishes the per-node outputs to `previewStore` throttled to ~15fps; each `NodePreview` subscribes to its node's entry. Like the wave scopes, the preview adds `PREVIEW_H + ROW_GAP` to `handleTop` so port handles stay aligned.

**Waveform preview scope:** `Wave` and `ComplexWave` nodes render a `WaveScope` mini-oscilloscope at the top of the body (above the port rows). Because handles are absolutely positioned, this scope pushes the rows down — so `handleTop` takes a `previewOffset` (`PREVIEW_H + ROW_GAP` for these nodes, else 0). `Wave`'s scope samples its own configured shape (`waveNodeSamples` in `src/state/wave.ts`, which also backs the evaluator). `ComplexWave`'s scope (`ComplexWaveScope`) is **live**: it subscribes to `nodes`/`edges` and samples the node's own `result` port across the window via `evaluateScalar`, so it reflects the actual upstream inputs and the chosen operation.

`evaluateScalar(nodes, edges, nodeId, portId, tick)` probes a single node's scalar output by reusing the shared `createEvalNode` core (the same machinery `evaluateGraph` runs), so a probe matches what the graph actually computes. It runs under a reserved `__scope__/` state namespace so stateful upstream nodes don't disturb the live render.

**Typed port colours:** each handle (input/output dot) is tinted by its port `dataType` via `portColor()` (`nodeLibrary.ts`), so ports that can connect share a colour — `float`/`bool` share one (they interconvert per `portsCompatible`, also in `nodeLibrary.ts` and shared by the canvas + picker), `color`/`palette`/`frame`/`audio` are distinct. The node header/border still uses the category accent. Handles also carry a `label · dataType` title.

**Drag-to-create:** dropping a noodle dragged from an **output** onto empty canvas opens the `CanvasContextMenu` picker pre-filtered to nodes that have an input compatible with the dragged type, then auto-wires the chosen node to its first matching input. `onConnectStart` records the output's `{ nodeId, handleId, dataType }` in a `connectFrom` ref; `onConnectEnd` opens the picker only when the drop has no end handle (`!state.toHandle`). `CanvasContextMenu` takes an optional `connectFrom` prop that puts it straight into picker mode, filters `NODE_LIBRARY` via `compatibleInput()`, and calls `onConnect` after `addNode`.

**Drop-to-splice + auto-spread:** when a node dragged from the sidebar is dropped onto an existing noodle (`onDrop` in `NodeGraphCanvas`, within `SPLICE_DIST` flow units of the edge segment, via `distToSegment`) and the node has an input compatible with the edge's source output *and* an output compatible with the edge's target input (`portsCompatible`), it's spliced in: `graphStore.insertNodeOnEdge` drops the old edge and wires `source → new → target` (matching `onConnect`'s glow/reconnect style). Otherwise the node just lands where dropped. To keep the area tidy, `spreadNodes` (run after a splice, after every `onConnect`, and on `onNodeDragStop`) walks edges left-to-right and shifts any target that *crowds* its source rightward (grid-snapped) to restore `MIN_NODE_GAP`. "Crowds" means too close horizontally **and** overlapping vertically, so a pair deliberately stacked in a column (a long noodle dropping straight down) is left alone; it only ever pushes right, so it spreads a cramped chain without disturbing a layout that already has room.

**Inline property editors:** the node body renders editable controls for each property, Blender-style — so editing happens on the node with live preview. Control choice: a colour swatch for `r/g/b`; then by `propertyMeta(nodeType, key)` (`nodeLibrary.ts`) — `select` dropdowns for enum properties (`palette`/`paletteA`/`paletteB`, `direction`, `mode`, `chipset`, `colorOrder`) and `slider` (range + value readout) for bounded numerics (`speed`, `scale`, `fade`, `amount`, `count`, `kelvin`, …); otherwise type-based fallbacks (checkbox for booleans, number/text field). Add a `PROPERTY_META` entry to give a property a dropdown or slider — keyed by **property name** (shared across nodes), so for a name that means something different on another node (e.g. `speed` is 0–5 animation speed but a steps/sec rate on `GameOfLife`/`ReactionDiffusion`; `rate` is 0–1 on `Particles` but degrees/sec on `Transform`) add a `PROPERTY_META_OVERRIDES[nodeType]` entry instead. These render in a `.props` section **below** the port rows, so they don't affect the handle offsets above. Interactive controls carry the `nodrag` (and `nowheel` for number fields) class so React Flow doesn't pan/drag while editing. The `font` object is excluded (edited via the Inspector). The **Inspector** panel still exists but is opt-in (`inspectorOpen` defaults false; toggle from the menu bar).

**Per-input clamping:** any node with a bounded float input shows a `clamp inputs` checkbox (`props.clampInputs`, rendered specially in `StudioNode` via `hasClampableInputs()`). When on, a *wired* float input is clamped to its slider's `[min, max]` (`inputClampRange()`) — the inline alternative to wiring a `Clamp` node onto every connection (an unwired value already comes from a bounded slider, so only wired signals are clamped). Both the evaluator (`num()`) and the C++ generator (`floatExpr` → `constrain(...)`) honour it, so firmware matches the preview.

### Edge Rendering

`GlowEdge` (`src/components/Canvas/GlowEdge.tsx`) renders three stacked SVG `<path>` elements (wide halo → mid bloom → thin animated core) plus a dot at the target. Color is resolved at render time from `useReactFlow().getNode(source)?.data.category`. The MiniMap picks up edge colors from `style.stroke` set at connect time in `graphStore.onConnect`.

Edges ("noodles") can be unplugged from a node's **input** end two ways. (1) **Grab the input port dot directly** — `onConnectStart` detects a drag beginning on an already-connected `target` handle and immediately `removeEdge`s that noodle (a `detaching` ref), so the gesture becomes an unplug (drop on empty) or re-route (drop on a compatible output, which `handleConnect` re-adds) instead of starting a dead-end new wire. This is the primary path because React Flow's reconnect anchor sits in a thin strip just *outside* the port and is hard to hit. (2) Edges are also created `reconnectable: 'target'`, so the React Flow reconnect anchor still works: the canvas wires `onReconnectStart`/`onReconnect`/`onReconnectEnd` and a `reconnectLanded` ref deletes the edge if the dragged end lands on empty space (`removeEdge`) or re-routes it (`reconnectNoodle`).

### Live Preview Pipeline

`LEDPreview.tsx` drives a `requestAnimationFrame` loop that evaluates the graph (`evaluateGraphFull`, see per-node previews above) and renders the matrix. **Timing is wall-clock based:** the loop gates to ~60 steps/sec off `performance.now()` and passes `tick = elapsedMs / (1000/60)` so `t = tick/60` equals real seconds — matching the firmware's `millis()/1000`. This means animation speed is independent of the display refresh rate (a 120 Hz panel would otherwise run everything ~2× fast, since the old code incremented `tick` once per rAF assuming exactly 60 fps). When the graph is empty, `idleFrame()` shows a rainbow shimmer instead. The per-frame body is wrapped in `try/catch` so a single malformed frame logs and is skipped rather than tearing down the loop.

**`src/state/graphEvaluator.ts`** is the runtime engine. It topologically evaluates nodes in dependency order using memoisation per frame. Key types:

```ts
export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x]
```

Stateful nodes (`Fire`, `Fire2012`, `BeatFlash`, `Counter`, `Particles`, `PatternMaster`, `ReactionDiffusion`, `GameOfLife`, `FlowField`, `Starfield`) persist state in module-level `Map` objects keyed by `stateKey(id)` — the node id prefixed with the group-instance path, so two instances of the same group don't share state. `formulaCache` compiles `CustomFormula` expressions once via `new Function(...)`.

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

### Upload UI (node-local)

Upload is driven **from the MatrixOutput node** — there is no separate modal (the old `UploadPanel` was removed). `src/components/Upload/MatrixOutputUpload.tsx` renders in the node body: a **⚙ Board** button (opens the board popup), a `<board> · <port>` label, an **Upload** button that shows inline status (`Compiling… / Uploading 42% / ✓ Done / ✗ Error`), an **Export .ino** button, an **♪ Upload show to SD** button (only when an `SDCard` node is wired), and a small **⌗ Output** button. All upload state and actions live in `src/state/uploadStore.ts` (Zustand): the board catalogue (`BOARDS`), the persisted selection (`myBoards`/`selectedFqbn`/`selectedPort` in `localStorage`), the live `status`/`log`, and the overlay flags. `parseStatus(log)` (unit-tested) derives the compact status from the helper's streamed markers (`=== … compile/upload ===`, esptool `(NN %)`, `exit code: N`); an `error` phase auto-opens the console.

Three global overlays (rendered in `App.tsx`, driven by store flags): **`BoardPopup`** (a boards-manager list to toggle which boards appear in the dropdown + per-board core install/status, then board + port dropdowns and the resolved `<board> · <port>` label), **`ArduinoCliPopup`** (shown when the helper is up but `arduino-cli` is missing — *Locate…* a binary or *Install* one), and **`OutputConsole`** (a dismissible slide-over streaming the detailed compile/upload log).

`validateGraph()` (`src/utils/validateGraph.ts`, unit-tested) still checks for MatrixOutput, a connected frame port, and isolated nodes. Building/flashing is done **locally via `arduino-cli`** rather than a cloud compile service or in-browser WebSerial flashing.

### Upload Helper (`backend/`)

A browser page can't launch a local CLI, so `backend/` is a small **FastAPI** service the app POSTs to. **It is auto-launched** by `vite-plugin-upload-helper.ts` (wired into `vite.config.ts`): the dev/preview server TCP-probes `:8008` and, if nothing's there, spawns `python -m uvicorn app:app --port 8008 --app-dir backend`, killing the child on server close. (`npm run helper` still starts it manually; if Python/deps are missing the app runs fine, upload just stays dark.) Endpoints: `/api/health` (liveness + whether `arduino-cli` is found), `/api/serial/ports` (`board list`), `/api/upload` (compile then `upload -p PORT`, streaming logs), `/api/upload-show` (music-sync flow, below), `/api/cores` + `/api/core/install` (board-manager core list/install, registering third-party board URLs first), and `/api/arduino-cli/locate` + `/api/arduino-cli/install` (point the helper at a user-supplied binary, or download the official one into `backend/bin`). The resolved CLI path is **persisted** to `backend/.helper-config.json` (gitignored), so `_find_arduino_cli` checks: saved path → `ARDUINO_CLI` env → `PATH` → Arduino IDE bundle → self-installed `backend/bin`. `src/utils/backendClient.ts` is the frontend client (`checkBackend`/`listPorts`/`listCores`/`uploadSketch`/`uploadShow`/`locateCli`/`installCli`/`installCore`); `BACKEND_URL` defaults to `http://localhost:8008` (override via `VITE_BACKEND_URL`).

**Music-sync upload (SD card).** When an `SDCard` node is wired into MatrixOutput's `sdcard` input, the node shows an "Upload show to SD" button. `src/utils/showUpload.ts` (`sdCardConnected`/`buildShowPayload`) assembles a **provisioner** sketch (`provisionerSketchGenerator.ts`), the **player** sketch (`playerConfigFromGraph()` pulls LED config from MatrixOutput + SD/I2S pins from SDCard), and the SD file list (`/music/<title>.mp3` from `entry.file`, `/shows/<title>.show` from `showFileToBinary`). `/api/upload-show` (multipart) then: ① compiles+uploads the provisioner, ② opens the serial port with pyserial and runs the provisioner wire-protocol (`PING`→`READY`, then `PUT <path> <n>` + `PROVISION_CHUNK`-byte blocks with a per-block `A` ack, `DONE`/`END`/`BYE`) to write each file to the card, ③ compiles+uploads the player. The protocol's two sides are `provisionerSketchGenerator.ts` (device) and `_serial_send` in `backend/app.py` (host) — keep them in sync.

### Music-Sync Show Pipeline

A second, **offline** authoring path (distinct from the live preview/codegen flow above) turns audio tracks into timed LED "shows" the ESP32-S3 plays back in sync. It is a three-node chain in the `hardware` category, wired by new `dataType`s `songs` and `shows`:

`MusicLibrary` (drop MP3s) **→** `PerformanceGenerator` (rules engine) **→** `SDCard` (export ZIP).

- **`src/audio/musicAnalyzer.ts`** — Web Audio API *offline* analysis of an uploaded MP3: BPM detection, per-~100 ms energy envelope (bass/mids/treble/overall), beat timestamps, section detection (intro/verse/buildup/drop/…), and mood (energy/valence/key) estimation. Returns the `SongAnalysis` shape in `src/types/showFile.ts`.
- **`src/codegen/performanceGenerator.ts`** — a rules engine that maps a `SongAnalysis` to a timed `ShowFile`: a sorted event stream of `SET_PATTERN`/`SET_PALETTE`/`SET_SPEED`/`SET_BRIGHTNESS`/`BEAT_FLASH`/`TRANSITION` commands. Tuned by the node's `beatIntensity`/`energySensitivity`/`transitionDuration`/`paletteMode` properties.
- **`src/types/showFile.ts`** — the `.show` format: a compact, sorted event stream (timestamps in ms from song start) the player binary-searches by audio position for frame-perfect A/V sync. Also defines the `SongAnalysis`/`BeatInfo`/`EnergyPoint`/`SongSection` analysis types.
- **`src/codegen/playerSketchGenerator.ts`** — emits a FastLED + **ESP32-audioI2S** player `.ino` that slaves LED commands to `audio.getPosition()`. The `SDCard` node properties configure its pins (SD CS, LED data, I2S BCLK/LRC/DOUT), matrix size, chipset/colour order, and volume.
- **`src/utils/zipExport.ts`** — a zero-dependency ZIP builder; `SDCard` packages the `.show` files + the generated player sketch into one downloadable archive (drop onto the board's SD card).
- **`src/state/musicStore.ts`** — Zustand store managing the analysis queue and generated shows; **`src/components/Canvas/MusicLibraryNodeBody.tsx`** is the library UI (engine toggle, drop zone, per-song status, *Analyse All* / *Export ZIP* / *Clear*) rendered **directly in the `MusicLibrary` node body** in `StudioNode` (the node widens to fit; interactive controls carry `nodrag`, the song list `nowheel`). `MusicLibrary` is an **input**-category node (the song source), not a menu-bar button — there is no separate modal panel.

These nodes have no `frame`/`palette`/`color` output, so they don't participate in the live LED preview or the `cppGenerator.ts` sketch — they are a parallel export pipeline. (Added in PR #58.)

### Design Tokens

All colors, spacing, and typography are CSS variables in `src/themes/tokens.css`. Each node category maps to an accent color. Category metadata (display order, label, accent CSS var, and literal hex for canvas/SVG) lives in one place — the `CATEGORIES` table in `src/state/nodeLibrary.ts`, which also exports `CATEGORY_COLOR` (hex) and `CATEGORY_ACCENT_VAR` (CSS var). Do not re-inline these maps in components.

| Category | Hex | CSS var |
|----------|-----|---------|
| input | `#b388ff` | `--accent-input` |
| audio | `#00ffff` | `--accent-audio` |
| hardware | `#ffa500` | `--accent-hardware` |
| math | `#a8ff00` | `--accent-math` |
| color | `#ff4d8d` | `--accent-color` |
| pattern | `#ff00ff` | `--accent-pattern` |
| composite | `#00e0a4` | `--accent-composite` |
| output | `#00bfff` | `--accent-output` |

Categories group nodes by **primary output type** (the real type system is the per-port `dataType`, of which category is a coarse, UI-facing reflection): `color` produces colors/palettes, `pattern` is frame *generators*, `composite` is frame→frame operations. Sidebar grouping order follows the authoring pipeline and `CATEGORIES` order (input → audio → hardware → math → color → pattern → composite → output); `input` holds the signal sources (MicInput, MusicLibrary).

Key layout constants: sidebar `280px`, inspector `280px`, menu bar `48px`, status bar `40px`, node `220px × 140px`, base spacing `8px`.

## Node Library

Nodes are grouped into categories. Adding a new node type requires:
1. One entry in `src/state/nodeLibrary.ts`
2. A `case` in `graphEvaluator.ts` `evalNode()` switch (for live preview)
3. A `case` in `cppGenerator.ts` `emit()` switch (for C++ codegen)
4. A one-line tooltip in `NODE_DESCRIPTIONS` (`nodeLibrary.ts`) — enforced by `nodeLibrary.test.ts`

Current nodes by category (see `nodeLibrary.ts` for the authoritative list):
- **input** (signal sources): MicInput, MusicLibrary
- **audio**: FFTAnalyzer, BeatDetect, AudioHue
- **hardware**: ButtonInput, PotInput, PerformanceGenerator, SDCard (the last two are the rest of the music-sync export chain — see *Music-Sync Show Pipeline*)
- **math**: Math, Clamp, MapRange, Sin, Cos, Wave, ComplexWave, Lerp, TimeNode, Abs, Mod, Random, Counter, Gate, Not, Compare, BeatSin, XYMapper
- **color**: HSVToRGB, BlendColors, CHSV, Temperature, GradientSampler, PaletteSampler, PaletteSelector, CustomPalette, Poline, PaletteBlend
- **pattern** (frame generators): SolidColor, Span, Rect, Circle, Line, Text, Noise, Fire, Fire2012, Plasma, SpectrumBars, BassPulse, MidrangeWaves, TrebleSparks, BeatFlash, Noise2D, RadialBurst, Spiral, Kaleidoscope, Particles, GradientFrame, FractalNoise, Blobs, FlowField, ReactionDiffusion, GameOfLife, PatternMaster, CustomFormula, FieldFormula, FieldToFrame, DistanceField, FieldMath, Starfield, AudioFlow, GaborNoise, PaletteGradient, Image
- **composite** (frame→frame): Blend, BrightnessMod, HueShift, Transform, Invert, Blur2D, Mask, Fade, Transition, Sequencer, PatternCollection, FieldWarp, FieldRotate, FieldTile

### Bundled nodes

Several former node types are collapsed into one **bundled** node, selected by a variant property (the pattern to follow when consolidating other identical-signature clusters):

- **`Noise`** — `noiseType` (`field`/`simplex`/`noise3d`/`worley`/`plasma`); folds the former NoiseField/Simplex2D/Noise3D/Worley/PlasmaFractal.
- **`Math`** — `mathOp` (`add`/`subtract`/`multiply`/`divide`/`min`/`max`); folds MathAdd/Multiply/MinNode/MaxNode (`subtract`/`divide` are new ops). Mod (`x,m` ports) and Compare (bool out) stay separate.
- **`Transition`** — `transitionType` selects one of **16** A→B effects: `crossfade`/`wipe`/`dissolve` plus `iris`/`clockwipe`/`push`/`checkerboard`/`diagonal`/`fadeblack`/`fadewhite`/`blinds`/`ripple`/`spiral`/`curtain`/`scanlines`/`zoom`. Variant-specific props (`direction` for wipe/push, `axis` for blinds/curtain, `tileSize` for checkerboard, `count` for blinds, `turns` for spiral) are gated by `isPropertyEnabled`. The C++ generator emits real buffer compositing per variant (seed `ob` from A, write B in), not just the three originals.
- **`Blend`** — `blendMode` (`normal`/`multiply`/`screen`/`overlay`/`add`/`difference`); replaces LayerBlend + BlendFrames. Composites B over A per mode, mixed by `amount` (opacity, **0–1**; scaled ×255 in the evaluator + codegen for FastLED's `nblend`). `Blur2D`/`PaletteBlend` share the same 0–1 `amount`. Migration rescales any legacy 0–255 `amount` (value > 1 ⇒ old scale) to 0–1 on load. The `normal` path emits FastLED `nblend`; other modes emit a per-channel blend loop in C++. (The former BlendFrames used a 0–1 `t` port, so its migration carries `t`→`amount` and rewires that edge — the one bundle whose port id changed.)

Mechanics: each variant set lives in `PROPERTY_META` (the inline dropdown); the evaluator and C++ generator dispatch on the variant property in their single `case`; `graphStore.loadGraph` (via `migrateLegacyGraph`/`LEGACY_BUNDLE`) migrates the legacy node types — and any renamed edge handles — on import. `nodeDisplayLabel()` makes the node header reflect the selected variant, and `isPropertyEnabled()` disables an inline editor that doesn't apply to the current variant (e.g. Transition `direction`) while still showing its value. Bundling is **by identical port signature** — properties may differ between variants (Blend is the one exception, unifying two near-identical nodes whose mix-port id/scale differed).
- **output**: MatrixOutput

Some node types are created programmatically rather than dragged from the sidebar (so they have no `NODE_LIBRARY` entry): `Group` and `GroupOutput`/`GroupInput` are minted by `graphStore.createGroup` (see the multi-graph/group section above).

The `Text` node renders with the built-in 3×5 bitmap font in `src/state/font.ts`. The font is plain data (`FONT`, `BitmapFont`, `textColumns`, `asFont`) shared by the evaluator and the C++ generator so preview and firmware match exactly. A Text node can carry a **custom font** in `properties.font` (a `{ w, h, glyphs }` object, uploaded as JSON via the Inspector); `asFont()` validates it and everything else (rendering, scrolling, codegen) reads the resolved font's dimensions, so no other code changes are needed.

The `Poline` node generates a smooth palette via the **poline** library (polar interpolation between two anchor colours). `src/state/polinePalette.ts` wraps it (`polinePalette` → `RGB[]` for the evaluator/preview, `polineStops16` → 16 stops the C++ generator bakes into a `CRGBPalette16`, plus the position-function list mirrored in `PROPERTY_META.position`). Anchors come from two wired `color` inputs; the per-anchor `anchorA`/`anchorB` hex props are the fallback when unwired and the values codegen bakes (live-wired anchors drive only the preview). Like `CustomPalette`/`PaletteBlend`, a connected `Poline` resolves to `pal_<id>` in `paletteExpr`.

The `Image` node follows the same shared-data pattern via `src/state/image.ts`: an uploaded picture is downscaled in the Inspector to ≤`IMAGE_MAX_DIM` (32) and stored in `properties.image` as `{ w, h, pixels }` (flat `r,g,b` bytes). `asImage()` validates it; `sampleImageToFrame()` nearest-neighbour samples it to the matrix for preview, and the C++ generator emits the same pixels as a `PROGMEM` array blitted with `pgm_read_byte`. Like `font`, the `image` object is excluded from the inline node editors and the generic Inspector field list (edited via the Inspector's upload control instead).

**Float-field pipeline (ANIMartRIX — Phase 1 of `docs/development/design/animartrix-float-field.md`).** A new `field` port `dataType` carries a per-pixel scalar grid (`Float32Array`, length W×H, values 0–1) — the `Field` type in `graphEvaluator.ts`, added to `PortValue`. `FieldFormula` evaluates a per-pixel expression into a field; `FieldToFrame` maps a field through a palette into a `frame` (the only `field`→`frame` conversion). Both, plus the existing `CustomFormula`, expose centred/polar vars (`cx`, `cy`, `r`, `angle`) and FastLED fixed-point shims (`sin8`/`cos8`/`sin16`/`beatsin8`/`beatsin16`/`scale8`/`qadd8`/`qsub8`) so ANIMartRIX-style one-liners work verbatim — `FieldFormula` uses integer `x,y`, `CustomFormula` keeps `x,y` normalised 0–1 for backward compatibility. The shims live in **`src/state/fastledShims.ts`**, shared by the evaluator (`makeShims(t)` injects them into the `new Function` sandbox, cached in `fieldFormulaCache`/`formulaCache`) and the codegen (`CPP_SHIM_HELPERS` emits float wrappers like `_fsin8`, `cppRewriteShims` rewrites call sites so `sin8(x)/255` stays float division on-device). Field-producing nodes get a `float field_<id>[NUM_LEDS]` buffer in the generated sketch, parallel to the `CRGB buf_<id>` frame buffers. **Phase 2** adds field-composition nodes: `DistanceField` (distance from each pixel to a movable point, `scale` stretches the ramp), `FieldMath` (combine two fields — `fieldOp` of add/subtract/multiply/mix/min/max/difference, a bundled-title node), and `FieldWarp` (sample a field at coordinates pushed by `dx`/`dy` offset fields, nearest-neighbour and edge-clamped) — each `field`→`field`, composing freely before a terminal `FieldToFrame`. **Phase 3** adds coordinate-space transforms `FieldRotate` (rotate a field around its centre by an `angle` input + `spin` deg/sec, edge-wrapping) and `FieldTile` (repeat a field `tilesX`×`tilesY`); these are whole-field coordinate remaps (distinct from `FieldWarp`'s per-pixel offsets), so they ship as standalone composite nodes.

## Specification Docs

The original design intent lives in `.docs/`:

- `.docs/Proposal-FastLED_Studio` — full node-type catalogue and deployment workflow
- `.docs/Design_Specification.md` — visual design system (colors, typography, animations, component specs)
- `.docs/Developer_Handoff_Specification` — implementation guide (CSS variables, data schemas, performance requirements, upload pipeline steps)

Derive interaction behavior, animation durations, and component dimensions from these rather than inventing them.
