# Node reference layout and upkeep

This document records the Node Reference design and the conventions to use when
maintaining it. The **Music Player** page is the model entry: specific overview
copy, numbered set-up steps, a description for every port and property, and an
example that looks exactly like the canvas.

## Page structure

The help modal keeps a fixed node-library directory on the left and a scrollable manual page on the right. Every node uses the same article.

1. **Node-library directory**
   - Match the real equipment-rack sidebar: bank headers, colour rails, counts, glyphs, node codes, descriptions, and collapsible categories.
   - Keep search at the top. Selecting a node opens its manual page without closing Help.
2. **Article header**
   - Breadcrumb, category/subcategory eyebrow, node name, its one-sentence description, and counts of inputs, optional inputs, outputs and properties.
3. **Node and Overview**
   - Two columns on desktop: the generated node card on the left and the Overview on the right.
   - The overview is written for the node: what it does, when to reach for it, and what to watch out for.
4. **Set up and connect** (optional)
   - Numbered steps for nodes that need hardware, assets or calibration before they do anything.
5. **Inputs and Outputs**, then **Optional inputs**
   - Each port names its data type and says what it means on this node. Optional inputs are the property and action sockets revealed by Expose input…; a property socket the entry does not describe reads "Replaces *Property* while wired".
6. **Properties**
   - Every visible property, grouped as on the live node, with its default and its `propertyDescription`. Internal keys (part ids, generated identifiers) and the LED output's `form` are not listed. Body-edited show settings are listed with the default the body uses when the key is absent: collection weight 1, any section, any energy band, restart, and no sequence.
7. **Example**
   - The heading names the result. The signal path is shown with canvas titles (a Trigger reads as its mode, an LED output as its form) beside **Try it live**.
   - The image is the generated example graph, drawn node for node like the canvas.
   - "How it works" names the nodes and the signal flow.
8. **Main preview** or **Result**
   - The evaluated frame of the example's LED output, with what should move or change. Workflow examples — hardware parts, show assets, anything that needs content before it lights up — show an outcome card with the entry's `outcome` text instead of a misleading black panel.

## Where the content lives

- `src/components/HelpModal/reference/<category>.ts` holds one `NodeReferenceEntry` per node: `overview`, optional `steps`, `inputs`/`outputs` port copy, `propertyNote`, `outcome`, and the `example`.
- `reference/example.ts` builds examples from a compact spec (`nodes` by key, `wires` as `'a.port > b.port'`, an optional LED output form) and checks every wire against the real ports when the module loads. It applies the app's Tidy Graph layout so the image and the inserted patch match.
- `liveExamples.ts` is the narrow reader the article, the node-card generator and the firmware dead-code corpus share.
- `portCopy.ts` holds the per-dataType glyphs and fallback port wording.

## Writing an entry

- Write for the node. Generic category copy ("use it as an animated control source…") is what made the old pages read the same and drift, and the reference no longer has a fallback.
- Every example features its own node and is unique; do not reuse another node's graph. Keep it focused: the node, the fewest helpers that show what it does, and a picture that looks good at rest (the generator renders about four seconds in, with no buttons pressed).
- Vary the LED output form, palettes and helpers across a category so the catalogue does not repeat itself.
- Use `{output}` in the preview text; it becomes LED Matrix, LED String or LED Ring.
- Claims about behaviour must match the evaluator and the generated firmware. Read the node's `evaluate.ts` before describing edge cases.

## Generated visuals

- Generated assets live under `public/node-cards/`: `<slug>.svg` (node card), `graphs/<slug>.svg` (example graph), `previews/<slug>.svg` (evaluated preview). `npm run gen:node-cards` regenerates all of them in seconds; `-- --only <Type>` does one node and skips the gallery.
- `scripts/assets/node-cards.ts` is the generator. It uses the real node data and defaults, a test audio signal, a pinned RTC time (Friday 2 January 2026, 10:04 local) and stable seeds, so regenerating without changes is byte-identical. Code nodes run in a browser worker and render black here; their example is a workflow with an outcome.

## Try it live

`src/utils/insertLiveExample.ts` inserts an example beside the current work without replacing the graph. It reuses singleton nodes, never replaces an occupied input, adds the graph in one undo step, closes Help, reveals the preview, starts the microphone for audio examples, frames the new nodes, and reports the result in the status bar.

## Tests

- `NodeReferenceCoverage.test.ts`: an entry for exactly the library, a real overview for each, port copy only for ports the node has, an outcome for every workflow example, set-up steps for every display, and assets for every node.
- `liveExamples.test.ts`: compatible wiring, no placeholder sockets, valid property keys and option values, the Tidy grid, one LED output per example, unique examples, and the variety thresholds.
- `deadCodeCorpus.test.ts` generates the firmware for every example.
