# Validation and deploy

The deploy gate, Graph Health diagnostics and repairs, and the readings the
Upload tab shows on the way to a board.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

- A PowerAmplifier with no line-level source warns in every graph, including
  Music Player and hardware-only builds, when its board lacks a known DAC
  output. `powerAmplifierInputWarnings` shares the rule between Graph Health
  and `validateGraph`; a generated show's existing audio error takes precedence
  to avoid duplicate cards. `boardHasDacOutput` describes hardware capability,
  independently of `boardHasInternalDac`, which describes Studio's supported
  internal-DAC playback path. Do not treat PWM or ADC inputs as DAC outputs.
  The repair opens the Audio outputs shelf; adding a DAC or DFPlayer line
  output clears the warning. Each board's partition owns its audio source.

- Pin diagnostics open each affected part's Hardware wiring inspector instead
  of locating signal nodes. The split-I2C-bus card offers `move-i2c-pins` with
  a `Fix` button. `moveI2cPartsToBoardPins` rechecks the live root hardware,
  assigns the board's SDA/SCL pair atomically, and refuses unrelated pin
  claims. It leaves inactive RTCs, SPI displays and device addresses alone.
  On multi-board projects, board-wide repairs carry `boardId` in both the
  primary repair and alternative fixes. Keep their diagnostic ids distinct
  per board so merging cannot discard the second board's repair. Repairs
  allocate pins and check collisions only within the owning board's partition,
  then write those changes to the root graph. A deleted target board must
  refuse a stale repair instead of falling back to the primary board.
  Shared upload-target lookup lives in `src/build/boardUploadTargets.ts`.
  Keep this lookup independent of validation and code generation: importing
  those modules from the graph store can initialize the evaluator recursively.

- The RAM budget (`estimateFirmwareRam`, `findFirmwareRamBudgetIssue`) prices
  a show's collected patterns only when it is given the group registry. Pass
  `groups` at every caller. Without it a Pattern Collection costs nothing and
  a show that overflows DRAM reaches the linker. `collectionAllocations`
  mirrors `buildPatternRenderers`: scratch pooled at the largest pattern,
  persistent buffers, Frame Feedback rings and static state summed per pattern.

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
- Several boards: the root graph is validated one board at a time, never as a
  whole. `src/utils/multiBoardValidation.ts` runs `validateGraph` /
  `buildGraphDiagnostics` on each board's partition
  (`src/build/boardPartition.ts`) with that board's FQBN — its own
  `uploadTargets` entry, else the primary's, else the caller's default; the
  active board's is `uploadStore.selectedFqbn` (`boardFqbnTargets`) — and
  merges the lists: diagnostics by `id`, first board wins; messages by text. A
  finding more than one board reports (a shared signal node, or one no board
  reaches, which lands in every partition) is said once, unprefixed; one a
  single board reports gets a "Board N:" prefix (`boardLabel`, `boardNodesIn`
  order) once there are two or more boards. With one board the merged result
  is the one-board result exactly, which
  `multiBoardValidation.test.ts` holds against every starter. The Graph Health
  drawer calls `buildBoardDiagnostics` for the root graph (groups keep
  `buildGraphDiagnostics`). Three findings only the whole root graph can make
  are appended: `cross-board-<source>-<target>` (error, `connection`; a wire
  no board link can carry, from `findCrossBoardIssues`, titled by the type
  that cannot cross, "Audio cannot cross boards", with a fix naming what to
  move where, and `edgeIds` for the wire),
  `board-drives-nothing-<boardId>` (warning, `board`; no LED output and no
  attached sink — the per-board `missing-MatrixOutput` card and "Missing
  MatrixOutput node" message are dropped in its favour while any other board
  has an output; an empty project keeps the primary's "Nothing here yet"), and
  with `clockSync` on, `board-sync-network-<boardId>` (error: no Wi-Fi and no
  wired link — the Board is a network user while sync is on, so this is the
  Art-Net/NTP board gate said of it), `board-sync-credentials-<boardId>`
  (error: no wired link and `getNetworkCredentials(boardId).ssid` empty; not
  raised alongside the network error) and `board-sync-collection-<boardId>`
  (warning: a follower's first Pattern Collection in a different `patternIds`
  order from the leader's). Because `usesNetwork` counts a syncing Board, the
  one-board validators already refuse it a radio-less board and ask it for an
  SSID in the Art-Net node's words; `saidOfSyncingBoard` drops those from a
  syncing board's run (`<boardId>-board-network`, the "Board is missing its
  Wi-Fi SSID" warning, and the generic gate message only when the Board is
  the partition's sole network user) so each fault is said once, by name. The
  `network-config-*` card ids are keyed by message, not index, so two boards'
  different warnings do not collide in the merge. **A cross-board error belongs to both boards'
  deploy gates**: `findDeployBlockingErrorsForBoard(nodes, edges, boardId,
  fqbn, …)` is `findDeployBlockingErrors` on the partition plus the
  cross-board errors that touch that board and its own sync errors, and the
  Upload tab, which flashes one board at a time, must gate on it rather than
  on the partition alone. `readinessLayers` and `uploadBlockReason` stay pure
  counts, fed by that per-board list.
- Board links (`src/utils/boardLinkValidation.ts`, appended by
  `multiBoardFindings`; [board links](../../design/board-links.md)) are
  checked from `boardLinkSchema`, so a board is "linked" when it sends or
  receives a slot. Errors: `board-link-radio-<boardId>` (its FQBN fails
  `fqbnHasEspNow`, which unlike `fqbnHasWifi` excludes the UNO R4 WiFi;
  skipped while the FQBN is unknown, so another board's gate never guesses),
  `board-link-network-<boardId>` (two linked boards on Wi-Fi whose network
  owners' SSIDs differ; a board on wired Ethernet alone is off Wi-Fi; never a
  password), `board-link-slots-` / `board-link-text-<boardId>` (more than 64
  slots or 8 text slots sent; the sender's gate only) and `board-link-key`
  (no `linkId` on the primary or no key on this machine; every linked board's
  gate; repair `renew-board-link-key` re-checks for a key first, because a
  second key strands every board flashed with the first). Warnings:
  `board-link-channel-<boardId>` (a linked board off Wi-Fi beside one on it
  hears it only while the router uses the link channel) and
  `board-link-picture-<panelId>` (a linked TFT panel whose fixed layout,
  Now Playing or Show Status, draws the LED picture the link never sends).
  `estimateFirmwareRam`'s `radioBytes` adds `BOARD_LINK_WIFI_DRIVER_RAM_BYTES`
  on a partition holding a link node that is not already on Wi-Fi; the figure
  is a documented placeholder until the bench row measures it. The Upload tab
  notes, never blocks, a linked board whose upload target's `linkSchemaHash`
  (written on a successful project upload, not a one-off test sketch, and
  carried with the cached sketch for a re-upload) differs from the current
  hash: `boardLinkUploadNotes` in `src/state/upload/boardLinkFlash.ts`.
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
- `CapacityWatcher` publishes a capacity target as a `generate` function plus
  an `inputKey` fingerprint (root and per-subgraph `codegenSignature`, build
  options, identity tokens), never the sketch text. Generating the sketch for a
  large Pattern Collection walks every pattern and bakes their thumbnails —
  seconds of main-thread work — and doing it on each edit to keep a hashed-code
  staleness key current froze the editor on every change; only `check()` calls
  `generate`. The same freeze came from identity churn: `useGroupRegistry`
  rebuilt the registry whenever the open graph's `nodes` changed, which React
  Flow does on every click, cascading through `useCustomDisplayAssets` into
  fresh `errors`/`assets` arrays. The registry now ignores the root's nodes and
  keys an open subgraph on its codegen content, so it changes only on a real
  subgraph edit. Anything memoised on the registry must keep that property.
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
  the tone rules in `docs/plans/2026-09-24-app-review.md` item 8: red only for what blocks the
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
- SDVideo clip bytes live in IndexedDB (`sdVideoStore`), not the project; the node keeps only `properties.clip`. A moved project loses the bytes, so re-import. `findSdVideoErrors` blocks mixing SDVideo with the music player or show builds, which mount the card themselves. Design: [sd-video](../../design/sd-video.md).
  Pass the group registry: the same gate follows expanded groups and reachable
  collected patterns. An unused collection does not block a normal sketch.
- Wire time is one estimate, `estimateWireTime(rootNodes, rootEdges)` in
  `src/utils/wireTime.ts`, read by Graph Health and the readiness strip's
  **Frame** chip; every figure comes from `src/build/ledDrivers.ts`
  ([board capabilities](../../architecture/board-capabilities.md#led-drivers)).
  The Board's profile gives the family and FQBN. Each leading LED output (mirrors
  share a pin), each `dataLanes` lane (`ceil(leds / lanes)` LEDs) and both rails
  of a wired Stereo VU Meter is one output; HUB75 is left out. Clockless outputs
  are list-scheduled, longest first, over `ledOutputConcurrency(facts, driver,
  …)` slots, because FastLED's RMT5 engine queues every output and starts each
  on the first free channel. On RMT chips the slots are every channel that fits
  single-buffered with no network (FastLED drops to one block a channel under
  memory pressure rather than refuse one), and `rmtOutputsThatFit` at the
  network rate, at least one, once `networkSourceIn` finds a Wi-Fi or Ethernet
  user (FastLED's network channel reduction). The IR receiver's RX symbols
  (`IR_RMT_RX_SYMBOLS`) come out of that pool only where it captures through
  RMT and RX shares TX memory; today the capture runs only on the S3, whose RX
  memory is separate, so the share is zero. Clocked outputs send at
  `effectiveDataRateMhz` and are added one after another, a conservative
  reading. `ledOutputConcurrency` uses the selected Board `ledDriver`'s
  `parallelOutputs` when one is chosen; an RMT driver's count is also capped by
  available RMT memory. `auto` uses the board family's default driver facts.
- When the wire time exceeds the Board's frame period, `wireTimeAdvice` gives
  a `warning` (a suggestion, never an error or a deploy gate) naming the frame
  rate the graph reaches. Its fixes come only from `wireTimeFixes`, in order:
  **Lower to N fps** (`set-frame-rate`, `setBoardFrameRate`), then **Clock at N
  MHz** for each clocked output with a faster rate (`set-data-rate`,
  `setOutputDataRate`), then **Split across N pins** for each clockless output
  (`split-across-pins`, `splitOutputAcrossPins`), offered only when the driver
  sends more than one output at once, for a lane count on whole rows or panels
  that `splitAcrossPinsForGraph` can give free output pins; it asks for enough
  lanes to fit the frame period, capped at the driver's concurrency. The first
  is the card's `action`; the rest are `moreFixes`, one drawer button each, so
  a parallel driver is appended there too, not as a separate card. Each repair only moves the
  figure the safe way, re-checks the root graph and reports "already changed".
  With a network up on an RMT board, `wire-time-rmt-network` says the outputs
  take turns because they want more RMT memory than the chip has.
