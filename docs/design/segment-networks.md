# Segment networks and millimetre string positions

Design for root todo D-06, pulled into v1 on 2026-10-21 from
[pattern node expansion, Phase 11](../plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons).
Two pieces, in this order: positioned strings measured in millimetres, so the
Build Diagram can draw a string where it hangs; then segment networks, a
string laid along the edges of a graph with a `Ripple` pattern that travels
node to node, the Chromancer model. Written 2026-10-22; all four steps
shipped by 2026-10-23.

## Where this starts

A string output already has `stripLayout: 'positions'`
([`stringPositions.ts`](../../src/state/output/stringPositions.ts)): one
`(x, y)` per LED in **canvas units** on the string's own canvas, sampled
bilinearly, baked as a PROGMEM table. The LED Output pane and the node preview
draw the string in that shape (`shapeLayoutFor`), but the Build Diagram still
draws a straight broken run, because canvas units say nothing about where the
LEDs are on the bench. The workbench draws every part at its own compressed
scale and reads physical units from that part's `mmScale`
([hardware model](../architecture/hardware-model.md#size-is-compressed-not-shared)).

## Part 1: positions in millimetres

### Rule

A positioned string's points stay in canvas units for sampling, because the
canvas is what the graph renders. What the Build Diagram needs is the string's
**physical extent**: how many millimetres the canvas spans. One property gives
it: `positionsMmPerUnit` (default 10, range 1–200), the length of one canvas
unit on the bench. A 32-unit canvas at 10 mm per unit is a 320 mm span. The
catenary preset, a 60-LED string at 16.7 mm pitch, reads about 1000 mm of
tape sagging across a 320 mm canvas, which is wrong; so the preset also sets
the scale from the tape: `mmPerUnit = ledCount × pitchMm / arcLength(points)`,
where `pitchMm` is the part catalogue's `pitchMm` for the chosen strip, and
the property is ignored while the preset is `catenary` (its help says so). A
custom list keeps the user's number. No second coordinate system is
introduced: there is one list of points and one scale.
`positionsMmPerUnit`, `stringSpanMm` and `closestLedSpacingMm` live beside the
points in `stringPositions.ts`; the manifest carries the points, canvas, scale
and span as facts on the output item.

### Build Diagram

The output card is a schematic, not a scale drawing: a straight string shows a
generic row of pixels in the short card. A positioned string takes the full
card and `OutputGraphic` pictures it (`PositionedString`): the wire as a
polyline through the LED points fitted to the card with the canvas aspect
kept, the LEDs as dots, and the span in millimetres under it, with the same
span in the card's subtitle. The run-break rule does not apply, because a
positioned string is a shape the user chose, not a length of tape bought by
the metre. The hardware workbench (`ledPreviewGeometry.ts`) already draws the
shape and gains nothing new.

### Validation and health

A custom list whose consecutive points are closer than the LED pitch (after
`mmPerUnit`) is a Graph Health warning, not an error
(`<output>-positions-spacing`): LEDs overlapping on the bench is physically
impossible, but the layout still lights. The catenary never warns, since the
tape spaces it. The existing fallback for a short list stays.

## Part 2: segment networks

### Model

A network is a small planar graph: **nodes** with `(x, y)` in canvas units
and **edges** between two nodes, each edge one run of `ledsPerEdge` LEDs
along the straight line between its nodes. The string's LEDs are the edges
concatenated in edge order, each edge in its own direction (`from` to `to`),
so an installer solders the tape edge by edge and the wiring order is the
edge list. This is Chromancer's model: a hexagonal lattice of 23 edges, 14
LEDs each, pixels addressed by edge and offset.

```ts
interface SegmentNetwork {
  nodes: Array<[number, number]>          // canvas units
  edges: Array<[number, number]>          // node indices, from → to
  ledsPerEdge: number                     // 2–100, the same on every edge
}
```

Properties on the string output: `stripLayout` gains `'network'`;
`networkPreset` is `'hexagons' | 'triangles' | 'custom'` (hexagons: four
pointy-top cells in two rows, 16 nodes and 19 edges; triangles: a triangle of
side three subdivided, 10 nodes and 18 edges), `network` is the custom JSON
above, `ledsPerEdge` is shared and clamped so the string never passes 300
LEDs. `ledCount` is derived (`edges × ledsPerEdge`, `stringLedCount`) and
hidden while the layout is a network; `outputLedTotal` and `outputGridDims`
read the derived count. A custom JSON that does not parse falls back to the
hexagons (`source: 'fallback'`) so the string never lights nothing. The
model, presets, parser, canvas fit and LED placement live in
`src/state/output/segmentNetwork.ts`, import-free like `stringPositions.ts`,
which reads it.
Positions follow from the model: each edge's LEDs sit at
`from + (i + 0.5) / ledsPerEdge × (to − from)`, and from there the string is a
positioned string. **The network layout is a generator of positions**, so
sampling, the baked table, the LED Output pane, the player's shape map and
the Build Diagram (through Part 1) all reuse the positioned-string path
unchanged. `stringPositions()` learns to build its points from a network, and
nothing downstream learns a new layout.

Limits: 64 nodes, 128 edges, 300 LEDs, the positioned-string ceiling.

### Layout editor

`SegmentNetworkEditor` (`src/components/Canvas/`), opened by the pencil
button beside the `network` row of an LED Output or a Ripple node, closed by
Escape through `useModalFocus` (which goes through `useEscapeLayer`). A
16 × 10 unit canvas with the nodes as draggable dots and the edges as
numbered lines: click empty space to add a node, click one node and then
another to join them, drag a node to move it, click an edge to flip its
direction, Delete removes the selection. The wiring list beside it moves an
edge up or down and flips it. Hexagons and Triangles load a preset; Apply
writes the custom JSON (`networkToJson`, coordinates to a hundredth) and
selects the custom preset, so the output fits the shape to its own canvas as
it would any custom network. The JSON stays the saved form, so a project
file carries it and a share link works; the editor only spares the typing.

### The Ripple pattern

`Ripple` (category `pattern`, Shapes & Text) draws ripples that start at a
node and travel along edges, choosing at each node how to continue. Like
String Particles' `track` and `ringLeds`, the pattern repeats the output's
geometry by property rather than reading the output: it holds the same
`networkPreset`, `network` and `ledsPerEdge`, so one Ripple matches one
network, and a mismatch shows in the preview as the LED Output pane draws the
string.

- Inputs: `trigger` (bool, a rising edge starts one ripple), `speed`,
  `rate` (ripples started on their own each second), `fade` and `palette`.
  Properties: `networkPreset`, `network`, `ledsPerEdge` (the output's),
  `behaviour`, `startNode` (-1 for a random node), `lifetime` (0.2–10 s),
  `width` (LEDs behind the head, 1–8), `seed`. At most 16 ripples live.
- Behaviours: `straight` (the least turn), `left` and `right` (always that
  way, so a ripple circles a cell), `angry` (the sharpest turn), `explode`
  (one ripple down every edge from the node, sharing the parent's colour and
  age) and `random`. A ripple never takes the edge it arrived on unless it is
  the only one, so a dead end bounces it back.
- A ripple is an edge, a direction along it, an offset in LEDs, a palette
  index and an age. Each frame it advances `speed × dt` LEDs (speed 1 is
  60 LEDs a second); past the edge's end it arrives at a node and the
  behaviour picks the next edge, carrying the leftover distance. It ends when
  its age passes `lifetime`. Each ripple is born one palette step (37/256)
  along from the last.
- Rendering: the node's own frame fades by `fade` each tick, then every head
  is drawn over `width` LEDs behind it at the LED points of its edge,
  brighter at the head and as the ripple is young. The points come from the
  network fitted to the pattern's canvas with the same rule the output uses
  (`fitNetworkToCanvas`), so with the output's canvas at the graph's size the
  ripple lands on exactly the LEDs it is on.
- The turning rule runs once per (edge, end) in `src/nodes/shared/rippleNetwork.ts`
  (`buildRippleTables`): the preview walks those tables, and the sketch bakes
  them as PROGMEM (`nd`, `ed`, `off`, `out`, `pk`) and fits the nodes at
  start-up, so the device makes the same choice at every node and carries no
  trigonometry. Only `random` diverges (the preview's seeded LCG against
  `random16`), the documented String Particles gap. The frame buffer
  persists (`PERSISTENT_FRAME_NODE_TYPES`), so a show keeps it per pattern
  and clears it on a Restart entry.

### Resources

Positions: 4 bytes per LED in PROGMEM, as today. Network tables: nodes
(4 bytes each) and edges (2 bytes each) in PROGMEM, plus a per-node adjacency
list built once at start-up (`2 × edges` bytes). Ripples: 12 bytes each,
`maxRipples` at most 16, so under 200 bytes of state. Per frame: one advance
per live ripple and a canvas fade, cheaper than Particles. The RAM estimate
adds nothing beyond the node's own frame buffer.

## Order

1. `positionsMmPerUnit`, the catenary scale from `pitchMm`, and the Build
   Diagram polyline. Small; closes the "canvas units are not millimetres" note
   in Phase 11. Tests: layout geometry, manifest caption, health warning.
   **Shipped 2026-10-22.**
2. `SegmentNetwork` model, presets, `stripLayout: 'network'` through
   `stringPositions()`, derived `ledCount`. Tests: positions from a network,
   edge order, limits, baked table parity. **Shipped 2026-10-22** (the JSON
   is typed until the editor lands).
3. The layout editor. Tests: add, connect, flip, reorder, Escape.
   **Shipped 2026-10-23.**
4. `Ripple`: shared kernel, evaluator, codegen, help entry with a live example,
   README count. Tests: each behaviour's node choice on the hexagon, lifetime,
   parity of the kernel, codegen snapshot. **Shipped 2026-10-23.**

Each step is shippable on its own. Compile once at step 4, with the rest of
the v1 hardware pass.
