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

Subsystem contracts, derivation rules and known traps live in `docs/development/patterns/`, not in this file. Read the matching file before changing that area, and record a new pattern there. Link these files; never `@`-import them, which would load them into every session again.

- [Graph and nodes](docs/development/patterns/graph-and-nodes.md) — workspace trust, evaluation and Master Speed, un-normalised numeric inputs, palette producers, splice targets, property inputs.
- [Validation and deploy](docs/development/patterns/validation-and-deploy.md) — the deploy gate, Graph Health repairs, capacity verdicts, port status, readiness rows.
- [Hardware and the Build Diagram](docs/development/patterns/hardware-and-build-diagram.md) — pin assignment and buses, integrated board hardware, the Board node, peripheral modules (mic, audio output, IR, power, light, DMX, Ethernet, data extender), Build Diagram pads and wires.
- [Player, shows and controls](docs/development/patterns/player-shows-and-controls.md) — Music Player, Player Controls, Song Info, pattern selection, LED output runtime, control phases, Pattern Slideshow, transitions, show files, VU levels.
- [Fixed displays](docs/development/patterns/fixed-displays.md) — display registration points, the display envelope, pattern thumbnails and names, colour TFT transports and touch, fixed-layout golden tests.
- [Custom screens](docs/development/patterns/custom-screens.md) — screen designs and widget ports, LVGL generation and baked assets, themes, templates and their control wiring, panel Enabled.
- [Firmware generation](docs/development/patterns/firmware-generation.md) — `.ino` prototype hoisting, template-literal escapes, float literals, declaration order, FastLED trimming, telemetry and touch-calibration sketches.
- [Build helper](docs/development/patterns/build-helper.md) — `backend/app.py` build timing, Export Binary, mtime-preserving writes, the arduino-cli sketch cache.
- [Workspace UI](docs/development/patterns/workspace-ui.md) — workspace tabs, the First project guide, CSS layout traps jsdom cannot catch, `ClampedNumberInput`.

<!-- END MANUAL -->

<!-- AUTO-MANAGED: git-insights -->
## Git Workflow

- Use plain `git`; do not use `cortex git`.
- `main` is the frozen public-beta line. Do not change it unless the user explicitly requests a beta hotfix.
- `Hardware` is the active breaking-development line and is authoritative. Never merge `main` and `Hardware` in either direction.
- Work directly on `Hardware` by default. Use a focused `codex/` branch only when the user explicitly requests one.
- On `main`, use a focused `codex/` branch and draft pull request unless the user explicitly requests a beta hotfix workflow.
- Routine pull, branch, stage, commit, push, and draft-PR operations are pre-approved.
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

- Public beta saves may exist outside the repository. On `main`, node types, property names, port ids, and persisted workspace shapes require compatibility or an explicit migration and release note. `Hardware` may intentionally break them.
- `Hardware` is targeting the breaking LTS v1.0.0 release. Until v1.0.0 ships, backwards compatibility is deliberately not a design constraint: do not preserve legacy graph shapes, compatibility paths, or migrations for pre-1.0 saves unless the user explicitly requests one; prefer removing superseded models cleanly. Treat the v1.0.0 format as the new compatibility baseline after release.
- In user-facing copy, call `MatrixOutput` the **LED output** or use its concrete form label: **LED String**, **LED Matrix**, **LED Ring**, **LED Corkscrew**, or **HUB75 Panel**. `MatrixOutput` remains the code identifier.
- New nodes normally require: a `NODE_LIBRARY` entry, a preview handler and a firmware emitter in their category under `src/nodes/`, help/description entry, and focused tests. Preserve preview/firmware parity. A node with inputs and no outputs is a **sink**, and both terminal registries derive from exactly that — `graphEvaluator.ts` `HOT_NODE_TYPES` and `cppGenerator.ts` `TERMINAL_NODE_TYPES` — so it needs no row in either, but a sink left out of them is pruned from the sketch (with everything feeding it) and evaluated only on ~8 fps publish frames. A new node also has to join `README.md`'s per-category module list and count and `HelpModal/liveExamples.ts`; both are asserted by tests.
- Keep trust propagation intact through every evaluator entry and recursive group/pattern evaluation. Any new path interpolating user text into C++ must validate or resolve it against a known set first. UI that performs I/O on mount must gate itself on workspace trust.
- Hardware-wide reads use `rootGraphNodes`/`rootGraphEdges` or their hooks. Hardware writes must target the root graph even while a pattern group is open.
- The LED preview is wall-clock driven. Do not reintroduce frame-count-dependent animation timing. Master Speed scales that one clock (see [graph and nodes](docs/development/patterns/graph-and-nodes.md#evaluation) for how). It is applied in the evaluator, not at the preview, so the main matrix, per-output previews, recordings and the live stream cannot disagree; a music player refuses it on purpose, because its animation time *is* the track position and scaling that would slide the LEDs off the music.
- `StudioNode` handle positioning depends on its CSS layout; change the component constants and CSS together.
- A popup that closes on Escape must check `useUiStore.getState().appDialog` first and yield to it — the shared alert/confirm/prompt dialog (`uiStore.ts`) can stack on top of any panel, and if the panel also handles Escape, both consume the same keystroke.
- The hardware workbench draws each part at its own compressed scale (cube root of its size), not one shared millimetre factor: a bench spans twenty to one once a panel and a microphone are on it, and no framing survives that. Compression is one factor per part, so no part is distorted and physically larger still draws larger. Anything drawn in physical units on a part reads that part's `mmScale`, never a bench-wide one. A run of emitters is the exception twice over — scaled by its emitter rather than its extent, then drawn broken to bound its length. See [hardware nodes](docs/development/design/hardware-nodes.md).
- New physical-part visuals come from verified Blender assets and dimensions, not hand-drawn placeholders. The local source workspace is `C:\Users\User\Desktop\Blender Assets\`; import with `scripts/import-part-assets.py` or `scripts/import-board-assets.py`. `import-part-assets.py` only rewrites a part's WebP when its encoded bytes actually change, so a listed update means the source PNG changed, not importer noise; `--check` reports without writing. Only the renders and their `part.json` details enter the repo, through the importer; `.blend` files, raw PNGs and reference sources stay in the asset workspace.
- Release promises belong in `docs/release/beta-support-matrix.md`; implementation history belongs in `CHANGELOG.md` or Git, not here.
- Current code, `src/themes/tokens.css`, `NODE_LIBRARY`, and documents linked from `docs/NAVIGATOR.md` are authoritative. Superseded initial briefs were removed; recover historical intent from Git. Root `todo.md` is the single active implementation checklist.

<!-- END MANUAL -->
