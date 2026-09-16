# Wire-first touch controls

Status: proposed 2026-09-17, from bench use. Nothing below is implemented.
Target: Hardware, ahead of v1.0.0.

## Brief explanation

A touch control should be created by **wiring it**, not by drawing it.

Today a control is drawn first: you place a Slider on a screen, that mints
`widget:<id>:out` on the panel's Touch node, you cross to the Graph workspace,
wire that output to a property, and then accept a repair that fixes the
slider's range to match. Four steps in two workspaces, and the first one asks
you to compose a screen before you know what it controls.

Reverse it. Drop a wire from the Touch node onto a property row — the gesture
the canvas already supports for every property input — and the control is
created there, fully specified, because the property being dropped on is the
only thing that knows all five facts a control needs: its **type**, **range**,
**step**, **label** and **default**. The widget then waits in the screen
designer until you place it.

```text
Touch: (drag) --------------------> Formula Field: Petals   (drop on the row)
         |
         +-- mints a Slider, 1..12 step 1, labelled "Petals", unplaced
                    |
  Screen designer:  +-- "Connected" group -- drag onto the screen -- live
```

## Why the current order is backwards

The property carries `propertyMeta` (control kind, `min`, `max`, `step`), a
`propertyLabel`, a declared `dataType` and a `defaultProperties` literal. The
widget carries none of that until something tells it, which is why
`displayControlRangeRepair.ts` exists at all: it walks Touch → widget `out` →
edge → `propertyInputsFor(target)` and offers to copy the range across *after*
the fact. That module is the evidence for this proposal. The derivation is
already written; it just runs too late, as a correction rather than as the act
of creation.

Wire-first also removes the workspace round trip. You are in the graph, looking
at the knob you want controllable, and you say so there.

## The flow

1. **Drag from the Touch node, drop on a property row.** Property rows are
   already drop targets (`data-property-input`, read from the DOM by
   `NodeGraphCanvas`'s `onConnectEnd`), whether or not their socket is showing.
2. **A widget is minted and the edge is drawn, in one undo step.** The widget
   type is derived from the property, not chosen: a `float` property whose
   `propertyMeta.control` is `slider` gives a **Slider**, a `bool` gives a
   **Toggle**, an action input gives a **Button**. Its `min`/`max`/`step` and
   its label come from the property.
3. **The widget has no bounds yet.** It exists, it has a port id, the edge is a
   real edge — it simply is not on the canvas.
4. **The screen designer lists it** in a "Connected" group above the widget
   palette.
5. **Dragging it onto the screen gives it bounds.** It leaves the group and
   becomes live.
6. **Deleting it from the screen clears its bounds.** It returns to the group,
   because its wire is still there.

## The "Connected" group is derived, not a second list

It is *widgets in this document with no bounds*. There is no separate registry
of pending controls to keep in step with the document, and no third state
between "connected" and "placed" — the presence of bounds is the whole
distinction. Steps 5 and 6 above stop being rules and become consequences.

This is why the widget is minted immediately rather than held as a pending
binding the way `PlayerControls` holds `pendingControlAssignment`. That node
needs its half-state because nothing on the source side can name the control —
a Button's output is only ever `pressed` — so a picker has to. Here the
destination names it, which is the Button Bank's trick, so there is nothing to
wait for. Minting immediately means the edge is a real edge from the first
moment: evaluation, validation, the generators, save/reload and undo need no
new concept.

## Nothing is deleted by an edit in another workspace

A control that has been placed, sized and themed must not evaporate because a
wire was cut in the Graph workspace, where it is not even on screen and the
undo stack belongs to the graph.

Instead there is **one inert state with three causes**:

| Cause | What it means |
| --- | --- |
| No bounds | Connected, not yet placed |
| No valid connection | Placed, but nothing drives it |
| Property disabled | Wired, but the target ignores it right now |

The third already exists: `wiredPropertyIsInert` in `propertyInputs.ts` asks
`isPropertyEnabled` through the port's property key, and `GlowEdge` draws that
edge dark with its packets dropped. A Formula Field knob belonging to another
`formulaType` is the worked example. The other two causes should read the same
way, on the wire and on the widget, through one predicate rather than three
that drift.

An inert control is reported in Graph Health with a repair, in both directions:
a placed widget nothing drives, and a connected widget nothing draws. The
second is worth saying out loud — it is a control the firmware can read and no
finger can reach.

## The range flows at adoption

When a widget is placed, it takes `min`/`max`/`step` and its label from the
property. That is `displayControlRangeRepair`'s existing derivation, run at
birth. Afterwards either side may be edited and the same module offers to
re-sync, exactly as it does today. One mechanism, two moments — rather than a
second copy of the derivation for the creation path.

## The palette still promotes rather than filters

The template shelf's own stance, and the reason is written beside it: "Nothing
is hidden: a template that reads everything off the graph is correct on any
panel, and a panel with nothing wired simply has no mapped group." Connected
controls are promoted to the top; everything else stays below.

Filtering the palette to only what can be auto-connected would leave a panel
wired to nothing with an **empty palette** — undesignable — and would hide the
widgets that can never have a connection at all. Which brings us to the rule
that most needs its scope stated.

## Only four widget types are controls

`portRoles` says which: **Button**, **Toggle**, **Slider** and **Dial** are the
widget types with an `out` port. Everything else either reads a value (Text,
Value, Gauge, Bar, Colour, Pattern and the rest — all `input(...)`) or draws
nothing but itself (Image — `portRoles: []`, which the palette labels
"Visual").

Any rule of the form "a widget without a connection is not available / is
removed" applies **only to those four**. A bound readout deliberately mints no
port at all (`displayWidgetIsBound`), taking its reading from the one source
wired into its panel; a Label or an Image can never have a wire. Applying the
rule to every widget would delete most of a finished screen.

## Rejected alternatives

**Auto-place the widget on connect.** Invents no new state at all, which is
genuinely attractive. Rejected because a screen is a composition on a 240x320
surface: wiring six controls would drop six overlapping widgets onto a design
you were in the middle of, uninvited.

**Choose the target from the widget's inspector.** This is how *readouts*
already bind (`displaySourceFields`, `widgetSources`), so it would make the two
halves of a screen consistent. Rejected for controls because a readout has
essentially one source — the panel's own display wire — while a control can
target any property on any node. That fan-out is what a graph wire expresses
well and a dropdown expresses badly. The asymmetry is the difference in
fan-out, not an oversight; expect the question.

**Give the Touch node one port per binding, named by destination, and have
widgets adopt bindings.** Would make "connected but unplaced" free, with no
schema change. Rejected because it rewrites what a Touch port id *means*, and
`parseDisplayWidgetPortId` is the whole contract between a display document and
everything that only sees the node, the evaluator included. The gain does not
justify touching the evaluator, three generators, validation and the range
repair. Worth noting one argument that does *not* support it: widget port ids
are keyed on the stable widget id, not the label, so renaming a widget already
cannot break its wire.

## What this touches

`bounds` becomes optional on `DisplayWidget`, which is one field and one bump
of `DISPLAY_DOCUMENT_SCHEMA_VERSION`. The cost is not the field — it is that
every walk over `document.widgets` must then answer whether it means **ports**
or **pixels**:

- `customDisplayMountPlan` (`mountedDisplays.ts`) — the one walk the RAM
  estimate, asset baking, deploy validation, the template planner and the
  normal generator all read
- `customDisplayResources.ts` / `bakeCustomDisplayAssets.ts` — an unplaced
  widget bakes no asset and costs no flash
- `customDisplayLvglCpp.ts` / `customDisplayPanelCpp.ts` — emits nothing
- `displayWidgetPorts` and the Touch node's outputs — **do** include it; this
  is the half that must not be filtered
- `syncDisplayNodesInContent` — projects widget sources onto the panel node
- `displaySurfaceCases.ts` and the golden sheets — an unplaced widget must not
  change any recorded digest

This is the display registration-points hazard: missing one fails quietly and
differently each time. Hold them in step with a derived test in the style of
`hardwareRegistries.test.ts` rather than with care.

## Open questions

- **Two controls on one property.** A coarse Dial and a fine Slider on the same
  knob is a reasonable thing to want, but `templateControlPlan` already
  declines any destination port that has something wired to it, and two
  controls fighting over one value needs a stated precedence. Proposed: refuse
  the second wire with a reason, as the template planner does.
- **Deleting the panel.** The document is named by the panel's `displayId`, so
  deleting the panel already takes the design with it. The Touch node and its
  edges go too — existing behaviour, but worth confirming it reads as
  deliberate rather than as this feature losing work.
- **Colour.** "Active is green" was considered and is not proposed here: edges
  already carry colour meaning by data type and signal role, and colour-only
  status fails for colour-blind users. Dimming reads as inactive regardless of
  hue, which is what the inert state above uses.

## Checklist

- [ ] `bounds` optional on `DisplayWidget`; schema version bumped; every walk
      above audited and held by a derived test.
- [ ] Widget type, range, step and label derived from the dropped-on property.
- [ ] Drop on a property row mints widget + edge in one undo step.
- [ ] "Connected" group in the designer, derived from absent bounds.
- [ ] Place / delete moves a widget between the group and the screen.
- [ ] One inert predicate covering all three causes, on wire and widget.
- [ ] Graph Health reports both directions with a repair; nothing auto-deletes.
- [ ] Range adoption at placement reuses `displayControlRangeRepair`'s
      derivation rather than copying it.
