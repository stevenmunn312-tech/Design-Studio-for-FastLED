# Validation and deploy

The deploy gate, Graph Health diagnostics and repairs, and the readings the
Upload tab shows on the way to a board.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

- Deploy blocking is one list, not a per-caller copy: **`findDeployBlockingErrors(nodes, edges, selectedFqbn)`**
  in `validateGraph.ts` holds every graph rule that must stop a
  build/flash/export, and both `validateGraph` and `MatrixOutputDeployPopup`
  read it — the popup adding only what is measured rather than derived from the
  graph (display-asset preparation, the live capacity overflow, the RAM budget).
  Assembling it in the component is what let rules go missing from the buttons
  while Graph Health called them errors: `findHub75ConfigErrors` once, then
  `findScalarExpressionErrors` (an expression the parser rejects resolves to the
  property's library default, so the flashed sketch does something other than
  what the node says). Graph *shape* stays out on purpose, since which port must
  be wired depends on the action. The gate is now every graph error
  `validateGraph` reports, six formerly exempt classes included (unresolved
  Audio and Storage capabilities, Stereo VU Meter configuration,
  display-generator and output-runtime issues, error-severity show-engine
  issues). The popup dedupes its assembled list, because a control-routing error
  legitimately arrives from two sources — the asset-bake hook and the gate's
  output-runtime half. `deployGates.test.ts` provokes one graph per failure
  class and asserts the gate refuses it, the message names the offending
  node/pin/property, Graph Health explains it with a repair, and that
  `validateGraph` and the gate agree exactly. That third assertion is
  load-bearing: enforcing the six revealed three with no diagnostic at all
  (Storage capability, the VU meter's data pins, its chipset), which would have
  blocked Upload with nothing in the drawer to explain it — the inverse of the
  HUB75 fault.
- The capacity meter names what a reading actually establishes rather than
  always saying "Fits": `src/utils/capacityFormat.ts`'s `summarizeCapacity`
  derives a `CapacityVerdict`
  (`unknown`/`checking`/`fits`/`tight`/`overflow`/`failed`/`stale`) separate
  from its `level` (used for colour), because "Fits" is only ever true of a
  measurement of the design as it stands now — a pass against an older graph is
  `stale`, not-yet-checked is `unknown`, and a compile that produced no figures
  is `failed` rather than a silent overflow. `tone` is `level` demoted to
  `pending` whenever `level === 'ok'` but the verdict isn't `fits`, so a stale
  pass can't borrow the green look of a current one;
  `MatrixOutputDeployPopup.tsx` reads `capacitySummary.tone` for the button's
  colour class and `capacitySummary.line` (`<label>: <board> · <detail>`) for
  its text and title, not the older flat `text`/`level` fields. Separately,
  `Upload.module.css`'s `.capacityLine` sits in `.deployControls`, a scrolling
  flex column, and carries `overflow: hidden` for its own ellipsis on a long
  reading — that `overflow: hidden` also resolves a flex item's automatic
  minimum height to zero, so without `flex: 0 0 auto` the column squeezed the
  line to a 2px rule and the Upload tab showed no capacity reading at all.
  `capacityLineHeight.test.ts` asserts the fix against the stylesheet text
  directly (jsdom has no layout engine to catch a real collapse) and states its
  own premise — `.deployControls` is flex and `.capacityLine` is
  `overflow: hidden` — so it reads as stale rather than silently passing if that
  structure changes.
- A port being *selected* and a board being *connected* on it are two separate
  facts, resolved once in `src/utils/portStatus.ts`'s `describePort` rather than
  per component: the selection is remembered per project and survives the board
  being unplugged, while presence is only as fresh as the helper's last port
  scan, so showing "COM6" alone for both let a remembered, absent port read as
  ready. `PortState` distinguishes `checking` (helper not yet probed, or
  `portsScanned` is still false — an empty scan before the first result means
  "not asked yet", not "nothing there"), `offline` (helper unreachable or
  answering not-ok, which can never scan and so is treated the same as absent),
  `none`, `disconnected` (selected but missing from the last scan), and
  `connected` (selected and present), each with matched `text`/`detail` strings.
  Every surface that names the port calls it — the Upload heading and Connection
  readiness row (`MatrixOutputDeployPopup.tsx`), the footer chip
  (`StatusBar.tsx`), `BoardPopup.tsx`, `MatrixOutputSetupWizard.tsx` and the
  serial toolbar (`OutputConsole.tsx`) — and `portDetected` there is
  `state === 'connected'`, so none can disagree about whether a remembered port
  is there. `portsScanned` is set by `uploadStore.refreshPorts`; a test fixture
  that sets `ports` directly must also set it, or the popup reads `checking` and
  Upload stays disabled. The serial monitor's own state reads Monitoring /
  Monitor off, never Connected/Disconnected, which beside "COM6 · connected"
  would read as the board being unplugged.
- Readiness is separate steps, not one "ready": `src/utils/readinessLayers.ts`'s
  `readinessLayers` builds Preview, Graph, Capacity and Connection rows for the
  Upload controls' **Getting to your board** list (`ReadinessLayers.tsx`, one
  native `<details>` per row so the explanation opens by keyboard), each saying
  what comes next rather than what is wrong. Each row reads its own authority
  rather than restating one: Graph's count is `findDeployBlockingErrors`' list
  (suggestions from `buildGraphDiagnostics` warnings), Capacity follows
  `summarizeCapacity`'s `verdict` (never its colour), Connection is
  `describePort`. Bench testing is deliberately **not** a row: almost every
  setup is untested by this project, so it read orange for nearly everyone —
  tested builds live in the README and `docs/release/beta-support-matrix.md`
  (mirrored for the report form by the recorded rows in
  `hardwareValidation.ts`), and the report form opens only from **Share a
  report…**, never by itself after an upload. The tools expander is **Build
  tools & port** with a plain Ready badge, never "Ready to upload". This follows
  the tone rules in `review 24-9-2026.md` item 8: red only for what blocks the
  action being taken, a repair button wherever the fix is knowable, each issue
  said once (graph problems on the Upload tab are never a copy of Graph Health),
  and "not yet" is not a fault. A blocked Upload/Flash button goes grey (not
  green) and carries one sentence beneath it, its `aria-describedby`, from
  `src/utils/uploadBlockReason.ts`: the *first* thing in the way, ordered as the
  work is done (something to upload → trust → graph fixes → display images →
  size → the Build tools & port rows), with the action that clears it; that
  sentence replaces any separate graph or trust row, so a new blocker belongs in
  that ordering rather than in a line of its own.
  `MatrixOutputDeployPopup.test.tsx` mocks `validateGraph`, so a new export the
  popup imports from there must be added to that mock.
- A Graph Health card offers a button whenever Studio can know the fix
  (`GraphDiagnosticAction` plus a `GraphRepair` payload in `validateGraph.ts`,
  handled in `GraphHealthDrawer.tsx`'s `runAction`, performed by a store
  function in `graphStore.ts`): `movePartPinToFree` reuses `assignPartPins` (so
  a moved pin follows the board's safe list and keeps the role's capability),
  `connectShowOutput`, `addPatternCollectionTo`, `routeControlsToEngine` (a lone
  Controls wire into an LED output on a player build moves onto the engine's
  free Controls, which carries the same lamp commands; a wire into
  Enabled/Brightness stays advice), `connectTemplateControls`,
  `insertMapRangeOnEdge`, `placeTouchControl`. Every repair re-checks the graph
  before acting and reports "already changed" rather than a success it didn't
  have, writes hardware to the root graph, and is one undo. A fix that depends
  on intent (which job a control keeps, deleting a node, a supply rating) stays
  advice, and `open-board-settings` only navigates. `graphHealthRepairs.test.ts`
  holds `movePartPinToFree`, `connectShowOutput` and `addPatternCollectionTo` to
  clearing their own card; `insertMapRangeOnEdge`, `placeTouchControl` and
  `connectTemplateControls` keep their own pre-existing test files, and
  `repairJourney.test.tsx` runs `routeControlsToEngine` end to end against the
  real validator, deploy gate and drawer — blocked Upload to clear,
  locate-then-fix, and undo/redo — plus the Enabled/Brightness case that stays
  advice. Locate goes to the cause, not the neighbourhood: a card about a
  connection sets `edgeIds` (the drawer's **Show the wire** frames the ends and
  lights just those wires through `uiStore.locatedEdgeIds`, which outranks the
  selection's edge focus in `NodeGraphCanvas` until the next canvas click), and
  a card about a screen sets `screenDesignId` (**Open screen design**). The
  output- and display-firmware checks report plain strings, so
  `buildGraphDiagnostics` recovers their node from the message's leading `Name:`
  or `Name.Widget:`; keep that prefix on any new message those walks emit, or
  its card falls back to framing every output or display.
