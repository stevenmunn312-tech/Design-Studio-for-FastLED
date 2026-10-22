# Segment networks and millimetre string positions

Design for root todo D-06, pulled into v1 on 2026-10-21 from
[pattern node expansion, Phase 11](../plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons).
Two pieces, in this order: positioned strings measured in millimetres, so the
Build Diagram can draw a string where it hangs; then segment networks, a
string laid along the edges of a graph with a `Ripple` pattern that travels
node to node, the Chromancer model. Written 2026-10-22. Part 1 shipped the
same day; Part 2 is not implemented yet.

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
`networkPreset` is `'hexagon' | 'triangles' | 'custom'` (the hexagon is
Chromancer's lattice, triangles a 4-wide triangular lattice), `network` is the
custom JSON above, `ledsPerEdge` is shared. `ledCount` is derived
(`edges × ledsPerEdge`) and shown, not edited, while the layout is a network.
Positions follow from the model: each edge's LEDs sit at
`from + (i + 0.5) / ledsPerEdge × (to − from)`, and from there the string is a
positioned string. **The network layout is a generator of positions**, so
sampling, the baked table, the LED Output pane, the player's shape map and
the Build Diagram (through Part 1) all reuse the positioned-string path
unchanged. `stringPositions()` learns to build its points from a network, and
nothing downstream learns a new layout.

Limits: 64 nodes, 128 edges, 300 LEDs, the positioned-string ceiling.

### Layout editor

A dialog from the LED Output's property grid, *Edit network*, closed by
Escape through `useEscapeLayer`. A canvas with the nodes as draggable dots and
the edges as lines; click empty space to add a node, drag node to node to add
an edge, click an edge to flip its direction, Delete removes the selection.
The edge list beside it shows the wiring order and lets an edge be moved up or
down. A preset loads into the editor, and the first edit makes it custom. The
editor is the one place the model is edited, so the JSON property never has
to be typed, but it stays a property so a project file carries it and a
share link works.

### The Ripple pattern

`Ripple` (category `pattern`, Shapes & Text) draws ripples that start at a
node and travel along edges, choosing at each node how to continue. Like
String Particles' `track` and `ringLeds`, the pattern repeats the output's
geometry by property rather than reading the output: it holds the same
`networkPreset`, `network` and `ledsPerEdge`, so one Ripple matches one
network, and a mismatch shows in the preview as the LED Output pane draws the
string.

- Inputs: `trigger` (bool, rising edge starts a ripple at `startNode`),
  `speed` (float), `palette`. Properties: `startNode` (index, or `random`),
  `behaviour`, `lifetimeMs` (200–10000), `width` (LEDs, 1–8), `maxRipples`
  (1–16), `decay`.
- Behaviours, Chromancer's set: `weaving` (at each node, continue along the
  edge that turns least; mirrored copies alternate left and right), `explode`
  (one ripple per outgoing edge at every node, each at half brightness),
  `angry` (turn toward the edge that departs furthest from the heading),
  `always-right` and `always-left` (turn the same way at every node, so a
  ripple circles a cell), `random` (a random outgoing edge).
- A ripple is a position along an edge (edge index, offset in LEDs, heading
  as the edge's direction), a colour index, an age and a brightness. Each
  frame it advances `speed × dt` LEDs; when its offset passes the edge's end
  it arrives at a node and the behaviour picks the next edge (never the one
  it came from, unless that is the only edge). The ripple ends when its age
  passes `lifetimeMs` or it reaches a node with no other edge.
- Rendering: the pattern draws on the canvas, splatting each ripple's head
  over `width` LEDs of its edge, mapped back to canvas pixels through the
  same positions the output samples, with a trailing fade over the whole
  canvas (`decay`, the Trails rule). Because the pattern draws at the LED
  positions and the output samples at the same positions, the ripple lands on
  exactly the LEDs it is on, bilinear sampling included.
- Preview and sketch share one integer kernel in `src/nodes/shared/` for the
  node choice and the advance, so the turning rule is one function. The
  random behaviour uses the seeded LCG in the preview and `random16` in the
  sketch, the documented String Particles divergence.

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
   edge order, limits, baked table parity.
3. The layout editor. Tests: add, connect, flip, reorder, Escape.
4. `Ripple`: shared kernel, evaluator, codegen, help entry with a live example,
   README count. Tests: each behaviour's node choice on the hexagon, lifetime,
   parity of the kernel, codegen snapshot.

Each step is shippable on its own. Compile once at step 4, with the rest of
the v1 hardware pass.
