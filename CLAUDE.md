# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This repository is currently in the **specification/design phase**. No implementation code exists yet. The repository contains three specification documents that define what must be built:

- `.docs/Proposal-FastLED_Studio` — Feature scope: node categories, code-generation pipeline, deployment workflow
- `.docs/Design_Specification.md` — Visual design system: color tokens, typography, component specs, animations
- `.docs/Developer_Handoff_Specification` — Implementation guide: tech stack decisions, CSS variables, data schemas, file structure, performance requirements

When writing code, derive all design tokens, component dimensions, and interaction behavior from these documents rather than inventing them.

## What This Project Is

**FastLED Studio** is a browser-based, node-based visual designer that lets users build LED lighting effects by wiring together nodes on a canvas, then compiles the graph into FastLED/Arduino C++ firmware and uploads it to microcontrollers (primarily ESP32-S3).

Core user flow: drag nodes onto canvas → connect ports → see real-time LED preview → generate C++ firmware → upload via WebSerial/WebUSB.

## Intended Technology Stack

From `Developer_Handoff_Specification`:

- **Framework**: React + TypeScript
- **Node graph rendering**: PixiJS or custom WebGL canvas
- **LED preview rendering**: WebGL shader canvas
- **Audio processing**: Web Audio API + AudioWorklet for FFT
- **Hardware upload**: WebUSB / WebSerial
- **State management**: Zustand or Redux Toolkit
- **Styling**: CSS variables (design tokens defined in spec) + Tailwind or CSS-in-JS (Stitches/Emotion)

## Architecture

### Node System

All nodes share a common schema (`Developer_Handoff_Specification` §5.1):

```json
{
  "id": "uuid",
  "type": "NodeTypeName",
  "position": { "x": 320, "y": 120 },
  "inputs": { "portName": "sourceNodeId.outputPortName" },
  "outputs": { "portName": [] },
  "properties": {}
}
```

Nodes are registered via a **factory system** — rendering must be decoupled from node logic. The five node type categories, each with its own accent color, are:

| Category | Accent Color | CSS Var |
|----------|-------------|---------|
| Audio | `#00FFFF` | `--accent-audio` |
| Pattern | `#FF00FF` | `--accent-pattern` |
| Math | `#A8FF00` | `--accent-math` |
| Output | `#00BFFF` | `--accent-output` |
| Hardware | `#FFA500` | `--accent-hardware` |

### Graph Data Model

The persisted graph schema (`Developer_Handoff_Specification` §5.2) separates nodes from connections:

```json
{
  "nodes": [...],
  "connections": [
    { "from": { "node": "id1", "port": "bass" }, "to": { "node": "id2", "port": "hue" } }
  ]
}
```

Graph must autosave every 10 seconds and support 100-step undo/redo.

### Upload Pipeline

Code generation flow (`Developer_Handoff_Specification` §7):
1. Serialize node graph → intermediate representation
2. Generate C++ (FastLED setup, pattern classes, audio classes, transition classes, hardware handlers, main loop)
3. Compile via WebAssembly toolchain
4. Upload via WebSerial/WebUSB

### Recommended Source Layout

```
/src
 ├── components/       # Node, Sidebar, Preview, Inspector, StatusBar
 ├── canvas/           # NodeRenderer.ts, ConnectorRenderer.ts, GridRenderer.ts
 ├── state/            # graphStore.ts, uiStore.ts
 ├── utils/
 ├── themes/           # tokens.css
 └── upload/           # compiler.ts, uploader.ts
```

## Design System

All design tokens are defined as CSS variables (full list in `Developer_Handoff_Specification` §2). Key layout constants:

- App background: `#0D0F12`; Panel background: `#161A1F`; Node body: `#1F242B`
- Sidebar width: `280px`; Status bar height: `40px`; Menu bar height: `48px`
- Node: `220px × 140px`, `8px` border-radius, ports are `12px` circles with glow
- Base spacing unit: `8px`; node snap grid: `20px`
- Fonts: Inter (UI), JetBrains Mono (code/labels)

Node connector lines are Bezier curves with glow; they pulse when data flows. The canvas supports `0.5×–2.0×` zoom.

## Performance Constraints

- Node graph must handle **500+ nodes** without lag; use GPU-accelerated rendering
- LED preview targets **60 FPS** via WebGL shader pipeline
- All animations must use only `transform`/`opacity` (GPU composited)
- FFT processing must run in an **AudioWorklet** (off main thread)
