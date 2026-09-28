# CLAUDE.md

This file provides repository guidance to Claude Code and other coding agents.

<!-- AUTO-MANAGED: project-description -->
## Overview

Design Studio for FastLED is a browser-based node-graph editor for authoring LED effects, previewing them live, and generating FastLED/Arduino firmware. It combines project and pattern persistence, hardware configuration, audio-reactive workflows, generative and music-synchronised shows, local compilation, and USB upload support.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: build-commands -->
## Build & Development Commands

- `npm run dev` — start Vite at `http://localhost:5173`.
- `npm run build` — TypeScript project checks plus the production/PWA build.
- `npm run lint` — run ESLint.
- `npm test` — run Vitest once; use `npm run test:watch` while developing.
- `npm run test:coverage` — run Vitest with V8 coverage.
- `npm run preview` — serve the production build.
- `npm run helper` — start the FastAPI upload helper.
- `npm run package:desktop` — build the desktop package for the current host.
- One test file: `npx vitest run path/to/file.test.ts`.
- One test name: `npx vitest run -t "name"`.

The npm scripts intentionally suppress an upstream `punycode` warning; direct `npx vite` or `npx vitest` calls may still print it.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

- `src/state/` — Zustand stores, graph model/evaluator, node registry, persistence, routing, and hardware state.
- `src/nodes/` — each node's preview (`<category>/evaluate.ts`) beside its firmware (`<category>/codegen.ts`); `graphEvaluator.ts` and `cppGenerator.ts` dispatch to them.
- `src/components/` — React UI with adjacent CSS Modules; preview rendering lives under `components/Preview/`.
- `src/codegen/` — normal sketches, generative-show controllers, SD-show players, diagnostics, and stream receivers.
- `src/utils/` — validation, project/share workflows, recording, layout, and upload helpers.
- `backend/` — local FastAPI service for toolchains, compilation, serial streaming, disk sync, and upload.
- `desktop/` — PyInstaller-based desktop packaging.
- `docs/NAVIGATOR.md` — routing index for detailed architecture, design, release, and reference documents.

Data flows from the React Flow graph through Zustand, graph evaluation, preview/output routing, shared validation, and the selected code-generation/upload path.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: conventions -->
## Code Conventions

- Use strict TypeScript, ES modules, single quotes, two-space indentation, and extensionless relative imports.
- Use PascalCase for React components and exported types; use camelCase for functions, variables, actions, and non-component modules.
- Keep component styling in adjacent `*.module.css` files and shared design tokens in `src/themes/tokens.css`.
- Keep tests beside their domain in `__tests__/` directories with `.test.ts` or `.test.tsx` suffixes.
- Use snake_case and type annotations in Python; keep helper tests under `backend/tests/`.
- Prefer shared pure helpers where preview, validation, recording, routing, and firmware must implement the same rule.

<!-- END AUTO-MANAGED -->

<!-- MANUAL -->
## Subsystem Patterns

Detailed contracts and traps live under `docs/development/patterns/`. Read the matching file before changing that area, record new patterns there, and link rather than `@`-importing it.

- [Graph and nodes](docs/development/patterns/graph-and-nodes.md) — trust/evaluation, timing, inputs, palettes, and splicing.
- [Validation and deploy](docs/development/patterns/validation-and-deploy.md) — deploy gates, health repairs, capacity, ports, and readiness.
- [Hardware and Build Diagram](docs/development/patterns/hardware-and-build-diagram.md) — pins, buses, boards, peripherals, pads, and wires.
- [Player, shows and controls](docs/development/patterns/player-shows-and-controls.md) — playback, controls, output runtime, shows, transitions, and VU levels.
- [Fixed displays](docs/development/patterns/fixed-displays.md) — registration, envelopes, thumbnails, TFT/touch, and golden tests.
- [Custom screens](docs/development/patterns/custom-screens.md) — designs, ports, LVGL/assets, themes, templates, and Enabled.
- [Firmware generation](docs/development/patterns/firmware-generation.md) — C++ generation, escaping/order, FastLED trimming, telemetry, and calibration.
- [Build helper](docs/development/patterns/build-helper.md) — build timing, binary export, mtime writes, and sketch caching.
- [Workspace UI](docs/development/patterns/workspace-ui.md) — tabs, guides, CSS traps, and `ClampedNumberInput`.
- [Testing](docs/development/patterns/testing.md) — cold imports, timeout leakage, and full-run load.

<!-- END MANUAL -->

<!-- AUTO-MANAGED: git-insights -->
## Git Workflow

- Use plain `git`; do not use `cortex git`.
- `main` is the frozen public-beta line. Do not change it unless the user explicitly requests a beta hotfix.
- `Hardware` is the active breaking-development line and is authoritative. Never merge `main` and `Hardware` in either direction.
- Work directly on `Hardware` by default. Use a focused `codex/` branch only when the user explicitly requests one.
- On `main`, use a focused `codex/` branch and draft pull request unless the user explicitly requests a beta hotfix workflow.
- Routine pull, branch, stage, commit, push, and draft-PR operations are pre-approved.
- A session hook fast-forwards the checked-out branch from its upstream at start and on each prompt, and reports instead when tracked files are modified or the branch has diverged; see [git sync](.claude/hooks/git-sync/README.md).
- Do not force-push, rewrite shared history, delete branches, hard-reset, or discard user work without explicit approval.
- AI-assisted commits carry a `Co-Authored-By:` trailer naming the assistant that wrote them; Claude Code signs as `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: best-practices -->
## Best Practices

- Keep this always-loaded file concise; put feature detail in the routed document under `docs/`.
- Do not copy changelog entries, completed implementation phases, dated test counts, or validation narratives into project memory.
- Update the nearest authoritative document and link to it rather than describing the same subsystem in several places.
- Treat `docs/release/beta-support-matrix.md` as the authority for supported versus experimental hardware.

<!-- END AUTO-MANAGED -->

<!-- MANUAL -->
## Project-Specific Invariants

- Saves: on `main`, public-beta node types, property names, port ids, and workspace shapes require compatibility or an explicit migration and release note. On `Hardware`, remove superseded pre-1.0 shapes cleanly unless compatibility is requested; v1.0.0 becomes the baseline after release.
- User copy: call `MatrixOutput` the **LED output** or its concrete form label; keep `MatrixOutput` only as the code identifier.
- New nodes normally need `NODE_LIBRARY`, preview and firmware handlers, help/description, focused tests, README module/count, and `HelpModal/liveExamples.ts`; preserve preview/firmware parity. Input-only/no-output nodes are sinks: verify the derived `HOT_NODE_TYPES` and `TERMINAL_NODE_TYPES` include them or evaluation/codegen prunes them. See [graph and nodes](docs/development/patterns/graph-and-nodes.md).
- Preserve trust through evaluator and recursive group/pattern paths. Validate user text before C++ interpolation; gate mount-time I/O on workspace trust.
- Hardware-wide reads use `rootGraphNodes`/`rootGraphEdges` or their hooks; hardware writes always target the root graph.
- Preview animation is wall-clock driven. Master Speed scales the evaluator's single clock, never the preview; Music Player refuses it because track position is its clock.
- UI invariants: change `StudioNode` handle constants and CSS together. Before an Escape-closing popup acts, check `useUiStore.getState().appDialog` and yield to the shared dialog.
- The hardware workbench scales each part by the cube root of its own size; physical-unit drawing reads that part's `mmScale`. Emitter runs instead scale by the emitter and draw broken to bound length. See [hardware nodes](docs/development/design/hardware-nodes.md).
- New physical-part visuals require verified Blender assets from `C:\Users\User\Desktop\Blender Assets\`; import through `scripts/import-part-assets.py` or `scripts/import-board-assets.py`. Commit only importer-produced renders and `part.json`, never `.blend`, raw PNG, or reference files; `--check` is read-only and unchanged encoded bytes are not rewritten.
- Release promises belong in `docs/release/beta-support-matrix.md`; history belongs in `CHANGELOG.md` or Git. Current code, `src/themes/tokens.css`, `NODE_LIBRARY`, `docs/NAVIGATOR.md` links, and root `todo.md` are authoritative.

<!-- END MANUAL -->
