# Workspace UI

The workspace tabs and First project guide, and layout traps jsdom cannot catch,
each held by a test that reads the stylesheet.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## Node reference assets

- Generate one node's help illustrations with `npm run gen:node-cards -- --only PatternMaster`; this preserves unrelated assets and the gallery index. The generator uses the shared exposable-input helpers so hidden action sockets stay hidden unless connected in an example.
- The card generator draws the node the way `StudioNode.tsx` does today. Header badges, preview notes, node widths, the hardware-widget type list and the inline-editor property filter live in `src/components/Canvas/studioNodeChrome.ts`, shared by the live node and the generator; change them there, never in one place only. Layout numbers in the generator (row heights, badge metrics, socket positions) were measured from the live DOM at zoom 1; re-measure after a `StudioNode.module.css` change rather than estimating.
- Bespoke node bodies (music library, transition picker, pattern collection, audio source picker…) are drawn on the card as a dashed placeholder of the body's measured default height (`EMBEDDED_UI` in the generator). A new body component needs an entry there, or its card will omit the space it takes.
- Part thumbnails travel inside the card as data URIs: an `<img src="card.svg">` never fetches external resources. `scripts/run-ts.mjs` loads `.webp`/`.png`/`.jpg`/`.svg` imports as data URLs for that reason.
- Music Player help uses `musicPlayerReference.ts` for its overview and wiring guidance, and `propertyDescription` for detailed property notes. Property groups must retain ungrouped settings such as Volume. Its card expands Timing and Randomness for comparison with those notes.
- Generated help SVGs have stable URLs. Keep their service-worker cache network-first with an offline fallback so updated illustrations reach installed clients.

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
  [the live touch screen](../../design/live-touch-screen.md). See
  [workspace tabs](../../design/workspace-tabs.md). `.graphPane` (`src/App.tsx`) is
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

- Entering a group runs `runTidy({ scope: 'all' })` from an effect in
  `NodeGraphCanvas.tsx` keyed on `activeGraphId`, never from the store:
  `tidyGraph.ts` imports the store, so the store cannot import it back. The
  effect remembers the last graph it tidied, so a re-render inside the same
  group does not re-tidy, and the root graph is left alone. Tidy fits the
  view itself when its glide ends, superseding the fit `enterGraph` requests.
  The move is a history entry like any tidy, so Undo restores the seed layout.
- The main LED Output pane draws a ring, corkscrew or positioned string where
  its LEDs are, not as the one-row frame its wire order is. `shapeLayoutFor`
  (`src/components/Hardware/ledPreviewGeometry.ts`) gives the emitters in cells
  of one LED pitch, from the same angle rules the node preview, the hardware bay
  and the sketch maps use; the pane sizes its canvas by that box instead of the
  physical grid, so `pixel` keeps meaning one LED, and `renderShapeFrame`
  (`frameCanvas.ts`) draws the matrix renderer's emitters at those points.
  Shapes go through Canvas 2D, not the WebGL shader: the `<canvas>` is keyed on
  whether a shape is active, because an element that has handed out one
  context kind cannot hand out the other, and the renderer effect restarts on
  that key. The W×H readout, streaming and recording stay on the physical
  one-row frame. The pane remains the one visible per-frame canvas; the node
  and bay previews stay SVG for the leak reason `HardwareLedPreview` explains.
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
  abandons the edit instead of clamping it in. Escape also blurs the field, and
  that blur's commit still sees the old draft, so an `abandoning` ref skips it;
  without it, Escape clamped the abandoned text into the store. `BoardNodeBody.tsx`'s power-cap
  Volts/Milliamps fields use it. Reach for this component rather than a raw
  `type="number"` input for any new numeric field with a non-zero minimum.

- **Scrollable lists inside nodes need `nowheel` and a max-height.** React Flow
  turns the wheel into canvas zoom, so an overflowing list inside a node either
  zooms the canvas or, uncapped, grows the node taller than the canvas. Give the
  list `nowheel`, `overflow-y: auto` and a `max-height`, as `PaletteBankBody.tsx`
  does for its bank strip and catalogue grid.
- **One Escape closes one layer.** Every popup, menu and dialog that closes on
  Escape registers with `useEscapeLayer(onEscape, open)`
  (`src/hooks/useEscapeLayer.ts`), which gives the keystroke to the most
  recently opened layer and stops it there. Separate listeners could not
  express that: listeners on one target run in the order they were added, so
  the lowest layer always answered first. Escape on Help or the Start gallery
  also closed the Build Diagram through `App.tsx`'s window handler, a dialog
  opened from a Hardware menu also closed the menu, and popups that yielded
  while `appDialog` was set saw it already cleared, because the dialog resolves
  before document and window listeners run. Pass `open` for a component that
  stays mounted while closed, or it swallows every Escape while invisible. An
  element that answers Escape itself (`MenuBar`'s keyboard handling,
  `ClampedNumberInput` abandoning an edit) calls `preventDefault`, and both the
  stack and `App.tsx` then leave the event alone. `PropertyInputMenu` (capture phase) and the Performance deck's key
  learning are deliberate exceptions that take the keystroke before anything
  else.
