# The live touch screen

Status: **complete**, landed 2026-09-17.
Run leaves the screen designer and floats the live panel over the graph, and a
property driven by a touch widget stays adjustable from the graph itself.
Target: Hardware, ahead of v1.0.0.

## The problem with Run as a mode

Run was a mode inside the screen designer. Pressing it hid the palette and the
inspector and turned the design canvas into a live panel you could press.

That put the whole of Run in the one place where none of its consequences were
visible. A touch control exists to move something — a pattern's speed, an
output's brightness, the petal count of a field — and all of those are drawn in
the LED preview and described by the graph, both a workspace away. So the one
thing Run is for, pressing a control and watching what it does, was the one
thing the mode could not show you. You pressed, crossed to Graph, and inferred.

It also spent the designer's full width on a 240x320 panel, and it reset every
touch value on each mode switch, so going to fix the graph behind a control and
coming back lost the setting you had just dialled in.

## Run as an overlay

Run now leaves the designer. `openLiveTouchScreen(displayId)` (`uiStore.ts`)
returns to the Graph workspace and floats `LiveTouchScreen` above it: a small,
draggable window showing the panel at its true pixel size, with **Edit design**
to go back. The finger and the pixels it moves are on screen together.

The renderer itself did not change. It was lifted out of `DisplayEditor.tsx`
into `DisplayRunSurface.tsx` unchanged, so the overlay and the designer's old
Run view are the same code, and the editor is left as one mode with no hidden
second state. `DisplayRuntimeWidgets` remains the one live widget renderer,
shared by the overlay and the mounted-panel thumbnail on the canvas.

### Open is not the same as on screen

`liveTouchScreenDisplayId` deliberately survives a tab switch and a trip back
into the designer. Switch to Hardware and back and the overlay is where you
left it; open the design, edit it, press Run again and it returns. That is what
makes it feel like a window rather than a mode.

The cost is that "is an overlay open" and "is an overlay the thing on screen"
stop being the same question, and every consumer must ask the second.
`visibleLiveTouchScreen(state)` is that question, asked once:

```ts
liveTouchScreenDisplayId && workspaceMode === 'graph'
  && designWorkspaceView.kind === 'graph'
```

Both the overlay's own render guard and `App.tsx`'s Escape handler read it.
Asking the first question instead is not hypothetical — it shipped for an hour
and meant Escape on the Hardware tab closed an invisible overlay and never
reached Performance mode, a keystroke that silently did nothing.

### The window

The title bar carries no title. The panel names itself on the glass, the
dialog carries `"<panel> touch screen"` as its accessible name, and on a window
this small the words crowded the screen it floats above. What is left is the
handle, so it keeps a grip rather than reading as an empty strip, and Close is
the `×` a floating window is expected to have.

Dragging clamps at all four edges. Clamping only the near ones — which is what
it did first — lets the window be pushed out through the right or the bottom,
and a floating window with no handle left on screen cannot be brought back.

## The graph as a second remote

A wired property's inline editor is normally read-only: the wire is the value's
only source, so an editable field would be a lie. A pot or an audio band is
exactly that case.

A touch widget is not. It is a control that also lives in this app, so there is
no reason the graph cannot move it. `StudioNode.tsx` makes `disabled` read
`(wired && !drivenByTouchWidget)`: a wire whose source is a widget's `out` port
leaves the row editable and turns it into a remote, writing through
`touchControlDriver` / `writeTouchControlValue` (`wireFirstControls.ts`) to the
same runtime value a finger on the glass would set. Without it, wiring a
property left no way to set it at all without opening the designer.

Wiring one also seeds the widget from the value the property already held
(`connectTouchControl`), so connecting a slider no longer jumps the effect to
that slider's minimum before anyone has touched it.

## A reading belongs to a widget that exists

Touch values now outlive the designer, which is the point — set a control, go
and fix the graph behind it, come back to it still set. No editor lifecycle
clears them any more, and `resetDisplayRuntime` has no lifecycle caller left.

That leaves exactly one rule to keep, and it is not obvious: a widget id is a
deterministic stem (`slider`, `slider-2`), handed to the next widget of that
type as soon as the last one frees it. Delete a control you had dragged to one
end, add a fresh one, and it is handed the same id — and, without cleanup, the
old one's reading, with nothing on screen to explain it.

The reconciliation hangs off the document registry's own identity rather than
off any one writer:

```ts
useGraphStore.subscribe((state, previous) => {
  if (state.displayDocuments === previous.displayDocuments) return
  // drop every display and widget the registry no longer has
})
```

A cleanup call at each writer would have been forgotten by the next one, and
two of the writers never call `setDisplayDocument` at all: undo/redo rebases
the registry directly, and loading a workspace replaces it. Both are covered
by tests that were confirmed to fail with the subscription disabled.

## What this deliberately does not do

- **No second entry point.** The overlay opens from the designer's Run button
  only. A panel node on the canvas cannot open one yet.
- **No persisted position.** The window opens at the same place each session.
- **No touch on the device.** As before, this exercises the browser's model of
  the panel; it sends nothing to hardware and proves no physical calibration.

## Checklist

- [x] `DisplayRunSurface.tsx` — the live renderer lifted out of the editor
      unchanged, shared by the overlay and any future Run surface.
- [x] `LiveTouchScreen.tsx` — draggable, clamped at all four edges, titleless
      bar with a grip and an `×`.
- [x] `visibleLiveTouchScreen` read by both the overlay and Escape.
- [x] Editor reduced to one mode; the mode switch and its dead CSS removed.
- [x] Touch-driven property rows stay editable and write the widget's value.
- [x] `connectTouchControl` seeds the widget from the property's value.
- [x] Runtime reconciled against the document registry on every change.
- [x] Help copy (`HelpModal.tsx`, `displayReference.ts`) describes the overlay
      rather than a Run mode.
