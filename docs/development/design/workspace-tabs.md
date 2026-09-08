# One canvas, four workspaces

Status: proposed 2026-09-08, from bench use. Replaces the split graph/hardware
canvas with four full-canvas workspaces selected by tabs: **Hardware · Build
Diagram · Graph · Upload**.

## Why

The graph and the hardware bench currently share the canvas, divided by a
draggable handle. The reported experience of that, over days of real use, is
"constantly adjusting the divider … like I am battling the UI".

That is the whole argument. A divider someone keeps adjusting is one that is
never right, which means it is not trading space between two panes — it is
starving both. The graph is too short *and* the bench is too cramped, at the
same time, permanently.

The counter-argument was that seeing both at once connects the hardware to the
nodes. It does not, and the app already proves it: that connection is carried by
links and shared state, not adjacency —

- the `TRACING <PART>` badge tying a bench part to its node,
- **Show in graph** on a part's menu, which *navigates* rather than relying on
  both being visible,
- live panel previews on node bodies, mirroring real glass,
- pin numbers on the bench that are node properties rendered.

None of those need two panes on screen. Every one of them survives this change
untouched, and two of them get better under it (see *Landing traced*, below).

One pane does earn permanent space, and already has it: the **LED preview**.
That is the output, and watching it is continuous. The bench is consulted, not
watched.

## What it is

Four workspaces, each taking the whole canvas, selected by a tab strip:

| Tab | Content |
| --- | --- |
| Hardware | The bench — parts, board, wiring |
| Build Diagram | The assembly drawing (already a full-canvas mode today) |
| Graph | The node canvas (and the Display editor, which replaces it in place) |
| Upload | Compile, capacity and flashing |

**Order tells the build story; the default is where the work is.** The order
above reads as a newcomer's path — choose parts, see them wired, program them,
flash them. The landing workspace on open is nevertheless **Graph**, because
that is where the hours go.

The status bar stays put beneath all four. That is what makes tabs safe rather
than a way to hide problems: graph health, pin state, module count, board and
port are visible whichever workspace is showing, so nothing goes quiet just
because you are not looking at it.

## The two objections, and what each actually costs

### "Something appears somewhere I cannot see"

Adding a part on the Hardware tab creates a node on the Graph tab. Today you
watch that happen; under tabs it happens out of sight.

**A tab announces when something you just did changed it.** Not when its content
changes — that would flash constantly and teach people to ignore it — but when
an action taken in *another* workspace changed this one. The signal decays on
its own and never requires dismissal.

*As built*, this is one direction only: `useChangedElsewhere` watches the graph's
node count and flashes **Graph**, which covers the case that prompted it —
adding or removing a part putting a node somewhere you cannot see. Generalising
it so any tab can announce its own change is not a matter of widening the flash
target; each workspace needs a change signal of its own worth announcing, and
what those are has not been decided.

This is worth building even though the split layout would have shown it for
free, because "for free" was only true while both panes were on screen and both
were big enough to notice a change in.

### "I know I saw a button node yesterday"

This one is not caused by tabs, and tabs will not make it worse. It is true
today:

```ts
const HARDWARE_LIBRARY_HIDDEN_NODE_TYPES = new Set([
  'Board', 'MicInput', 'LineInput', 'ButtonInput', 'ButtonBank', 'PotInput', …
])
```

`ButtonInput` is hidden from the node library. Someone who added a button from
Hardware, saw a Button node in their graph, and later searches the library for
"button" finds nothing — then finds it in Help, which confirms it exists and
still does not say where it came from.

**Hardware-owned types should be findable where people look for them.** A
library entry that is searchable and explains itself — *"Button · added from
Hardware"* — and whose click takes you to Add Hardware rather than dropping a
node. It answers the question at the point the question is asked. It is worth
doing regardless of this change, and it becomes more valuable under it.

### Landing traced

Both objections share a fix worth stating on its own: **selecting a node should
highlight its part, and switching tabs should land on it already traced.** The
tracing mechanism exists; it just needs to survive a workspace change. Give the
node the reverse of *Show in graph* at the same time.

That is the connection the split pane was being asked to provide, bought with
behaviour instead of permanent screen area — and unlike screen area, it helps
even when you are looking straight at both.

## What is deliberately not kept

**No split-view option.** Two layouts is two layouts to design, test and
support, and the split would stay the worse of them indefinitely while
collecting just enough users to be unremovable. If the links above do their job,
nothing reaches for it.

## Scope

The change is mostly hoisting state that already exists. The panes themselves —
`HardwarePane`, `BuildDiagramWorkspace`, `NodeGraphCanvas` — do not change
internally.

1. **`uiStore`**: widen `WorkspaceMode` from `'design' | 'build'` to the four
   workspaces, migrating `'design'` to `'graph'`. Keep `openBuildDiagram` and
   friends working — the menu bar and keyboard paths call them.

   `hardwarePaneTab` (`'hardware' | 'upload'`) survives *as built*, mirrored
   rather than absorbed: `setWorkspaceMode` writes it whenever the new mode is
   Hardware or Upload, and `setHardwarePaneTab` writes `workspaceMode` back, so
   the several existing callers that navigate by asking for a pane tab — the
   menu bar, hardware readiness, the setup wizard — keep working untouched and
   now land on a full workspace. `HardwarePane` still reads it to choose which
   half to render. Treat it as a persisted alias of those two modes, not as dead
   state to delete.
2. **Tab strip** across the workspace, with the announce-on-change behaviour.
3. **`App.tsx`**: render one workspace per mode. The `workspaceMode === 'build'`
   branch already does exactly this for one of the four, so this generalises a
   proven shape rather than inventing one.
4. **Remove the split**: `HorizontalResizeHandle`, `hardwarePaneRatio`,
   `--hardware-pane-height`, `MIN_HARDWARE_PANE_HEIGHT`,
   `MIN_GRAPH_PANE_HEIGHT`, and the `hardwareDock` wrapper.
5. **`HardwarePane`**: drop its internal `HARDWARE | UPLOAD` tabs, now that the
   workspace strip does that job. It still hosts both halves, choosing between
   them on the mirrored `hardwarePaneTab` above.

Separable, and each valuable alone: the tab announcement (2), the node-library
stubs for hardware-owned types, and landing traced.

Stage, performance and Display-editor modes each already override the workspace
and must keep doing so — the Display editor replaces the graph *within* its
workspace rather than becoming a fifth tab, because it is a mode of the graph,
not a peer of it.
