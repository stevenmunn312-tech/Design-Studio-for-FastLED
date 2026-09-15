# Direct controls and LED output status

Status: in progress — step 1 inventory and contract are documented;
steps 2, 3, the Touch-output core of step 4, Match target range and the
destination-action slice of step 5 are landed; fallback-backed
`propertyInputs` declarations are landed from the catalogue; the
direct-plus-bundle action collision gate is landed; explicit toggle initial
state, repeat-step settings and Map Range repair are landed.
2026-09-14. Target: Hardware, ahead of v1.0.0. Behaviour below is a mix of
implemented and specified; the checklist at the foot says which is which.

## Brief explanation

The graph should show which control changes which value. Every interactive
control on a display makes a named, typed output available on its associated
Touch node. Wire that output directly to the property or action it controls.
A slider named Speed therefore exposes **Speed**; a toggle named Lights exposes
**Lights**. Text, pictures and other read-only widgets produce no Touch output.

Right-click a runtime-controllable property and choose **Expose input**. Its
socket appears beside the property and accepts a compatible source from any
node, including physical controls, touchscreen widgets, sensors and generated
signals. Existing inputs are reused. Unused properties remain ordinary fields,
keeping node cards compact. A connected field displays its live value and source;
disconnecting restores the saved manual value.

Review existing nodes so their main data connections stay visible, while optional
property and action inputs appear on demand. Each eligible node also offers a
visible **Expose input…** affordance. Connected sockets remain visible, including
after loading a saved graph.

Templates and fixed display layouts can connect their controls automatically
when the destination is known. These become ordinary editable graph wires.
Port colours continue to identify data types; compatibility is highlighted while
dragging, rather than changing a target's colour to match an attached control.

An LED output also gains a **Display** output, so a simple Juggle graph can drive
a status screen without a music player or slideshow. It reports the output's
name, enabled/blackout state, brightness, LED count and layout. The panel uses an
LED Status layout, or binds those readings into its own screen design.

```text
Juggle: Frame ----------------------> LED String: Frame
Touch: Speed -----------------------> Juggle: Speed
Touch: Brightness ------------------> LED String: Brightness
LED String: Display ---------------> Display Panel: Display
Physical Button: Pressed ----------> Display Panel: Enabled
```

The physical button in this example enables the panel **while held**. A toggle
widget, or a button through an explicit toggle conversion, provides persistent
on/off behaviour. Play/Pause and Next are actions, not ordinary stored values.

## Behaviour to preserve

- The display owns its screen design and physical configuration. Its paired
  Touch node owns the graph outputs for user interaction; it names the panel
  it belongs to. There is no additional screen-document node or mounting wire.
- Widget names are labels, not connection identities. Renaming or rearranging
  a widget must preserve its wires. Removing a wired widget must explain which
  connections will be removed and remain undoable.
- All interactive outputs are available when expanded. A compact Touch node
  shows connected outputs and an obvious way to reveal the rest. Collapsing
  nodes never deletes or changes connections.
- Keep main data ports visible by default: for example, Blend's two frame inputs
  and frame output. Optional parameters such as Juggle's Speed and Palette can
  start hidden. Apply this review to the entire existing node catalogue, without
  removing port identities or hiding connections that a saved graph already uses.
- Auto-wire a template or fixed layout on initial creation when its source and
  control roles identify one valid destination. Player transport controls can
  target the connected player; LED Status controls can target the connected
  fixture. An arbitrary Speed slider cannot guess which Juggle node to control.
  Leave unknown or ambiguous destinations unconnected and explain what is missing.
- Automatic connections use ordinary edges and appear immediately on the graph;
  create the required destination sockets in the same undoable operation. Never
  overwrite an occupied input or silently replace or redirect user wiring when a
  template, layout or display source changes. Offer **Connect template controls**
  to fill missing connections explicitly later, without duplicates or overrides.
- Derive automatic assignments from stable control roles and actual graph
  relationships, not widget labels or whichever compatible node is nearest.
  Reuse normal type, range, ownership and action-collision validation.
- A port's base colour comes from its actual data type, before and after a
  connection. A numeric slider and numeric target use the numeric colour; a
  shared colour does not promise matching units or ranges. When dragging,
  highlight compatible targets, dim incompatible ones and identify required
  conversions such as Map Range or Toggle. Use labels as well as colour.
- Update a configurable control's colour only when its actual type changes;
  validate any existing wires as part of that change. A temporary selection
  highlight may accent both endpoints without changing their type colours.
- A wired property has one value source. Combining sources requires an explicit
  mix, select or logic operation. One source may intentionally feed several
  destinations. Numeric domains, units, rounding and conversions are visible;
  use Map Range where needed rather than silently changing existing semantics.
- A newly created, unconfigured direct UI control may adopt the destination
  property's domain when it is first connected: label, numeric range, step,
  integer rounding and units should match the property it now controls. This is
  allowed only when the control has no existing semantic range and is not already
  driving another destination. Existing configured controls should offer an
  explicit **Match target range** repair instead of changing silently. Sensors,
  audio features, pots, random/generated values and shared sources keep their
  own source contract; use Map Range per edge when those domains need adapting.
- Control Map becomes optional: useful for conversion, action handling or a
  named bundle such as Playback controls. A direct value connection needs no
  pass-through mapper. Ordinary action inputs must also work without a bundle.
- Playback and show actions belong to the player/generator. Fixture brightness
  and blackout belong to the LED output. If show-wide brightness is offered,
  label it **Show brightness** and define its composition with fixture brightness
  once, so a single command is not applied twice.
- Almost every meaningful runtime field is the goal. Pin assignments, hardware
  models, memory allocation and other rebuild-only configuration are excluded.
  Unsupported runtime targets must be explained, not exposed as inert sockets.
- A disabled panel follows the existing dark/no-touch/output-at-rest contract.
  Turning it off through its own touchscreen therefore requires an independent
  way to enable it again; do not implicitly wake it or turn a toggle into a
  momentary control. Make this consequence visible for that connection.
- The same graph must behave consistently in preview and generated firmware.
  Hardware parts remain root-owned, and existing shared-clock behaviour stays
  authoritative.

## Ordered implementation checklist

Complete these steps in order. Root [todo](../../../todo.md) links here; keep
the detailed completion state in this checklist rather than duplicating it.
Each step includes its own focused checks before the next depends on it.

### 1. Define the shared control contract

Partly settled ahead of the inventory, by the nodes steps 2 and 3 proved
against: a property input's identity is the port the node already declares
(`propertyInputs` in `NodeDefinition`), its default exposure is
`defaultExposedInputs`, a node's own list lives on `StudioNodeData.exposedInputs`
and is bounded to declared ports on load, and an edge always overrides that list
so a wired socket cannot be hidden. The catalogue-wide sweep is complete;
fallback-backed pattern/composite/show/display declarations are landed, and
what remains is the smaller set of live external inputs that need explicit
manual fallback semantics before they can hide behind `propertyInputs`.

- [x] Inventory properties and actions by node type: existing input, exposable
  runtime value, action, or rebuild-only setting. Record runtime support for
  normal sketches, slideshow shows and SD/performance players, including
  parameters inside reusable groups and patterns whose values are baked.
  → [Property input catalogue](property-input-catalogue.md).
- [x] Audit every existing node's inputs and classify default-visible main data
  ports versus optional property/action ports. Record default exposure in shared
  metadata; preserve existing port IDs and always reveal connected sockets.
  → Resolved: math/signal/color/field/audio nodes keep all inputs visible;
  pattern/composite/show nodes with mixed inputs get `propertyInputs` for
  optional tuning parameters.
- [x] Define shared metadata for type, range/units, defaults, enum choices,
  integer rounding, action semantics and supported execution paths. Preserve
  existing port identities and numeric-domain behaviour where inputs exist.
  → Documented below in [Shared metadata](#shared-metadata).
- [x] Define stable exposed-property and widget-role identities, persistence,
  one-source rules and atomic undo/redo operations. Hardware is a breaking
  development line: remove superseded models cleanly without pre-1.0 migrations.
  → Documented below in [Identities and persistence](#identities-and-persistence).

### Shared metadata

Every existing authority is preserved; this section collects them in one place.

#### Type, range, units, defaults, enum choices

`PROPERTY_META` in `src/state/nodeLibrary.ts` (line 3664) defines the editor
control for every property name: `slider` with `min`/`max`/`step`, or `select`
with `options`. `PROPERTY_META_OVERRIDES` (line 3841) supplies per-node
overrides where the same property name means different things on different
nodes. `inputClampRange` (line 4948) derives a property's numeric domain from
its slider, used by the evaluator's `clampInputs` toggle and by
`signalRange.ts` for Map Range hints. `defaultProperties` on each
`NodeDefinition` supplies the fallback value.

#### Speed/scale denormalization

`src/state/speedRange.ts` maps the 0–1 slider onto each node's internal
animation rate. `SPEED_MAX` and `SCALE_MAX` tables are the single source for
both the evaluator (`denormRate`) and codegen (`rateCpp`). Bundled nodes
(`Noise`, `FormulaPoints`, `FormulaField`) key their maps by variant.

#### Integer rounding

`Juggle`'s `count` is bounded then rounded once in `src/state/juggle.ts`,
so 3.6 means the same number of dots in preview and firmware. Other nodes
with integer-domain inputs (e.g. `Particles.count`, `Starfield.count`,
`Array.count`) use `Math.round` or `floor(v + 0.5)` in the evaluator and
`roundf` / `(int)(v + 0.5f)` in codegen. The `count` property slider has
`step: 1` which rounds the manual value; a wired float is rounded at the
consumption site.

#### Action semantics

| Action | Kind | Type | Behaviour |
|--------|------|------|-----------|
| `ledToggle` | momentary | bool | Edge-triggered (press only). Debounced in `transportBridge.ts`. Toggles the per-output blackout latch. Held button does not repeat. |
| `brightnessUp` | momentary | bool | Edge-triggered. Increments brightness by a fixed step. Held repeats at a configurable rate. |
| `brightnessDown` | momentary | bool | Edge-triggered. Decrements brightness. Same repeat rules as Up. |
| `playPause` | momentary | bool | Edge-triggered. Toggles player transport. Debounced. |
| `next` / `previous` | momentary | bool | Edge-triggered. Advances/skips track. Debounced. |
| `volume` | continuous | float | Level (0–1). Holds its position. |
| `volumeUp` / `volumeDown` | momentary | bool | Edge-triggered with repeat. |
| `patternSelect` | continuous | float | Encoder position (whole detents). Converted from raw count at read site. |
| `patternPrevious` / `patternNext` | momentary | bool | Edge-triggered. One step per press. |
| `patternConfirm` | momentary | bool | Edge-triggered. Commits highlighted pattern. |
| `masterSpeed` | continuous | float | Level (0–1). Accumulates, never multiplies. |

Debounce and repeat parameters live in `src/state/transportBridge.ts`.
Edge detection is shared between the evaluator's `PlayerControls` bundle
and the firmware's `CtlEdge`/`CtlDetent` structs.

#### Supported execution paths

| Destination | Normal sketch | Slideshow show | SD/Performance player |
|-------------|:---:|:---:|:---:|
| LED output `enabled`/`brightness` | ✓ | ✓ | ✗ (owned by transport) |
| LED output `ledToggle`/`brightnessUp`/`brightnessDown` | ✓ | ✓ | ✗ (use Control Map) |
| LED output `controls` bundle | ✓ | ✓ | ✓ |
| Display panel `enabled` | ✓ | ✓ | ✓ |
| Juggle `speed`/`count`/`fade`/`palette` | ✓ | ✓ | ✓ |
| Pattern player transport actions (Play/Pause etc.) | N/A | N/A | ✓ (direct or via Control Map) |
| Pattern slideshow actions (Next Pattern etc.) | N/A | ✓ (direct or via Control Map) | N/A |
| Pattern slideshow `interval` | ✓ | ✓ | N/A |
| Master Speed | ✓ | ✗ | ✗ |

The SD player refuses direct LED output property/action wires by name —
its transport owns brightness. Normal sketches and slideshow shows accept
them. Control Map bundles work everywhere their destination exists.

### Identities and persistence

#### Exposed-property identity

A property input is identified by `{nodeType}.{propertyKey}` mapping to
`{portId}`. The port is one the node already declares in `def.inputs`.
The registry is `src/state/propertyInputs.ts`. Exposing a socket changes
only whether it is drawn — the evaluator, generators and validation
already read the property through it.

#### Widget-role identity

A display widget output is identified by `widget:<widgetId>:<role>` where
`role` is `value` (slider/dial), `pressed` (button), or `active` (toggle).
Parsed through `parseDisplayWidgetPortId`. Labels and positions never
identify wires — renaming a widget preserves its connections.

#### Persistence

`StudioNodeData.exposedInputs` stores the visible subset per node instance.
On load, `normalizeExposedInputs` bounds it to declared ports. An edge
always overrides the list — `exposedNodeInputs` adds any wired port,
and `setNodeInputExposed` refuses to hide one. `defaultExposedInputs`
on `NodeDefinition` supplies the initial set before the user chooses.

#### One-source rules

`completeConnection` replaces the first source on a socket. A second
source cannot be added — the drop is refused by name. Combining sources
requires an explicit mix, select or logic node. One source may feed
several destinations.

#### Atomic undo/redo

Exposing and connecting in one operation (dragging onto a property row)
lands both edits in one tick. The history burst collapses them into one
undo step. The same applies to template auto-wiring: create edges and
expose inputs together, undoable as one operation.

### 2. Implement property inputs end to end

- [x] Add one shared resolver for manual versus wired property values; reuse
  existing inputs and retain the manual value as the disconnected fallback.
  Implement evaluation, firmware emission and validation before offering a field.
  `src/state/propertyInputs.ts` is the registry — a node declares
  `propertyInputs` (property key -> an input port it already has) and nothing is
  declared until both the evaluator and every generator read the property
  through that port. The LED output's own pair resolves through
  `ledOutputManualRuntime`/`ledOutputManualExprs`, so preview, normal sketch and
  show controller take wire-then-field in one order.
- [x] Prove the first cases: Juggle Speed, Count and Fade; LED output Brightness;
  and display Enabled. Include correct ranges, integer handling, incompatible
  sources and two attempted sources for one target. Juggle's dot count is bounded
  then rounded once, in `src/state/juggle.ts`, so 3.6 means the same number of
  dots on both sides; a second source on one socket replaces the first
  (`completeConnection`), and an incompatible drop is refused by name.
- [x] Persist exposed inputs through save/load, copy/paste, group instances and
  undo/redo. Reject missing targets and unsupported generator paths with named
  repairs through the shared Graph Health/deploy validation route. An imported
  `exposedInputs` list is bounded to the node's declared ports, and an SD player
  build — which owns brightness through its transport — refuses a dialled-down
  LED output by name rather than coming up full on the bench.

### 3. Add the property connection workflow

- [x] Add **Expose input** to the property context menu and an accessible
  keyboard/menu equivalent, plus a visible **Expose input…** affordance on each
  eligible node. Show an existing socket rather than duplicating it. The socket
  is the port the node already declares, so exposing one changes only whether it
  is drawn — the evaluator, the generators and validation needed no teaching.
- [x] Support dragging a compatible connection onto a property to expose and
  connect it in one undoable operation. Keep property/socket positioning aligned.
  The row itself is the drop target (`data-property-input`), since a hidden
  socket gives React Flow nothing to end the connection on; both edits land in
  one tick, which the history burst collapses into one undo step.
- [x] Show live value, controlling source and a trace/disconnect action. Allow
  unused sockets to be hidden; a wired socket must remain visible, and
  hiding must never silently disconnect it. Explain excluded fields and ranges.
  A wired row names the driving *node*, and its menu offers showing what drives
  it and pulling that one wire; there is no Hide while a wire is attached.
- [x] Apply the main-versus-optional visibility rules to the initial nodes.
  Compact Juggle keeps its Frame output while its value controls start hidden;
  Blend keeps A/B and Frame visible while Opacity is an optional property input.
  `StudioNode.test.tsx` covers exposing and wired persistence for these sockets,
  and `propertyInputs.test.ts` covers the shared registry/defaults.
- [x] Keep base port colours sourced from the shared data-type palette. Add
  drag-time compatible/incompatible highlights and conversion hints, including
  same-type range mismatches. During an output drag, target handles and hidden
  property rows are marked compatible, blocked or adapter-needed without
  changing their type colour; titles and aria labels carry the same message,
  including Map Range hints for 0-1 sources feeding wider ranges. Covered by
  `StudioNode.test.tsx`; `npm run build` also passed.

### 4. Derive named Touch outputs from the panel

- [x] Move custom screen widget output sockets from the Display Panel to the
  paired Touch node. Widget input sockets remain on the panel, because the
  panel draws graph values into widgets; Button/Toggle/Slider/Dial outputs now
  leave through Touch in preview, normal sketches, show controllers and SD
  players. Deleting a wired widget and display-document undo/redo track both
  the panel input cables and Touch output cables.
- [x] Derive outputs from the associated panel's actual interactive widgets:
  button = held boolean, toggle = stored boolean, slider/dial = numeric value.
  Reuse widget registry roles and stable IDs; give fixed-layout controls stable
  semantic IDs. Read-only layouts expose no fictitious controls. When a new
  slider or dial is created by wiring it to a property, initialise its range,
  step and unit metadata from that property.
- [x] Add the explicit **Match target range** repair for an existing configured
  slider/dial that is connected to exactly one destination.
- [x] Move interaction routing to those Touch outputs, with one state owner per
  widget and no duplicated output on the panel. Preserve panel pairing,
  calibration, rotation, capture/release, disable/re-enable and deletion rules.
- [x] Implement matching preview and firmware sampling. Verify a screen slider
  drives Juggle directly and a physical button drives the panel's Enabled input.
  Verify widget rename/reorder, duplicate labels, removal and layout replacement.

### 5. Make actions and optional mapping explicit

Partly landed for LED outputs: `MatrixOutput` now declares on-demand
`ledToggle`, `brightnessUp` and `brightnessDown` action inputs beside its
continuous Enabled/Brightness property inputs and Controls bundle. The exposure
registry distinguishes property inputs from action inputs while keeping the
same "wired sockets remain visible" rule. Preview, normal sketches and show
controllers fold those direct actions through the same `PlayerControlsValue`
and LED-output latch as Control Map; SD-player builds refuse them and point the
user back to Control Map. Held physical buttons are edged/debounced before they
toggle blackout; already-pulsed fixed-touch action outputs pass through without
being swallowed. Validation now rejects the one doubled route that would apply
a single press twice: the same source output wired to the same destination
action both directly and through an upstream Control Map bundle. Separate
controls invoking the same action remain valid.

- [x] Expose named destination actions on demand, including Play/Pause, Next and
  Toggle blackout. Share press-edge, debounce and repeat rules so holding a
  button never repeatedly toggles a destination unintentionally.
  → `PatternMaster`, `PerformanceGenerator`, `PatternSlideshow` and
  `MatrixOutput` now declare their supported momentary `PlayerControls`
  actions as on-demand action inputs. Preview folds direct wires into the same
  bundle semantics as Control Map; the show and SD-player template routers emit
  direct destination bundles before applying transport, pattern and LED-output
  latches. Focused coverage: `propertyInputs.test.ts`, `graphEvaluator.test.ts`,
  `customDisplayPlayer.test.ts`, `transportDisplayShow.test.ts`.
- [x] Reject a direct-plus-bundle action collision for the same source and
  destination action. Two separate buttons may still invoke the same action,
  but one `pressed` output cannot reach **LED On / Off**, **Next Pattern** or
  another momentary action both directly and through Control Map. The rule is a
  deploy-blocking error and a Graph Health diagnostic, covered by
  `validateGraph.test.ts` and `deployGates.test.ts`.
- [x] Reuse or complete explicit toggle, increment/decrement and range-mapping
  operations. Show initial state and step/range settings where applicable.
  Trigger's Toggle variant now exposes an `initialState` field and preview plus
  firmware initialise the latched output from it. Control Map keeps the
  debounce, repeat and volume/brightness step settings for increment/decrement
  actions. Range mismatches point at Map Range while dragging and in Graph
  Health, whose repair inserts a configured 0-1 -> target-domain Map Range.
- [ ] Retain useful Control Map bundles as an optional compact workflow; remove
  mandatory pass-through chains. Route each action to its actual owner and
  reconcile player/show lighting routes.

### 6. Preserve feedback and evaluation order

- [ ] Use a shared phase model: sample touch, resolve controls and graph values,
  apply destination state, publish status/widget feedback, then refresh screens.
  Specify the prior-sample boundary wherever feedback needs state; do not ignore
  arbitrary graph cycles to make a screen connection pass validation.
- [ ] Preserve slider/toggle feedback ownership while pressed and on release,
  including changes made by another control. Verify independent panels, disabled
  widgets at rest, and the independent recovery route for a self-disabled panel.

### 7. Add LED output Display signals

- [ ] Add a shared LED-output status kind and a Display socket on every LED
  output form. Publish resolved runtime state after controls are applied, with
  a precise definition of effective brightness and blackout. Do not infer a
  single pattern name from a blended graph; use the output's own label.
- [ ] Add LED Status rendering and custom-widget bindings. Define an appropriate
  representation for each panel class, including a documented numeric reading
  for segment displays. Match preview and every applicable firmware generator.
- [ ] Update rendering/codegen terminal discovery so adding an output socket
  cannot prune the LED fixture or its upstream graph. Verify rendering with the
  Display socket both wired and unwired, and independent status for two fixtures.

### 8. Auto-wire templates and fixed layouts

- [ ] Describe controls with stable semantic roles and derive candidate targets
  from the display's actual source and graph context. Resolve only unambiguous,
  supported destinations; do not guess from editable names or node proximity.
- [ ] On initial template/layout creation, create valid ordinary edges and any
  required exposed inputs together in one undoable operation. Leave unavailable,
  ambiguous or occupied destinations untouched with a clear connection hint.
- [ ] Add **Connect template controls** to connect currently missing controls.
  Repeated use is idempotent. Respect manual edits, deletions and rerouting;
  changing the display source or layout must never silently retarget wires.
- [ ] Verify player Play/Pause and Volume, LED Status Brightness and Blackout,
  a template created without a source, multiple possible targets, existing input
  connections, source replacement, manual rewiring, save/reload and undo/redo.
  Read-only layouts produce no automatic control connections.

### 9. Extend the property catalogue and declutter existing nodes

- [ ] Work through the step-1 inventory: numeric and boolean runtime fields,
  then supported colour, palette, selection and text fields. Supply adapters
  where required; do not silently coerce unlike types.
- [ ] Cover group boundaries and supported player/show pattern parameters.
  Distinguish live parameters from bake-time settings, and report remaining
  exclusions explicitly. Never offer a control that only works in preview.
- [ ] Apply the step-1 visibility audit across the full existing node catalogue.
  Keep main data ports visible, expose optional properties/actions on demand and
  retain all connected sockets. Check loaded graphs, group interfaces and the
  consistency of the visible **Expose input…** affordance.

### 10. Verify the complete workflows

- [ ] Exercise Juggle + LED String + status display, with direct touch Speed and
  Brightness and a physical Enabled button. Check held versus toggle behaviour,
  disconnect fallback, save/reload, undo/redo and source tracing.
- [ ] Exercise Music Player, Pattern Slideshow and Performance Generator with
  named direct controls and optional bundles. Check playback, fixture versus
  show dimming, feedback, multiple outputs and invalid-route diagnostics.
- [ ] Exercise template auto-wiring alongside manual edits and optional bundles;
  verify no duplicate actions or redirected connections. Review compact node
  layouts and confirm type colours remain stable through connection changes,
  with useful type/range hints and an accessible non-colour equivalent.
- [ ] Run focused regressions, repository tests, lint and production build;
  compile representative normal/show/player firmware. Check real touch,
  enable/re-enable and LED/status response on hardware. Record software,
  compilation and bench results separately; do not infer hardware success.

### 11. Finish documentation and examples

- [ ] Replace the four reference workflows with examples of the final model.
  Update Help, node references and user guides, including type/range mapping,
  momentary versus toggle controls, field exposure, compact bundles, template
  auto-wiring and its manual reconnect action, default port visibility and the
  distinction between type colours and compatibility highlights.
- [ ] Reconcile auxiliary-display, simple-display and large-display/control
  design notes with the implemented ownership and routing. Remove superseded
  control paths, update root guidance where invariants changed, and link the
  verification evidence before marking this design implemented.

## Implementation starting points

Use current code as the authority where older display notes describe the removed
panel/document split. Start with `src/state/nodeLibrary.ts`,
`src/state/playerControlAssignments.ts`, `src/state/displaySignal.ts`,
`src/state/ledOutputRuntime.ts`, `src/state/graphEvaluator.ts`,
`src/components/Canvas/StudioNode.tsx`, `src/codegen/playerDisplays.ts`, the three
sketch generators and `src/utils/validateGraph.ts`. Follow their shared helpers
for widget roles, property ports, screen state and persistence rather than
creating a parallel routing system.
