# Workspace UI

The workspace tabs and First project guide, and layout traps jsdom cannot catch,
each held by a test that reads the stylesheet.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## Workspaces and guides

- Workspace tabs replaced the split graph/hardware canvas with four full-canvas
  workspaces selected by a tab strip (`src/components/Layout/WorkspaceTabs.tsx`;
  `WorkspaceMode` in `uiStore.ts` is
  `'hardware' | 'build' | 'graph' | 'upload'`), ordered
  Hardware/Graph/Upload/Build Diagram — the sequence the work is done in, with
  the diagram last because it is the other three's output. A session lands on
  Graph because that is where the hours go, *unless the project is blank*, which
  lands on Hardware since choosing a board is the only work available:
  `landOnStartingWorkspace` (`src/utils/startFlow.ts`) is that one rule, called
  at the three moments a workspace is installed (boot, File ▸ New Project, blank
  canvas), and it counts emptiness *without* the Board node every root graph
  carries, or a node count would never read zero. `hardwarePaneTab` was **not**
  removed the way the design doc's scope first proposed ("absorbed" into the two
  modes) — `setWorkspaceMode` still mirrors it whenever the new mode is
  `hardware`/`upload`, and `setHardwarePaneTab` mirrors back into
  `workspaceMode`, because `HardwarePane.tsx` still reads it; treat it as a
  persisted alias of those two modes, not dead state to delete. The "something
  changed elsewhere" tab flash (`useChangedElsewhere`) is keyed only on
  `useGraphStore` node count and hardcoded to flash the Graph tab — it does not
  generalize to Hardware/Build Diagram/Upload announcing their own changes;
  extending it needs a distinct change-signal per tab, not just widening the
  flash target. The left panel holds whichever palette the current tab works
  from — parts shelf, node library, or, on Upload, the **deploy controls**
  (`UPLOAD_CONTROLS_HOST_ID`, portaled out of `MatrixOutputDeployPopup` the way
  the shelf is), which is why that popup's two overlay dialogs are held outside
  its `controls` column: the sidebar's `will-change: transform` would make it
  the containing block and confine a fixed-position dialog to the sidebar's
  width. The display editor is a sub-view of Graph
  (`designWorkspaceView.kind === 'display'`), and every way of leaving it —
  `setWorkspaceMode`, the three build-diagram actions — must dismiss it through
  the shared `leavingDisplayEditor` helper: it was not cleared on tab switch, so
  clicking Graph left the editor showing and, because history follows the editor
  while it's open (`enterDisplayHistoryScope`), Ctrl+Z silently hit the
  document's empty stack instead of the graph's stashed one. Run lives outside
  the editor for the same reason a hidden mode is easy to lose track of:
  pressing it calls `openLiveTouchScreen(displayId)` (`uiStore.ts`), which
  floats `LiveTouchScreen`/`DisplayRunSurface` over the Graph workspace rather
  than switching the editor into a Run mode — the editor is one mode now,
  drawing only the static document. `liveTouchScreenDisplayId` deliberately
  survives a tab switch and a trip back into the designer, so "is the overlay
  open" and "is it the thing on screen right now" are different questions;
  `visibleLiveTouchScreen(state)` answers the second and is what both the
  overlay's own render guard and `App.tsx`'s Escape handler must ask — asking
  the first let Escape on the Hardware tab close an invisible overlay and
  swallow the keystroke instead of reaching Performance mode. Touch values
  persist across Run and Edit instead of resetting on every mode switch, so
  `resetDisplayRuntime` currently has no production caller at all — a deleted
  widget's stale value and a reused widget-id stem are not cleared; reconciled
  instead against the document registry's own identity by `retainDisplayWidgets`
  (`displayRuntimeStore.ts`), driven by one `useGraphStore.subscribe` in
  `graphStore.ts` that fires on `displayDocuments` identity change — the only
  way to cover the two writers that never call `setDisplayDocument` (undo/redo
  rebases the registry, a load replaces it). See
  [the live touch screen](../design/live-touch-screen.md). See
  [workspace tabs](../design/workspace-tabs.md). `.graphPane` (`src/App.tsx`) is
  a plain block container, not flex, so a full-canvas workspace root that only
  declares `flex: 1` sizes to its own tallest content instead of the pane —
  every root (`NodeGraphCanvas` `.canvas`, `HardwarePane` `.hardwarePane`,
  `DisplayEditor` `.editor`, `BuildDiagramWorkspace` `.workspace`) must also set
  `height: 100%`; a missing one is invisible in jsdom (no layout engine) and was
  caught on a bench instead (a 900px window measuring a 5245px-tall Build
  Diagram grid, so the opening fit centred the sheet off-screen).
  `src/components/Layout/__tests__/workspaceHostFill.test.ts` asserts all four
  roots plus the block-host premise itself, so relax it if `.graphPane` ever
  becomes flex.
- The optional **First project** guide
  (`src/components/FirstProject/FirstProjectGuide.tsx`) reads every step off the
  project in `src/utils/firstProjectSteps.ts` rather than ticking steps itself,
  so work done with it closed still counts and it never loads or replaces
  anything — each step's button opens the tool that already does that job.
  `firstProjectGuideStore.ts` remembers only what the project cannot say: skips,
  visibility, the `appearanceFingerprint` baseline (settings and wires, never
  positions; reset by `startFlow`'s `noteFreshStart`) and whether a project
  upload finished — `uploadStore.statusIsProject` is false for a `cache: false`
  instrument flash (wiring test, calibration), which must not count. The guide
  is a compact bottom strip spanning the visible workspace between the two
  floating side panels; `--guide-left`/`--guide-right` include each panel and
  handle, while its measured `stripHeight` becomes the graph canvas's bottom
  inset for fit frame, minimap and zoom controls. **All steps** opens the
  complete list above the strip. On a machine with no saved project and no prior
  start choice, `App.tsx` opens the Start Gallery automatically.

## Layout and input traps

- The Output matrix heading hangs above its frame on a negative `top` inside a
  clipping `.canvasWrap`, so it only survives when the wrap's `padding-top` is
  at least the heading's offset — true at full height, but a height-limited
  panel (audio tools expanded on a short viewport) pulls the frame flush with
  that padding and clips the heading if the pairing doesn't hold. jsdom has no
  layout engine to catch this live, so
  `src/components/Preview/__tests__/matrixHeadingRoom.test.ts` asserts the
  pairing straight out of `LEDPreview.module.css` text — every `padding-top` the
  wrap declares (bare rule plus media-query copies) must be `>=` every
  `canvasFrameHeader` offset — rather than rendering and measuring.
- `StatusBar.module.css`'s live message and its chip rail must both give the
  message room and let the chips be the side that shrinks, not the reverse: a
  plain proportional-shrink layout cut "Ready" to "R…" at 125% zoom and "Rea…"
  at 1280x720. The fix is `.statusbar` staying `display: flex` with `.leftRail`
  pinned `flex: 0 0 auto` (capped by its own `max-width: %` so it can't crowd
  out the chips entirely) while `.right` takes `min-width: 0` plus
  `overflow-x: auto` so the chip rail is the one that shrinks and scrolls. jsdom
  has no layout engine to catch a regression live, so
  `src/components/StatusBar/__tests__/statusMessagePriority.test.ts` asserts the
  three rules straight out of the stylesheet text (`ruleBody` regexes each
  `.class { ... }` block) rather than rendering and measuring — the same
  stylesheet-text-assertion pattern as `matrixHeadingRoom.test.ts` above.
- A box whose child is transform-scaled to the box's *declared* size, not its
  content box, cannot carry a layout-affecting border under the app-wide
  `box-sizing: border-box` (`src/themes/tokens.css`): the border shrinks the
  content box while the child keeps scaling to the outer declared size, so
  `overflow: hidden` clips it. `TransportDisplayNodeBody.module.css`'s
  `.customPreview` opts out with `box-sizing: content-box` because its bordered
  bezel wraps `.customSurface`, which is absolutely sized to the document's full
  `designSize` and `transform: scale(...)`-ed from `top left`. Its siblings in
  the same module (`.customNotice`, `.screen`) and `DisplayEditor.module.css`'s
  `.screen` never hit this because they either scale their content to whatever
  box they're given or draw their outline with `box-shadow`, which takes no
  layout space — prefer `box-shadow` over a real border on a box like this when
  the border doesn't need to affect layout.
- A controlled `<input type="number">` whose `value` round-trips through a
  min/max clamp on every `onChange` cannot accept a typed value whose leading
  digit falls below the minimum — typing toward 3000 with a minimum of 100 gets
  rewritten to 100 before the next keystroke lands, making 3000 unreachable.
  `src/components/Canvas/ClampedNumberInput.tsx` fixes this by holding the
  partial text in local state, committing only keystrokes that already parse
  in-range (so live readouts stay responsive), and clamping once on blur; Escape
  abandons the edit instead of clamping it in. `BoardNodeBody.tsx`'s power-cap
  Volts/Milliamps fields use it. Reach for this component rather than a raw
  `type="number"` input for any new numeric field with a non-zero minimum.
