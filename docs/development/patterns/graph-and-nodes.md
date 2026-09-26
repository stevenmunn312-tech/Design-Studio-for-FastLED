# Graph and nodes

The graph model, workspace trust, evaluation, and the rules for authoring nodes
and the property inputs that let a wire drive a setting.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## Graph model and trust

- Node behavior is registry-driven through `NODE_LIBRARY`, with corresponding
  evaluator, codegen, description/help, and tests.
- Zustand stores expose React hooks plus imperative `getState()` access for
  animation and hardware paths.
- Stateful evaluation is namespaced by graph/group instance so reused groups do
  not share runtime state.
- Trust follows where content came from, not which file carried it:
  `src/state/patternTrust.ts` remembers, in localStorage, each Formula/Code node
  and Art-Net `DMXInput` by its type and settings (never position or id), and a
  project is untrusted only while it holds one of those this machine has never
  seen. Shipped (`BUNDLED_PATTERNS`) content is known by definition. One
  `useGraphStore.subscribe` in `graphStore.ts` does the rest: while `trusted`,
  it remembers everything in the project as it is made, which is how the user's
  own code becomes known; while untrusted, it restores `trusted` the moment
  nothing unknown remains, which is how a load path's blanket `trusted: false`
  opens ordinary shared content trusted. That split is load-bearing: anything
  bringing unknown content *in* must set `trusted: false` in the same update, or
  the subscription will remember foreign code as the user's own — the pattern
  drops do so through `savedPatternUntrustsWorkspace`, and a paste does so
  through the clipboard's `fromUntrusted` flag. Every Trust button calls
  `trustCurrentProject` (`src/utils/trustPrompt.ts`). A test that needs an
  untrusted project must give it unknown gated content and call
  `clearPatternContentTrustForTests`; `trusted: false` on its own is corrected
  straight back to true.
- Hardware belongs to the root graph and must be queried through root-graph
  selectors, not the currently open pattern group.
- Persisted project and pattern formats are compatibility-sensitive on the
  public-beta line.

## Evaluation

- Master Speed scales the one shared time value `t` that every animated node
  reads, rather than rewriting each node's own rate, so a graph's relative
  speeds hold exactly and a node added later needs no teaching.
  `src/state/masterSpeed.ts` accumulates (`t += dt*speed`), never multiplies
  (`t*speed`) — multiplying would jump every running animation the instant the
  knob moved. `masterSpeedFromOutputs` deliberately reads the speed the
  evaluator resolved on the *previous* pass (one frame of lag) so a speed of
  zero can still be turned back up; computing it from already-scaled time
  couldn't undo itself. The browser preview does the equivalent by sliding the
  wall-clock origin (`masterSpeedOriginShift`), the same mechanism the pause
  feature already uses. `src/codegen/masterSpeedCpp.ts` swaps a normal sketch's
  plain `float t = millis() / 1000.0f` for a static accumulator only when a
  MasterSpeed node is present, and emits the update to `_tSpeed` at the foot of
  the loop — after every node — because a wired speed expression may itself read
  `t`. A Pattern Slideshow keeps its interval/transition state on unscaled
  elapsed time and passes a second accumulated `animNow` only to pattern
  renderers; its fixed controller accepts the node's slider, a supported bounded
  scalar wire, or a Control Map carrying the Master Speed job, with the same
  one-pass delay. Music Player continues to refuse Master Speed because its
  animation clock is track position.
- Most numeric node inputs are **not** normalised: `num()` in
  `graphEvaluator.ts` passes a wired value straight through, so a raw 0–1 signal
  (an audio band, say) wired into `Fire2012.sparking` (0–255),
  `ReactionDiffusion.feed`/`kill` (~0.03–0.065), or `Starfield.count` silently
  kills the effect rather than driving it. Only `speed`/`scale`-class inputs are
  denormalised for you, via `src/state/speedRange.ts` (mirrored by
  `audioFlowRange.ts` for AudioFlow). Authoring a pattern that wires anything
  else needs an explicit Map Range into that node's own domain, and
  `src/state/signalRange.ts` now says so rather than leaving it to be found:
  Graph Health names the wire and the domain to map into. Its two halves are
  deliberately asymmetric — the target's domain is *derived* from
  `inputClampRange`, because every input the evaluator denormalises is a 0-1
  slider by definition, so "the slider is not 0-1" already means "the number is
  handed through untouched" and no second list of denormalised inputs can drift;
  the source's range is a semantic fact with nothing to derive it from, so
  `NORMALIZED_OUTPUTS` lists it, deliberately short and only where the contract
  is unambiguous, since a false warning on a correct wire teaches people to
  ignore the drawer. Graph Health can now fix what it names:
  `GraphDiagnosticAction` carries an `'insert-map-range'` case and
  `GraphDiagnostic` an optional `repair: SignalRangeRepair`, and
  `insertMapRangeOnEdge` in `graphStore.ts` performs it through the same
  `spliceTargetPorts` rule a canvas drag uses — checking the edge still exists
  first, since `insertNodeOnEdge` deliberately drops a node loose on the canvas
  when it doesn't, which is right for a drag-to-splice and wrong for a repair
  acting on a diagnostic that may be stale.

## Node authoring and property inputs

- Two node-authoring facts are derived rather than listed, and were each written
  down twice before. A **palette producer** is a *builder* (emits its own
  `pal_<id>` CRGBPalette16) or a *selector* (resolves to a shared
  `paldef_<name>` preset): `PALETTE_BUILDER_NODE_TYPES` in `nodeLibrary.ts`
  decides which by asking whether the node carries a `palette` property — a
  selector names a preset, a builder makes one from its inputs — and
  `cppGenerator.ts`'s `paletteExpr` and `validateGraph.ts`'s RAM estimate both
  read it, having previously held two hand-written copies that a fifth palette
  node could join only one of. The browser's `Palette = string | RGB[]` union
  (`ledColor.ts`) is resolved from the *value* at evaluation time; firmware has
  no runtime union at all, deciding from the source node at generation time. **Splice
  targets** follow declaration order — `spliceTargetPorts` in `nodeLibrary.ts`,
  used by the canvas — which works because the library declares a node's primary
  input first (Mask `frame` before `mask`, Clamp `value` before `min`);
  `spliceInput` is only for peers, where one of two equals is the layer
  underneath, and Blend is its one use. Reordering a node's inputs for the
  inspector's sake would otherwise move where a drop lands, so
  `nodeAuthoringMetadata.test.ts` asserts the invariant the default rests on.
- A runtime property that can carry a wire is a **property input**, and
  `src/state/propertyInputs.ts` is the one registry: a node declares
  `propertyInputs` (property key -> an input port it *already* declares) and
  `defaultExposedInputs`, while `StudioNodeData.exposedInputs` says which of
  those sockets a particular node draws. The socket is the port the node always
  had, so exposing one changes only whether it is drawn — evaluator, generators
  and validation need no teaching, and a port is declared here only once both
  preview and firmware read the property through it (a matching name alone
  proves nothing). Two rules are load-bearing. An **edge always overrides the
  list**, in `exposedPropertyInputs` — a wired socket stays drawn through a
  save, a reload and a collapse, `setNodeInputExposed` refuses to hide one, and
  an imported list is bounded to declared ports. And the **hidden socket is
  still a drop target**: a noodle dropped on the property row
  (`data-property-input` on the row, read from the DOM by `NodeGraphCanvas`'s
  `onConnectEnd`) exposes it and connects in the same tick, which the history
  burst collapses into one undo step. Three derived readers must follow the same
  rule rather than reading `def.inputs`: `StudioNode`'s port rows, the canvas's
  accessible input *count*, and `scripts/generate-node-card-svgs.ts`, which
  draws the socket on the property row and would otherwise list a property twice
  per card. Declaring one can cost more than a registry row: `FormulaField`'s
  seventeen knobs were *baked as float literals* by `cppGenerator.ts` ("the
  variant isn't wired, so there's nothing to branch on at runtime"), so making
  them property inputs meant hoisting each to a per-frame `float` local fed by
  `floatExpr` — an unwired one still folds to its literal in the local's
  initialiser, and the generation-time `Math.max` clamps moved into emitted
  `fmaxf`. Leaving the bakes in place while declaring the ports would have been
  the exact parity break the registry's own comment forbids: preview follows the
  wire, firmware ignores it. That fix generalizes to a three-part rule for
  making any knob wireable, and doing fewer than all three reintroduces the same
  parity break: declare the `NODE_LIBRARY` input plus its `propertyInputs` row
  (free until something is wired to it); have the evaluator read it
  wire-then-property through `num(id, 'knob', props, 'knob', default)` rather
  than `Number(props.knob ?? default)`; and have the generator stop baking it,
  hoisting it to a per-frame local via `floatExpr`
  (`f('knob', 'knob', default)`) with any TypeScript-side clamp re-emitted as
  `constrain`/`fmaxf` so it still holds on a wired value — an unwired knob folds
  to its own literal in the local's initialiser and costs nothing. Re-emitting
  the generator's clamp is only half of that: check the *evaluator's* clamp
  against the generator's and against the knob's own `PROPERTY_META` range and
  make all three agree, because a slider was supplying the bound for free before
  the port existed, so an evaluator clamp left half-applied — bounded at one
  end, or not at all — costs nothing until a wire supplies a value the slider
  never could; It matters most for a knob already flagged as un-normalised,
  since a wired audio band or LFO lands outside a domain like a 0.25-4 gain by
  construction. Completing the evaluator's clamp to match is a no-op for every
  value a slider could already produce, so it's safe to add without a behavior
  discussion. A per-frame local read by only one emitted branch belongs inside
  that branch, not hoisted above the branching — an unused local is a warning
  per sketch. Check first whether the evaluator's and generator's `case` blocks
  already read the knob through `num`/`floatExpr`: several nodes were written
  wire-aware and were missing only the port, so the codegen half is already done
  and it is a registry row and nothing else. Some knobs can't take this
  treatment at all: one that sizes a static array (the pool spawners' `count`,
  fixed pool capacity like `_rrx_<id>[CAP]`) or that picks which block the
  generator emits at all (Formula Points' `formulaType`/`preset`) has nothing to
  branch on at runtime and must stay a property; Formula Points' own `count`
  looked like this case but wasn't — it was only a loop bound, so it converted.
  When several variants of one node read different subsets of its now-wireable
  knobs, emit each knob's local only where a variant actually reads it, or every
  other variant carries an unused local and a warning apiece. Formula Points
  answers this by hand-listing which variant uses which knob
  (`usesCount`/`usesSpeed`/`usesPersist` booleans read by `formulaType`);
  Particles' size/spread/gravity/bounce conversion found the better shape —
  buffer the variant branch's emitted lines into an array first, then emit a
  knob's local only if that buffered text mentions it — so a variant added later
  joins the rule for free instead of needing a new boolean. Prefer the buffer
  technique for new per-variant knobs. A wire into a property its own node
  currently disables is real but doing nothing, and the canvas says so rather
  than refusing it: `wiredPropertyIsInert` (same module) asks
  `isPropertyEnabled` through the port's property key, and `GlowEdge` draws that
  edge dark with its packets dropped — read from the *target* each render, so
  changing a Formula Field's variant re-lights its knobs' wires with nothing to
  keep in step. Dark rather than hidden because the edge is one dropdown away
  from being live again. A wired property's inline editor is normally read-only,
  since the wire is the value's only source, but a Touch widget is not merely a
  signal — it's a control that also lives in this app — so `StudioNode.tsx`'s
  `disabled` is `(wired && !drivenByTouchWidget)`: a pot or an audio band still
  locks the row, while a wire sourced from a widget's `out` port
  (`parseDisplayWidgetPortId(source.srcPort)?.role === 'out'`) leaves it
  editable and turns it into a remote, writing through
  `touchControlDriver`/`writeTouchControlValue` (`wireFirstControls.ts`) to the
  same runtime value a finger on the glass would set. `connectTouchControl`
  (`graphStore.ts`) seeds the widget from the property's current value the
  moment the wire is made, so wiring a slider doesn't jump the effect to its
  minimum before anyone has touched it. An LED output's pair are `enabled` and —
  deliberately not `brightness` — `outputBrightness`, because controller
  brightness is owned only by the Board on its native 0-255 scale; the field is
  resolved wire-then-field through
  `ledOutputManualRuntime`/`ledOutputManualExprs` so preview, normal sketch and
  show controller agree, emits nothing while still at its identity, and is
  honoured by the SD player too: `playerConfigFromGraph` carries the target
  output's fields as `outputEnabled`/`outputBrightness`, and the player sketch
  applies them to `leds` with the same `ledOutputRuntimeCpp` after drawing and
  before the VU fixtures and HUB75 blit (which reads that array), so controller
  brightness stays the transport's. Only a *wire* into those ports is refused
  there. The same three-part rule extends to a *group* of properties sharing one
  shape rather than a single knob: a colour is r/g/b (or rA/gA/bA, rB/gB/bB), so
  `channelColor(port, dr, dg, db, keys?)` in `cppGenerator.ts` is that group's
  one resolver — the whole-colour port wins when wired, an unwired channel folds
  to its own literal, and a wired channel is clamped and rounded (`+0.5f`) to
  match the evaluator's `byte()`, which also clamps and rounds where a bare cast
  would truncate. Channel ports are declared last in a node's `inputs` array,
  after its whole-colour port, so `spliceTargetPorts`' declaration-order default
  still drops a cable on the node's primary input rather than a channel. Their
  property metadata is likewise *derived*, not listed:
  `DERIVED_COLOR_CHANNEL_META` in `nodeLibrary.ts` gives the
  `{control:'slider',min:0,max:255,step:1}` shape to any node whose
  `defaultProperties` carry a *complete* r/g/b (or rA/gA/bA, rB/gB/bB) triple,
  because the names collide across nodes with a different meaning — `b` is blue
  on a colour node but a superformula operand on Formula Field — so only
  completeness of the triple can tell them apart; `propertyMeta` resolves
  override → derived → global, so a node with its own stated range (Formula
  Field's `b`) still wins over the derived one. A declared colour *input*
  carries the same trap as a knob, and the gradient nodes sat in it for real:
  the evaluator resolving a colour port proves nothing about the generator,
  which baked the field's literal and never looked at the wire, so preview
  followed a Temperature into Color A and firmware stayed on the default. A
  port's existence is not the contract — both sides reading it is;
  `gradientChannel(a, b, channel, t)` mixes two already-resolved `CRGB` locals
  and rounds the same way the evaluator's `Math.round` does, so both ends read
  one wire instead of two independent ones. Tests for this shape derive their
  cases from `NODE_LIBRARY` (which nodes declare a complete channel triple)
  rather than listing node types, and the literal-fallback parity check parses
  `channelColor(...)`/`f(...)` calls out of the generator source, so a helper
  that hides a channel's default from that parse would silently drop it from the
  comparison. See
  [direct controls and LED output status](../design/direct-controls-and-output-status.md).
- A property input's `defaultProperties` entry must hold not just *a* default
  but the exact literal the code already falls back to:
  `src/state/__tests__/propertyInputFallbacks.test.ts` reads
  `graphEvaluator.ts`'s `num(id, 'port', props, 'key', LIT)` and
  `cppGenerator.ts`'s `f('port', 'key', LIT)` calls straight out of their source
  and cross-checks each declared field against both (a plain presence check
  lives separately in `propertyInputs.test.ts`), plus evaluator literal against
  generator literal as a preview/firmware parity check in its own right —
  computed, non-literal fallbacks are skipped rather than compared. The hazard
  is silent and one-directional: a field added only to satisfy the presence
  check, holding a different number than the code's own fallback, changes how
  every existing saved graph using that node renders, with nothing in the diff
  reading as a behaviour change. Both comparisons refuse to pass on an empty
  parse. The same file derives, rather than lists, which nodes must declare
  `propertyInputs.palette = 'paletteIn'`: any `pattern`/`show`/`output`-category
  node with both a `paletteIn` port and a `palette` default, so a node that
  grows the pair later joins the rule for free instead of needing a manual add.
- A property's enabled/disabled state that depends on which *edge* targets its
  node — not just the node's own properties — is gated in the property-row
  renderer itself, beside the existing `wired`/`gated`/`locked` cases in
  `StudioNode.tsx`'s `LivePropertyControls`, never inside `isPropertyEnabled`
  (which receives only the node's own properties and cannot see edges).
  `TransportDisplay`'s `tftLayout` is no longer gated at all: it always offers
  every presentation plus `CUSTOM_DESIGN_LAYOUT` ('Custom design'), and having a
  design (`displayId`) is separate from showing it (`shownDesignId` in
  `transportDisplay.ts`, which every mount/evaluate/generate/validate reader
  asks). A fixed layout sets the design aside with its widget ports and wires
  kept; those wires read at rest. `src/state/__tests__/setAsideDesign.test.ts`
  holds this end to end (preview, normal sketch, show/player firmware, Graph
  Health's "Set Layout to Custom design to use it again" warning, and the
  design's return when Custom design is chosen again). See
  [large displays](../design/large-displays-and-control-routing.md).
