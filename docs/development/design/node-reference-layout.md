# Node reference layout and rollout

This document records the approved Node Reference design and the conventions to use when converting the remaining node pages. The **Microphone** page is the reference implementation.

## Page structure

The help modal keeps a fixed node-library directory on the left and a scrollable manual page on the right.

1. **Node-library directory**
   - Match the real equipment-rack sidebar: bank headers, colour rails, counts, glyphs, node codes, descriptions, and collapsible categories.
   - Keep search at the top. Selecting a node opens its manual page without closing Help.
2. **Article header**
   - Breadcrumb, category/data-role eyebrow, node name, one-sentence purpose, and compact input/output/property counts.
3. **Node and Overview**
   - Two columns on desktop: a clean capture of the node on the left and Overview on the right.
   - Both columns use the same border, radius, and panel background.
   - Crop the capture to the node itself; do not include canvas/sidebar clutter or a caption.
4. **Inputs, Properties, Outputs**
   - A three-panel row immediately below the introduction.
   - Inputs and outputs identify port name and data type. Properties are grouped using the same logical groups as the live node.
   - Collapse to a single column on narrow screens.
5. **Example**
   - Heading describes the result (for example, “From sound to pixels”).
   - Show the signal path as compact utility text and place **Try it live** alongside it.
   - Use a clean, tidy graph capture containing every example node. Do not include the app sidebar or the separate LED Preview panel in this image.
   - Follow the image with a short “How it works” explanation that names the actual nodes and signal flow.
6. **Main Preview**
   - Include this section only when the rendered result materially clarifies the node’s use case.
   - Pair the preview with a short description of what should move or change.

## Screenshot rules

- Captures must use the real node UI, not a synthetic recreation.
- Run **Tidy** before capturing an example graph.
- Keep all graph nodes fully visible, including Matrix Output when it is part of the example.
- Prefer a useful, representative frame over an idle/black result.
- Audio examples may use:
  `C:\Users\User\Downloads\Organic Soup - Old Timers - 2017 - MP3 (1)\01 - Organic Soup - Old Timers (2016 Edit).mp3`
- Store assets under `public/node-reference/nodes/<NodeType>/` as `node.png`, `graph.png`, and `preview.png`.
- `src/components/HelpModal/nodeReferenceAssets.generated.ts` is the asset manifest.
- `scripts/generate-node-reference-assets.mjs` is the capture scaffold. It exposes the relevant development stores, builds representative graphs, runs Tidy, and captures the node/graph/preview regions.

## Try it live

`src/utils/insertLiveExample.ts` provides the reusable insertion path. Each page supplies a declarative node/edge recipe.

The action must:

- add the example beside the current work without replacing the graph;
- reuse singleton Microphone and Matrix Output nodes when present;
- never replace an occupied input noodle (show a status message when the final Matrix Output connection is skipped);
- add the graph in one store update and collapse React Flow measurements into one undo step;
- close Help, reveal the preview, enable a useful test signal where appropriate, and frame the example nodes;
- report the result in the status bar.

The Microphone pilot is covered by `src/utils/__tests__/insertLiveExample.test.ts`.

## Approved Microphone example

The approved example is:

`Microphone → FFT Analyzer → Spectrum Bars → Matrix Output`

Microphone feeds live audio to FFT Analyzer. FFT separates bass, mids, and treble; those values drive Spectrum Bars, whose frame is sent to Matrix Output. The Main Preview shows the resulting mirrored rainbow spectrum.

## Rollout status — complete

The rollout is complete across all 144 nodes in the library:

- [x] Every node uses the approved reference-article structure.
- [x] Every node has an example recipe, explanation, and an appropriate preview or workflow outcome.
- [x] Every node has a **Try it live** action backed by valid, compatible wiring.
- [x] Generated node cards, example-graph illustrations, and evaluated preview images exist for the full library under `public/node-cards/`.
- [x] Coverage tests verify every library node's live example, wiring, layout grid, and workflow outcome.

When a node is added or changed, update its reference content and live example,
regenerate the node-card assets with `npm run gen:node-cards`, then run the
focused Help tests plus the normal test, lint, and build checks.
