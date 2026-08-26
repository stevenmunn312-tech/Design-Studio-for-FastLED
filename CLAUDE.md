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

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

- Node behavior is registry-driven through `NODE_LIBRARY`, with corresponding evaluator, codegen, description/help, and tests.
- Zustand stores expose React hooks plus imperative `getState()` access for animation and hardware paths.
- Stateful evaluation is namespaced by graph/group instance so reused groups do not share runtime state.
- Imported workspaces and patterns cross explicit trust boundaries before preview execution or external I/O.
- Hardware belongs to the root graph and must be queried through root-graph selectors, not the currently open pattern group.
- Persisted project and pattern formats are compatibility-sensitive on the public-beta line.
- Pin collision checking is bus-aware, not a flat duplicate-claim check: `src/state/busTopology.ts` declares each pin's kind and role and derives the bus *instance* from the pins themselves, and both `validateGraph.ts` and the Graph Health drawer call its one `findPinCollisions`.
- The player is modelled as the appliance it is: `PatternMaster` (**Music Player**) holds the music and reports what it is playing, `PlayerControls` controls it. A node doing both was tried and removed — see [auxiliary displays](docs/development/design/auxiliary-displays.md). Button debounce and rising-edge rules live once in `src/state/transportBridge.ts` so a press means one thing to the evaluator and to the player sketch.
- `src/state/songInfo.ts`'s `SONG_INFO_PORTS` is the one list behind the Music Player's track-report outputs (title/artist/album/.../bitrate): `nodeLibrary.ts` spreads it into the node's outputs, `songInfoOutputs()`/`graphEvaluator.ts` fill them, so a port can't exist with nothing behind it. Fields only an on-device player can read (ID3 tags, bitrate) stay blank rather than guessed from a filename — not a preview/firmware parity violation, since the value only exists where the music does, unlike a value computed two ways that could disagree.
- Which pattern is playing is defined once in `src/state/patternSelection.ts`: **active** (running) versus **highlight** (being looked at), wrapping at both ends, confirm-commits, and a cursor carrying both id and index so a reorder keeps playing the same pattern and a deletion hands its slot to the new occupant. `evalPatternShow` reads it; do not reintroduce a bare `% count` or key show state on the pattern count. `src/codegen/patternSelectionCpp.ts` emits the firmware half (`PATTERN_SELECTION_CPP`), reading `SEL_BROWSE_MS`/`SEL_COUNTS_PER_STEP`/`SEL_RESEAT_COUNTS` from the same shared constants rather than restating them, so a browse timeout or detent size cannot drift between preview and panel. Collection reconciliation (the id/index cursor keeping a show on the same pattern across a reorder) stays deliberately absent on-device: a device's collection is fixed at compile time, so there is no "underneath you" for it to change — see [generative pattern show](docs/development/design/generative-pattern-show.md#which-pattern-is-playing).
- **Displays: registration points.** A new auxiliary display touches more registries than a normal node, and missing one fails quietly. Hand-written, so register it in each: `hardware.ts` (both ownership sets), `partOptions.ts` (the exact module), `nodeLibrary.ts` `GPIO_PIN_PROPERTIES`, `busTopology.ts` `BUS_ASSIGNMENTS`, `hardwareManifest.ts` `collectPinUses`, `pinRetarget.ts` `PART_PIN_PLANS`, `HardwarePane.tsx` `FIXTURE_PARTS`, `playerDisplays.ts` (`playerDisplaysFromGraph`'s per-type branch, for the SD-player sketch). Missing `PART_PIN_PLANS` costs twice: the part keeps the pins of the board being left, and it never enters `claimed`, so parts that do retarget are handed its pins on top of it. `src/state/__tests__/hardwareRegistries.test.ts` holds these in step so an omission fails there rather than on a bench. Everything else is derived and needs no row — the Build Diagram's part list and render table, `cppGenerator.ts` `DISPLAY_TERMINAL_NODE_TYPES`, and `graphEvaluator.ts` `HOT_NODE_TYPES`, the last two from one rule (workbench-owned, carries signal, no outputs) so a display becomes a codegen *and* an evaluation terminal at once. Prefer deriving a registry over adding a row to it; each of those was forgotten at least once first. Controller quirks (an SH1106's column offset, a module's digit count) belong on a controller descriptor, and layout geometry, glyph tables and pad positions come from the shared modules and the part catalogue rather than being restated. A bus role cannot always be read from the property name — the same pin is exclusive on one controller and a shared bus line on another — so `collectPinUses` attaches the resolved `bus` to the pin use and `findPinCollisions` prefers it. See [auxiliary displays](docs/development/design/auxiliary-displays.md).
- Pattern thumbnails are baked in the browser at export, never rendered on-device: `src/state/patternThumbnail.ts` owns what a thumbnail *is* (32x32 = exactly four OLED pages, page-major bit-0-at-top matching `OledSurface`, Rec. 709 luminance, ordered 4x4 Bayer dither, and the `MAX_THUMBNAILS`/`thumbnailBudgetIssue` flash budget), and `src/utils/bakePatternThumbnails.ts` owns rendering a pattern group through `evaluateGraph` at the fixed `THUMBNAIL_TICK_SEC` and 2x supersample to get it. The firmware only blits finished bytes, so there is deliberately no second dithering implementation to keep in parity — the inverse of the usual shared-pure-helper rule, and worth stating so one doesn't get "helpfully" added in C++. Ordered rather than error-diffused dither is what makes a bake reproducible. Trust is threaded through the bake same as evaluation elsewhere: `evaluateGraph` defaults to trusted, and a bake evaluates whatever a collected pattern contains. `src/codegen/patternThumbnailCpp.ts` emits the PROGMEM table once per collection, not per sketch, with an identifier-stemmed name (`THUMB_COUNT_<stem>` etc.) — two Pattern Browsers can be showing different collections, and one shared table would quietly make the second browser draw the first one's pictures. The per-graph bake stays out of `generateCpp` itself for the same reason: `generateCpp` is a text emitter with no way to know whether the workspace is trusted, so `src/utils/browserThumbnails.ts` finds every Pattern Browser, bakes its collection, and hands the finished bytes in through `generateCpp`'s `opts.thumbnails`. Both upload callers do this bake — `MatrixOutputDeployPopup.tsx` and `CapacityWatcher.tsx` — each threading `useGraphStore.getState().trusted`; `CapacityWatcher` needs it too because thumbnails are flash and that component is what measures flash. A Pattern Browser wired to nothing, or over its flash budget, emits an empty table and "NO PATTERNS" rather than a blank square. There is no browser preview of the OLED surface itself — Info Display layouts are verified on hardware, not in the live preview.
- The Arduino `.ino` preprocessor hoists a function prototype for every function to a point *above* all user type definitions, so a generated function that takes a display helper struct by reference fails to compile on a line no generator wrote. `src/codegen/infoDisplayCpp.ts` (`struct OledPanel`) and `src/codegen/segmentDisplayCpp.ts` (`struct SegDisplay`) each export a `*_CPP_FORWARD` constant that `cppGenerator.ts` and `playerSketchGenerator.ts` both emit into the sketch preamble ahead of the hoisted prototypes; `src/codegen/__tests__/displayForwardDeclarations.test.ts` guards it. The same trap was already solved once for FastLED's `CRGB`. Because this generated C++ lives inside TypeScript template literals, backticks in generated-code comments must be avoided — they terminate the template.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Workflow

- Use plain `git`; do not use `cortex git`.
- `main` is the frozen public-beta line. Do not change it unless the user explicitly requests a beta hotfix.
- `Hardware` is the active breaking-development line and is authoritative. Never merge `main` and `Hardware` in either direction.
- Work directly on `Hardware` by default. Use a focused `codex/` branch only when the user explicitly requests one.
- On `main`, use a focused `codex/` branch and draft pull request unless the user explicitly requests a beta hotfix workflow.
- Routine pull, branch, stage, commit, push, and draft-PR operations are pre-approved.
- Do not force-push, rewrite shared history, delete branches, hard-reset, or discard user work without explicit approval.
- AI-assisted commits use `Co-Authored-By: Codex <noreply@anthropic.com>`.

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
- `Hardware` is targeting the breaking LTS v1.0.0 release. Until v1.0.0 ships, do not preserve legacy graph shapes, compatibility paths, or migrations for pre-1.0 saves unless the user explicitly requests one; prefer removing superseded models cleanly. Treat the v1.0.0 format as the new compatibility baseline after release.
- Do not use browser-preview tools to verify UI changes unless the user explicitly asks. Describe the change and let the user check it through their normal `npm run dev` workflow.
- In user-facing copy, call `MatrixOutput` the **LED output** or use its concrete form label: **LED String**, **LED Matrix**, **LED Ring**, **LED Corkscrew**, or **HUB75 Panel**. `MatrixOutput` remains the code identifier.
- New nodes normally require: a `NODE_LIBRARY` entry, evaluator case, codegen case, help/description entry, and focused tests. Preserve preview/firmware parity.
- Keep trust propagation intact through every evaluator entry and recursive group/pattern evaluation. Any new path interpolating user text into C++ must validate or resolve it against a known set first. UI that performs I/O on mount must gate itself on workspace trust.
- Hardware-wide reads use `rootGraphNodes`/`rootGraphEdges` or their hooks. Hardware writes must target the root graph even while a pattern group is open.
- The LED preview is wall-clock driven. Do not reintroduce frame-count-dependent animation timing.
- `StudioNode` handle positioning depends on its CSS layout; change the component constants and CSS together.
- New physical-part visuals come from verified Blender assets and dimensions, not hand-drawn placeholders. The local source workspace is `C:\Users\User\Desktop\Blender Assets\`; import with `scripts/import-part-assets.py` or `scripts/import-board-assets.py`.
- Release promises belong in `docs/release/beta-support-matrix.md`; implementation history belongs in `CHANGELOG.md` or Git, not here.
- Historical material under `.docs/` is non-normative. Current code, `src/themes/tokens.css`, `NODE_LIBRARY`, and documents linked from `docs/NAVIGATOR.md` are authoritative.

<!-- END MANUAL -->
