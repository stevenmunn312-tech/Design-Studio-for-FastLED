# Wire-first touch controls

Status: **complete**, agreed 2026-09-17 from bench use and landed the same day.
A control is created by wiring it, waits in the designer's Connected group,
moves between that group and the screen, says when it is doing nothing, and is
reported in Graph Health in both directions. The checklist at the foot is the
record of what that took.
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

### What landed for the gesture

The Touch node grows a trailing `add-control` output whenever it has a screen
design to put a control on — absent, rather than refusing after the fact, on a
panel drawing a fixed layout. Its dataType is its own (`newcontrol`), which
`portsCompatible` matches against nothing, so the ordinary connect path cannot
use it and the only thing that acts on it is the wire-first drop.

That also means the *hint* shown while a noodle is in the air has to ask the
same question the drop does, rather than comparing port types — otherwise every
valid row would read "newcontrol cannot connect to float". `connectionTargetHint`
branches on the handle and runs `touchControlPlan`, so a row says either what it
will create ("Creates a Slider for Petals") or why it will not, before the drop
rather than after it.

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

### How the one predicate came out

`displayControlInertReason(widget, edge, nodes)` in `wireFirstControls.ts`
answers `unplaced` | `unconnected` | `target-disabled` | `null`, and the
existing `wiredPropertyIsInert` is what it asks for the third. Two readers:
`GlowEdge` on the graph canvas and the widget in the designer.

Which causes each reader can see falls out rather than needing a rule — a
widget nobody placed has no pixels to dim but does have a wire, and a widget
nobody wired has no wire to dim but does have pixels. Of the three, `unplaced`
is reported ahead of `target-disabled` when both hold, because it is the one
the author can act on from the screen they are looking at.

`touchControlWireInert` is the wire-side lookup, and its `null` means "not a
control wire" rather than "live": the caller falls back to the ordinary
target-side rule, so answering `false` there would have quietly stopped dimming
every other inert property wire in the graph.

The scope rule above ("only four widget types are controls") is now derived
rather than named: `displayWidgetIsControl` in `displayRegistry.ts` asks
whether the type has an `out` role, since that role *is* the thing in question,
and `isInteractiveDisplayWidget` — which had the four hand-listed — reads it.
`displayRegistry.test.ts` pins the resulting set to those four so a widget that
grows an output later fails until someone has thought about what it means for
these rules.

The widget marker is a fade **plus a neutral dashed outline**, which the wire
does not need. A fade alone works on a noodle because every noodle starts from
the same brightness; on a screen it does not, and a bright widget at 0.42 still
reads livelier than a dull one at full strength — measured on the bench, not
assumed. The outline is the half that does not depend on what the widget
happens to be drawing, and it is neutral rather than a status hue for the
reason given below. The fade is `calc()`-ed against the theme's own state
opacity rather than replacing it, so a widget already muted by its theme state
cannot get *brighter* for being inert; selecting it restores the fade and keeps
the outline, because the next thing you do is edit it.

An inert control is reported in Graph Health with a repair, in both directions:
a placed widget nothing drives, and a connected widget nothing draws. The
second is worth saying out loud — it is a control the firmware can read and no
finger can reach.

Both are **warnings**, and only one carries a performing repair. Placing one
control the author asked for, into the first free rectangle, is the same act
the Connected group's button performs, so `place-touch-control` does it; the
rejection of auto-placement above was about doing it *uninvited* on connect,
not about doing it when asked. The other direction needs a wire aimed at one
particular property, which only the author can choose, so it names the gesture
and frames the nodes rather than pretending to guess. Nothing is removed by
either: a control drawn before its wire, or wired before it is composed onto
the screen, is an ordinary half-finished state.

The third cause is deliberately **not** reported here. It is already drawn on
the wire, it is one dropdown away from being live, and a Formula Field with a
knob belonging to another variant is a correct graph — a warning that fires on
one of those teaches people to stop reading the drawer, which this codebase has
said before about pattern tags and signal ranges.

`GraphDiagnostic.repair` became a discriminated union to carry the second
repair, rather than growing a second optional field, so the drawer's one
handler stays exhaustive: a repair that forgets its branch fails to compile
instead of rendering a button that does nothing.

## The range flows at adoption

When a widget is placed, it takes `min`/`max`/`step` and its label from the
property. That is `displayControlRangeRepair`'s existing derivation, run at
birth. Afterwards either side may be edited and the same module offers to
re-sync, exactly as it does today. One mechanism, two moments — rather than a
second copy of the derivation for the creation path.

It came out as `placeTouchControlIn`, which every placement goes through: the
Connected group's own button, and Graph Health's repair. Placement is a real
second moment rather than a formality, because a control drawn from the
palette, wired, then deleted from the screen waits in the group with a live
wire, and the property may have moved on in between.

Both moments are gated by the same `displayControlIsUnconfigured` — label,
`source` and all three range fields still as the widget type shipped them —
which the connect-time path already had inline and now shares. That gate is
the load-bearing half: without it, deleting a control from the screen and
placing it again would silently revert a range somebody chose, and a
deliberately coarse 0–10 slider on a 0–255 property is a decision, not a
mistake. Changing one's mind stays the explicit "Match target range" repair.

### How the designer half came out

The group is `document.widgets.filter((widget) => !isPlacedWidget(widget))`,
read where it is drawn. Placing and unplacing are two geometry functions in
`displayEditor.ts` beside the rest of them — `placeDisplayWidget` gives a
widget `firstAvailableBounds`, the *same* free rectangle the palette's own
entries land in, so a control placed from the group and one added from the
palette arrive by one rule rather than two; `unplaceDisplayWidgets` takes the
field away rather than setting it to `undefined`, since `'bounds' in widget` is
what a normalize and a JSON round trip both go on.

Two decisions the flow above does not settle:

**Click, not drag.** Every other palette entry is click-to-add, and inventing a
second placement gesture for this one group would make the shelf inconsistent
with itself to save one step.

**Delete is two-stage.** Delete on a placed, wired control returns it to the
group and asks nothing, because nothing is destroyed — the confirm that used to
guard this case is now unreachable for it. Deleting the *group entry* is the
real removal, and that one still asks before taking the wire. Cut is
deliberately exempt and stays destructive: it puts a copy on the clipboard, so
its removal has to be real or the clipboard would hold a duplicate of something
still in the document. Whether a wire exists is asked of the live store at the
moment of the decision rather than of the render's snapshot, since it decides
whether a widget is destroyed.

The caption under each entry names the destination, through one walk
(`displayControlEdges`) that the range repair now resolves its own target
through as well — the two cannot disagree about which wire a widget is on. It
names the *node*, not the property, whenever the widget is already named after
the property, which a wire-first control always is: this column is narrow
enough that "Juggle · Co…" would spend the whole line repeating the line above
it. `controlDestination` therefore returns the two halves apart and lets the
caller compose; the full string is on the caption's `title`. Both are read
through `nodeDisplayLabel` rather than `data.label`, because nothing persists a
node label and an LED String would otherwise name itself "LED Matrix".

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
Numeric Readout, Timecode, Progress, Value Meter, Status Indicator, Colour
Swatch, Pattern Browser — all `input(...)`) or draws nothing but itself
(Image/Icon — `portRoles: []`, which the palette labels "Visual").

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

`bounds` becomes optional on `DisplayWidget`. `DISPLAY_DOCUMENT_SCHEMA_VERSION`
is deliberately **not** bumped: `normalizeDisplayDocument` rejects any document
whose version it does not recognise, so bumping would drop every screen design
already saved, to buy nothing — a v1 document has bounds on every widget and
reads correctly as the new shape. The cost is not the field — it is that
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

### Measured, not estimated

A first pass made `bounds` optional to see what the compiler would say. It
found **160 sites across 15 files**, which is the audit working rather than a
sign the approach is wrong — but two of them are hazards the compiler *cannot*
see, and they set the shape the refactor should take:

- `resizeDisplayDocument` maps `document.widgets` against
  `canonicalDisplayTemplateBounds(document.widgets, ...)` **by index**. Mixing
  unplaced widgets into that array silently misaligns every template bound by
  one per unplaced widget. A `?.` guard compiles and is wrong.
- `firstAvailableBounds` tests a candidate rectangle against every widget's
  `bounds` to find free space. An unplaced widget has none, so a guard that
  skips it is correct, but a guard that defaults it is a phantom obstacle.

Both say the same thing: `displayEditor.ts` is a geometry engine and should
never see an unplaced widget at all. Rather than guarding ~42 sites inside it,
narrow once at its boundary — a helper that hands the callback only the placed
widgets, contiguously indexed, and re-joins the unplaced ones afterwards. The
index-alignment class of bug then cannot be written.

`displayRegistry.ts` is the opposite half and must **not** narrow: it mints
ports, which every widget has. Its two *geometry* helpers do — `displayControlHitBounds`
takes a placed widget, and the minimum-size checks in `displayWidgetValidationIssues`
are skipped for a widget with no size, while its display-class and property
checks still apply to every widget.

### How it came out

`overPlacedWidgets` in `displayEditor.ts` is the narrowing: it hands a pass
only the placed widgets, contiguously indexed, and re-joins the unplaced ones
in their original positions. `DisplayRuntimeWidgets` is a second one worth
naming — narrowing that single component covered both of its consumers, the
editor's Run surface and the panel thumbnail.

The third index pairing was the one not predicted: `customDisplayResources.ts`
registers a baked asset under a `widgetIndex`, and `customDisplayLvglCpp.ts`
looks it up by the index of the widget it is emitting. Those are two modules
counting what has to be the same list, so the emitter now takes every walk
through one `emittedWidgets` accessor and the `widgetIndex` type says which
list it indexes. Counting differently there does not fail a build — it draws
one widget's icon on another.

## One control per property

The second wire onto an already-driven property input is **refused, with a
reason** — the stance `templateControlPlan` already takes when it declines any
destination port that has something wired to it. A coarse Dial and a fine
Slider on one knob is a reasonable thing to want, but two controls writing one
value need a stated precedence, and there is no honest one: whichever is
sampled last wins, which is a frame-ordering accident rather than a design.

The refusal is a sentence, not a dead gesture. Retargeting stays easy because
deleting the first wire releases the property immediately.

## Deleting a panel takes its screen, and that is deliberate

A document is named by its panel's `displayId`, so deleting the panel already
takes the design, the Touch node and their edges with it. That is existing
behaviour and it stays: the screen is part of the panel, not a document the
panel happens to reference — which is the same reasoning that made a design
shared by two panels unsayable rather than merely refused.

## Dimming, not colour

"Active is green" is rejected. Edges already carry colour meaning by data type
and signal role, so a status hue would collide with the one already there, and
colour-only status fails for colour-blind users. Dimming reads as inactive
regardless of hue, and it is what the inert state above already uses on the
wire — so the widget and its wire say the same thing the same way.

## Checklist

- [x] `bounds` optional on `DisplayWidget`; every walk audited and held by
      `src/state/__tests__/unplacedWidgets.test.ts`. The schema version is
      **not** bumped, for the reason above.
- [x] Widget type, range, step and label derived from the dropped-on property
      (`touchControlPlan` in `wireFirstControls.ts`).
- [x] Drop on a property row mints widget + edge in one undo step
      (`connectTouchControl` in `graphStore.ts`), from the Touch node's own
      trailing `add-control` socket.
- [x] "Connected" group in the designer, derived from absent bounds.
- [x] Place / delete moves a widget between the group and the screen.
- [x] One inert predicate covering all three causes, on wire and widget.
- [x] Graph Health reports both directions with a repair; nothing auto-deletes.
- [x] Range adoption at *placement* (`placeTouchControlIn`), sharing
      `adoptedControlRange` and the unconfigured gate with the wiring moment.
- [x] A second wire onto a driven property input is refused with a reason.
