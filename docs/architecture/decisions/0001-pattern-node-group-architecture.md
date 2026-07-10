# 1. Pattern node-group architecture (two-tier dataflow)

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Project owner, Claude

## Context

FastLED Studio lets users wire nodes on a canvas to design an LED effect, see a
live preview, and generate FastLED C++ firmware. As the node set grows we need a
clear answer to two questions that shape everything downstream:

1. **What paradigm is the graph?** Two candidates surfaced while discussing how
   to express even a trivial effect ("make all LEDs blue"):
   - **Dataflow** — nodes produce and consume typed values (`color`, `frame`,
     `float`); the result is described declaratively. This is what the current
     `evaluateGraph` already does.
   - **Imperative** — the graph contains control-flow primitives (a `Loop` node,
     a `leds[i] = color` write node) that mirror the body of a hand-written C++
     sketch.

2. **How do effects scale and compose?** The owner's target workflow, by
   analogy to Blender's geometry/shader nodes: build a pattern from low-level
   building blocks (numbers, math, `beatsin8`, colors, palettes, audio, shapes,
   text) in one workspace with live preview, name it (e.g. "fireworks"), and
   then use that named pattern as a single node in a higher-level **compositing**
   workspace — blending it with other patterns, sequencing timed transitions,
   and driving transitions from hardware inputs.

These are the same class of decision every visual creation tool eventually
makes (Blender node groups, Unreal material functions, Max/MSP subpatchers,
TouchDesigner). Getting the foundation right now avoids an expensive rewrite
later.

## Decision

### 1. The graph is dataflow, not imperative

Nodes produce and consume typed values. Iteration over pixels and array
indexing (`for`, `leds[i]`) are **not** graph primitives — the code generator
emits them. The imperative loop a user might picture lives *inside* a node's
codegen, never on the canvas.

Rationale: dataflow is what the live preview already assumes (pure
value-producing nodes, topologically evaluated once per frame); "all LEDs blue"
is three nodes instead of five; and a graph of hand-wired loops is just C++ with
extra steps, harder to read than the C++ itself.

A `CustomFormula`-style per-pixel `f(x, y, t)` node remains the sanctioned
escape hatch for pixel-level control — not a `Loop` node.

### 2. One engine, two workspaces, via encapsulation

A **pattern group** is a subgraph that outputs a `frame`. Once named, it becomes
a **node** whose output is a frame — indistinguishable from a built-in generator
like `Plasma`. The **compositing workspace is itself a pattern graph**, one
whose generator leaves are user-defined groups wired through blend/transition
nodes.

Consequence: we do **not** build two evaluators or two code generators. We build
*encapsulation* on top of the single dataflow engine that exists today. `frame`
(`RGB[][]`) is already the universal interchange type between the two tiers.

### 3. Patterns are frames, not fields

A pattern outputs a discrete `frame` (`RGB[][]`), not a resolution-independent
field (`color = f(x, y, t)`). LED matrices are low-resolution; field semantics
add a conceptual rewrite for negligible benefit. Reuse the frame engine.

### 4. Compositing is a graph with a sequencer *node*, not a timeline *workspace*

The compositing workspace stays a free-form graph (so patterns can be layered
and blended). Time-based sequencing ("pattern A for 30s, crossfade to B") is
encapsulated in a `Sequencer` node that holds a small timeline of its inputs.
This keeps a single paradigm while still offering a real timeline affordance
where it is needed.

## Consequences

### Positive

- The existing `evaluateGraph` and `generateCpp` are reused as the shared engine
  for both tiers; the architecture is additive, not a rewrite.
- Codegen maps cleanly: a group becomes a C++ function, the composite becomes
  the `loop()` that calls and blends them — the structure the user draws matches
  the structure of good firmware.
- `PatternMaster` (the current 4-slot cycle/beat node) is recognised as a crude
  prototype of the compositing tier and is superseded by it.

### Negative / risks

- **Per-instance node state.** Stateful nodes (`Fire`, `Particles`, `Counter`)
  key their state in module-level `Map`s by node id. Two instances of the same
  group would collide. State must be keyed by **(instance path + node id)**.
- **Dynamic node registry.** `nodeLibrary` is flat and static today; user-defined
  groups must be registered at runtime.
- **Multi-graph store.** `graphStore` holds a single `nodes`/`edges` array; it
  must become a registry of named graphs plus a notion of the active workspace.
- **Group recursion.** A group must not contain itself; the value-level cycle
  guard needs a group-level analog.
- **Codegen layer memory.** Each pattern layer renders to its own `CRGB` buffer
  (`NUM_LEDS × 3` bytes); composite blending and transitions cost buffer memory
  that must stay within the target board's budget.

## Implementation phases

- **Phase 0 — Shapes (no architecture change).** Add `Span`/`Rect` shape nodes
  and an `(x, y)` grid model so sub-regions of the matrix can be addressed and
  painted, proving the "draw in grid space, codegen emits the loop" bargain.
  Ships immediate value in the current single-graph model.
- **Phase 1 — Encapsulation (the backbone).** Multi-graph store; a `Group` node
  that evaluates a referenced subgraph; per-instance state namespacing; a
  group-cycle guard; "Make Group" UI with enter/exit and live preview at both
  tiers.
- **Phase 2 — Group codegen.** _Initial implementation:_ the generator
  **flattens** Group nodes into the root graph (inlining the subgraph with
  prefixed ids, dropping `GroupOutput`, rewiring consumers) and reuses the
  existing single-buffer emit pipeline. This keeps codegen correct and low-risk
  but consistent with the current single-`leds[]` model. The
  function-per-group + per-buffer form (emit `void pattern_<id>(CRGB* out)` and
  blend buffers in `loop()`) is deferred and lands together with real frame
  compositing in Phase 3.
- **Phase 3 — Compositing richness.** _Done:_ the `Sequencer` node (preview +
  codegen) and the **per-layer buffer codegen** — each frame node renders into
  its own `CRGB buf_<id>` and `MatrixOutput` copies the final buffer to `leds`,
  so `LayerBlend`/`BlendFrames`/`Crossfade`/`Wipe`/`Dissolve` emit real
  `nblend`-based compositing and `Sequencer` emits a millis-driven crossfade
  across its input buffers. **Exposed group parameters** also landed: grouping a
  selection turns each boundary input edge into a `GroupInput` node + a port on
  the `Group` node, so external values (math, audio, a hardware knob) drive a
  group through preview and codegen — which is also how hardware-driven
  transitions are built. Phase 3 complete.
- **Phase 4 — Expansion.** _In progress._ A `Mask` node scales a frame
  per-pixel by a mask frame's luminance (any soft frame gives feathered edges).
  A `Text` node renders with a built-in 3×5 bitmap font (`src/state/font.ts`,
  shared by evaluator + codegen) and can scroll; the font is plain data so a
  custom font drops in without other changes — and a `Text` node can now load a
  **custom font** by uploading a `{ w, h, glyphs }` JSON in the Inspector
  (stored per-node, flowing through evaluator and codegen). `Circle` (ring or
  filled disc) and `Line` (Bresenham) join `Span`/`Rect` in the shape family,
  each painting over an optional base frame. Phase 4 complete.

## Open questions

- **Node category model.** _Resolved._ Categories were regrouped by the job the
  user is doing rather than by primary output type: `input` (live device IO),
  `audio` (analysis), `signal` (time-varying control sources), `math`, `color`,
  `pattern` (frame generators), `field` (the scalar-field pipeline), `composite`
  (frame→frame, displayed "Effects"), `show` (the show workflow), `output` — ten
  categories total, each with a hue-swept accent colour (see the `CATEGORIES`
  table and Design Tokens section in `CLAUDE.md`). `category` is still a coarse,
  UI-facing grouping; the real type system remains the per-port `dataType`.
- **Serpentine wiring.** _Resolved._ Buffers stay row-major in grid space; the
  `MatrixOutput` node has a `serpentine` toggle and, when set, codegen emits an
  `XY(x, y)` helper and remaps grid → physical index on the final copy to
  `leds[]`. Progressive layouts keep the fast `memmove`.
- **Custom palettes.** _Resolved._ The `palette` value is `string | RGB[]` — a
  preset name or custom colors. A `CustomPalette` node builds a palette from up
  to four connected color inputs; `samplePalette` interpolates either form, and
  codegen emits a `CRGBPalette16` for custom palettes (presets still map to
  FastLED constants). `PaletteBlend` now interpolates: it samples both palettes
  (each a preset or custom, via its palette input ports) at 16 stops and lerps
  per entry by `amount`, emitting a blended `CRGBPalette16` in codegen.
