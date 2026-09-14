# Direct controls and LED output status

Status: in progress — steps 2 and 3 are landed, the rest is pending.
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
so a wired socket cannot be hidden. What remains below is the catalogue-wide
sweep and the widget-role half.

- [ ] Inventory properties and actions by node type: existing input, exposable
  runtime value, action, or rebuild-only setting. Record runtime support for
  normal sketches, slideshow shows and SD/performance players, including
  parameters inside reusable groups and patterns whose values are baked.
- [ ] Audit every existing node's inputs and classify default-visible main data
  ports versus optional property/action ports. Record default exposure in shared
  metadata; preserve existing port IDs and always reveal connected sockets.
- [ ] Define shared metadata for type, range/units, defaults, enum choices,
  integer rounding, action semantics and supported execution paths. Preserve
  existing port identities and numeric-domain behaviour where inputs exist.
- [ ] Define stable exposed-property and widget-role identities, persistence,
  one-source rules and atomic undo/redo operations. Hardware is a breaking
  development line: remove superseded models cleanly without pre-1.0 migrations.

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

- [ ] Derive outputs from the associated panel's actual interactive widgets:
  button = held boolean, toggle = stored boolean, slider/dial = numeric value.
  Reuse widget registry roles and stable IDs; give fixed-layout controls stable
  semantic IDs. Read-only layouts expose no fictitious controls. When a new
  slider or dial is created by wiring it to a property, initialise its range,
  step and unit metadata from that property; when an existing slider/dial is
  connected, preserve its current domain and offer **Match target range** if it
  is the only destination.
- [ ] Move interaction routing to those Touch outputs, with one state owner per
  widget and no duplicated output on the panel. Preserve panel pairing,
  calibration, rotation, capture/release, disable/re-enable and deletion rules.
- [ ] Implement matching preview and firmware sampling. Verify a screen slider
  drives Juggle directly and a physical button drives the panel's Enabled input.
  Verify widget rename/reorder, duplicate labels, removal and layout replacement.

### 5. Make actions and optional mapping explicit

- [ ] Expose named destination actions on demand, including Play/Pause, Next and
  Toggle blackout. Share press-edge, debounce and repeat rules so holding a
  button never repeatedly toggles a destination unintentionally.
- [ ] Reuse or complete explicit toggle, increment/decrement and range-mapping
  operations. Show initial state and step/range settings where applicable.
- [ ] Retain useful Control Map bundles as an optional compact workflow; remove
  mandatory pass-through chains. Route each action to its actual owner, reconcile
  player/show lighting routes, and reject a direct-plus-bundle action collision.

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
