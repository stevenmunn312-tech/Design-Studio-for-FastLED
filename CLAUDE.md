# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**FastLED Studio** is a browser-based node-graph editor for designing LED lighting effects. Users wire together nodes on a canvas, see a real-time LED matrix preview, and (eventually) generate FastLED/Arduino C++ firmware for upload to microcontrollers like the ESP32-S3.

Core user flow: drag nodes from sidebar → wire ports together → preview updates live → generate C++ → upload via WebSerial/WebUSB.

## Commands

```bash
npm run dev       # start Vite dev server (http://localhost:5173)
npm run build     # tsc type-check + Vite production build
npm run lint      # ESLint
npm run preview   # serve the production build locally
```

No test suite exists yet.

## Stack

- **React 19 + TypeScript** via Vite, CSS Modules for all component styles
- **@xyflow/react v12** — node graph canvas, handles, edges, minimap
- **Zustand v5** — all app state (`graphStore`, `uiStore`)
- No Tailwind; styling is pure CSS variables defined in `src/themes/tokens.css`

## Architecture

### State

`src/state/graphStore.ts` owns the React Flow node/edge arrays and wraps `applyNodeChanges`, `applyEdgeChanges`, `addEdge` from `@xyflow/react`. It also tracks `selectedNodeId` and exposes `updateNodeProperty`. Uses `subscribeWithSelector` middleware.

`src/state/uiStore.ts` owns sidebar/inspector open state and the status bar message + level. `setStatus` auto-clears `info`/`success` messages after 5 seconds.

`src/state/nodeLibrary.ts` is the static registry of all node definitions (`NODE_LIBRARY: NodeDefinition[]`). Adding a new node type means adding an entry here — no other registration step required. The Sidebar reads this array directly.

### Node Rendering

`StudioNode` (`src/components/Canvas/StudioNode.tsx`) is the single custom node component registered as `{ studioNode: StudioNode }` in React Flow. **Critical invariant:** React Flow requires `Handle` components to be `position: absolute` relative to the node container. Handles are rendered outside the flex body and their `top` offset is calculated from constants that must stay in sync with the CSS:

```ts
// StudioNode.tsx — must match StudioNode.module.css
const HEADER_H = 32   // .header height
const BODY_PAD = 8    // .body padding-top (--space-1)
const ROW_H    = 24   // .portRow height
const ROW_GAP  = 4    // .body gap
const handleTop = (i: number) => HEADER_H + BODY_PAD + i * (ROW_H + ROW_GAP) + ROW_H / 2
```

If you change any of those CSS values, update the constants or handles will be misaligned and connections will break.

Port rows render inputs (left-padded) and outputs (right-padded) side-by-side in the same row using `space-between`.

### Edge Rendering

`GlowEdge` (`src/components/Canvas/GlowEdge.tsx`) is the custom edge type registered as `{ glowEdge: GlowEdge }` and set as the default via `defaultEdgeOptions={{ type: 'glowEdge' }}`. It renders three stacked SVG `<path>` elements (wide halo → mid bloom → thin animated core) plus a dot at the target. Color is resolved at render time via `useReactFlow().getNode(source)` to read the source node's `category` field.

### Canvas Layout

`NodeGraphCanvas` wraps everything in `<ReactFlowProvider>` so that the inner component can call `useReactFlow()` for both `screenToFlowPosition` (used in `onDrop` to place nodes at cursor position) and edge color lookup.

### Design Tokens

All colors, spacing, and typography are CSS variables in `src/themes/tokens.css`. The five node categories each map to an accent color:

| Category | Hex | CSS var |
|----------|-----|---------|
| audio | `#00ffff` | `--accent-audio` |
| pattern | `#ff00ff` | `--accent-pattern` |
| math | `#a8ff00` | `--accent-math` |
| output | `#00bfff` | `--accent-output` |
| hardware | `#ffa500` | `--accent-hardware` |

Key layout constants (also in tokens.css): sidebar `280px`, inspector `280px`, menu bar `48px`, status bar `40px`, node `220px × 140px`, base spacing `8px`.

## Specification Docs

The original design intent lives in `.docs/`:

- `.docs/Proposal-FastLED_Studio` — full node-type catalogue and deployment workflow
- `.docs/Design_Specification.md` — visual design system (colors, typography, animations, component specs)
- `.docs/Developer_Handoff_Specification` — implementation guide (CSS variables, data schemas, performance requirements, upload pipeline steps)

Derive interaction behavior, animation durations, and component dimensions from these rather than inventing them. See `todo.md` for what remains unimplemented.

## Planned but Not Yet Built

The LED preview (`LEDPreview.tsx`) currently runs a placeholder Canvas 2D animation — it does not evaluate the node graph. The audio pipeline (Web Audio API + AudioWorklet), C++ code generation, and WebSerial/WebUSB upload are all stubs. See `todo.md` for the full list.
