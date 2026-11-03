# App review — 3 November 2026

Review of the `Hardware` branch at `3219e6e7` by three read-only code audits
(unpolished features, workflow confusion, visual design) plus a pass through
the running app at 1600 px. Paths are relative to the repository root. Items
are ordered by suggested attack order: small code with the biggest confusion
first, then mechanical visual cleanup with a large payoff, then larger
identity work. Tick an item when its outcome is recorded.

Abbreviations: NGC = `src/components/Canvas/NodeGraphCanvas.tsx`,
SB = `src/components/Sidebar/Sidebar.tsx`, HP = `src/components/Hardware/HardwarePane.tsx`,
DP = `src/components/Upload/MatrixOutputDeployPopup.tsx`,
MB = `src/components/MenuBar/MenuBar.tsx`, WZ = `src/components/Upload/MatrixOutputSetupWizard.tsx`.

## 1. First run and single sources of truth

- [x] **Starters land on the Hardware tab with the preview closed.**
  Outcome (3 Nov): `finishStartFlow` now calls `showGraphWithPreview` and
  `revealGraphNodes` for every starter and help example; Blank Canvas alone
  still lands on Hardware.
  Problem: `src/utils/startFlow.ts:67` sets the workspace to `hardware` and
  `startTemplate` (`startFlow.ts:79-94`) only calls `requestFitView`, never
  `setWorkspaceMode('graph')`; `uiStore.ts:179-184` keeps the preview panel
  closed on Hardware. Picking "Start with Juggle" shows an empty bench; the
  only cue is a 1.8 s flash on the Graph tab (`WorkspaceTabs.tsx:37-53`).
  Fix: a starter or example load switches to Graph and opens the preview.
  Hardware-first only for Blank Canvas.

- [x] **First visit leaves an empty "New Project" behind.**
  Outcome (3 Nov): `beginStartProject` reuses a blank, default-named open
  project (renamed to the starter, uniquely) instead of creating a second
  one; a blank canvas keeps the project's own name.
  Problem: `App.tsx:271-276` creates a default project before the gallery
  opens; `startFlow.ts:131-148` then creates a second project for the starter.
  The empty one stays in File > Recent Projects.
  Fix: open the gallery before creating any project, or reuse the empty
  current project for the starter.

- [x] **LED output is configured in three places.**
  Outcome (3 Nov): the node is the one editor of count, form, chipset and
  colour order. The wizard's Geometry and LEDs steps are read-only with "Edit
  on the Graph"; the bench inspector prints the same line with the same link
  and keeps pins and lanes. The wizard still opens from Upload and the guide
  strip; a Setup entry on the bench part was not added.
  Problem: the node body, the Setup wizard (`WZ:269-276, 433-443`: count,
  chipset, colour order) and the bench inspector (`HP:1117-1135`: pins and
  lanes) all edit the same output; the wizard's pin is read-only with
  "Edit in Hardware" (`WZ:448-459`); the wizard opens only from Upload
  (`DP:700-709`) or the guide strip. "Where do I set my LED count?" has three
  answers.
  Fix: one LED-output editor reachable from the bench part, the node and
  Upload; the other two become read-only links to it.

- [x] **Board choice exists in three editors and two silently revert.**
  Outcome (3 Nov): the Board & Port popup and the wizard lost their board
  selects (and the popup its Platform select); both print the Board node's
  profile and offer "Change board in Hardware", which opens the Board menu.
  Problem: the Board node sets profile and FQBN
  (`src/components/Canvas/bodies/BoardNodeBody.tsx:95-102`); the Board & Port
  popup sets only FQBN (`src/components/Upload/BoardPopup.tsx:293-306`); the
  wizard picks a raw FQBN (`WZ:195-199`); `App.tsx:407-408` snaps the FQBN
  back to the Board node's profile, so the popup and wizard appear to do
  nothing.
  Fix: the Board node is the single source; the popup and wizard open the
  Board menu instead of their own selects.

- [x] **Status bar shows the wrong size and ignores the active board.**
  Outcome (3 Nov): Size and Chip read the active board's partition
  (`boardPartitionOf`); size comes from the shared `outputSizeLabel`
  ("60 LEDs" / "16 × 16"); "No LED output" when there is none.
  Problem: `src/components/StatusBar/StatusBar.tsx:48-54, 111` prints
  `width x height` of the first `MatrixOutput`, so a 60-LED string reads
  "16 x 16"; `activeBoardId` is never read, so a multi-board project describes
  whichever output is first in the node array. Uses ASCII "x" where the rest
  of the UI uses "×".
  Fix: derive the size through `shapeLayoutFor` for the active board's
  output, print "60 LEDs" for chains, use "×".

- [x] **Preview header says "Output matrix" for every form.**
  Outcome (3 Nov): the header prints "LED String · 60 LEDs", "LED Matrix ·
  16 × 16", prefixed "Route N · " with several outputs. `MatrixSizePopup`'s
  "Custom matrix size" is left: it opens only for grid forms. The library
  label "LED Matrix" is the default form's title, so it stays.
  Problem: `src/components/Preview/LEDPreview.tsx:1429` is a constant;
  `MatrixSizePopup.tsx:41` says "Custom matrix size"; the node is labelled
  "LED Matrix" (`src/nodes/output/definitions.ts:87`) while 56 copy sites say
  "LED output".
  Fix: print the form label, for example "Output string · 60 LEDs".

- [x] **Code identifier leaks into user copy.**
  Outcome (3 Nov): `validateGraph` and `multiBoardValidation` say "LED output
  is missing"; the `missing-MatrixOutput` id is unchanged; Graph Health says
  "I2C".
  Problem: `src/utils/validateGraph.ts:4971` pushes "Missing MatrixOutput
  node"; `src/utils/multiBoardValidation.ts:58, 62, 225` likewise. These reach
  the Upload blocker list (`DP:301-303`). CLAUDE.md says "LED output".
  Also `GraphHealthDrawer.tsx:426` says "I2c".
  Fix: message "LED output is missing" (Graph Health already uses that title
  at `validateGraph.ts:3912`); keep the id as the stable key; fix "I2C".

## 2. Half-finished features

- [x] **Analog RGB Strip is half a node.**
  Outcome (3 Nov): `AnalogStripOutput` evaluator publishes the dimmed colour
  and a node body paints it; the manifest draws it as a three-pin
  `analog-strip-output` MOSFET item (gate pads R/G/B, ground, no controller
  supply) in the Controls section; `resolveBuildMode` counts an analog strip
  (`analogOutput`) and a fed Frame Stream (`streamOutput`) as buildable, and
  `validateGraph` reads the same capabilities. Frame Stream keeps no preview
  by design (its help says so).
  Problem: definition and emitter exist (`src/nodes/output/definitions.ts:679-692`,
  `codegen.ts:1002`) but there is no evaluator, so the preview draws nothing;
  it is in neither `BUILD_DIAGRAM_SUPPORTED_NODE_TYPES`
  (`src/build/hardwareManifest.ts:170-215`) nor `isHardwareNodeType`
  (`src/build/hardware.ts:69`), so it never appears on the wiring sheet although
  help says to wire each GPIO to a MOSFET gate; `validateGraph.ts:4966-4971`
  and `src/state/upload/buildMode.ts:275` count only `MatrixOutput`, so a graph
  built only from it is refused. Frame Stream has the same gaps.
  Fix: evaluator that paints a colour row from its `color` input; add it to
  the manifest and diagram as a 3-pin MOSFET item; count it as a buildable
  sink, or give a dedicated diagnostic instead of the generic missing-output
  error.

- [x] **Dead 12 V voltage branch.**
  Outcome (3 Nov): both deleted. The manifest emits the constant
  `ONE_WIRE_NOMINAL_VOLTAGE`; the planner's unreachable 12 V warning is gone.
  WS2815 stays refused by name in `BUILD_DIAGRAM_5V_ONE_WIRE_CHIPSETS`.
  Problem: `src/build/hardwareManifest.ts:244` returns
  `chipset === HUB75_CHIPSET ? 5 : 5`, so the warning at
  `src/build/power/electricalPlan.ts:878-884` ("12 V output generation is not
  supported yet") can never fire; WS2815-class strips are modelled nowhere.
  Fix: return the real nominal voltage per chipset and let the planner refuse
  with that warning, or delete both.

- [x] **Theme and preview style can only be cycled.**
  Outcome (3 Nov): the View menu lists three themes and six preview styles as
  `menuitemradio` items through `setTheme` / `setPreviewStyle`; the toolbar
  style button still cycles. `cycleTheme`, `toggleStageMode`, `clearStatus`
  and `openBuildDiagram` deleted with their dead tests.
  Problem: `MB:868-875` is one button cycling three themes; `MB:1083-1088`
  cycles six preview styles. `setTheme`, `setPreviewStyle`, `toggleStageMode`,
  `clearStatus` and `openBuildDiagram` in `uiStore.ts` have no callers.
  Fix: radio lists in the View menu using the existing setters; delete or wire
  the dead actions.

- [x] **Radio Stations group is mounted disabled on every Music Player.**
  Outcome (3 Nov): the group is mounted only while Music Source is Internet
  Radio, like its property rows; the source field's help already names it.
  Problem: `src/components/Canvas/StudioNode.tsx:924-930` mounts
  `RadioStationsBody` with `disabled` unless the source is Internet Radio; an
  SD or Bluetooth player carries a greyed station list with no explanation.
  Fix: hide the group unless the source is Internet Radio, or add one line
  "Set Music Source to Internet Radio to use these".

- [x] **Build Diagram exports go dark without saying why.**
  Outcome (3 Nov): one sentence beside the export buttons and in the sheet
  header. Section 1 made `App.tsx` snap the Upload target to the Board node's
  profile, so the reachable reason is now "no board chosen"; the mismatch
  wording covers only the render before that snap, so no "Use board's
  profile" action was added.
  Problem: `src/components/BuildDiagram/BuildDiagramWorkspace.tsx:1196-1199,
  1239-1242` disable Export SVG, Print, Connections CSV and BOM CSV when
  `exactBoard` is undefined, which happens whenever the Board node's profile
  and the Upload FQBN disagree; the copy above talks about draft versus
  reference, not the mismatch.
  Fix: one sentence beside the buttons ("Exports need the Board node and the
  Upload board to agree: Board is X, Upload is Y") with a "Use board's
  profile" action.

- [x] **"Changed elsewhere" tab flash is hard-wired to the Graph tab.**
  Outcome (3 Nov): per-tab signals in `useChangedElsewhere`: the active
  graph's node count flashes Graph; the root graph's part count flashes
  Hardware, Build Diagram and Upload. Upload has no deploy-property signal:
  every graph edit changes the sketch, so that flash would never stop.
  Problem: `src/components/Layout/WorkspaceTabs.tsx:37-52` keys on root node
  count only and always flashes Graph; adding a part on Hardware never flashes
  Build Diagram or Upload.
  Fix: per-tab change signals (parts count to Hardware and Build Diagram,
  deploy-relevant props to Upload), or drop the flash.

- [x] **Ratings, Studio Score and tags look like playback inputs but nothing plays by them.**
  Outcome (3 Nov): relabelled. Insights' kicker is "Library sorting" and its
  header says score, stars and Best displayed on sort the library and the
  collection picker and that no show plays by them. Stars stay: the picker's
  "Mine" sort and the sidebar badges read them. An engine-side "Prefer
  higher-rated" would need the pick rule and its C++ twin to read a
  per-machine store; not done.
  Problem: `src/components/PatternRatings/PatternRatingsPopup.tsx:147-171`
  shows stars, score, intent and "Best displayed on"; the only consumers are
  the collection picker sort and sidebar badges; no import under
  `src/state/player`; slideshow order uses collection weight and energy tags
  (`docs/design/show-sequencing.md:11-15`).
  Fix: either let engines read rating and tags (for example a "Prefer
  higher-rated" toggle) or relabel Insights as a library sorting tool and drop
  the stars from the critic.

- [x] **Some upload gates surface only after pressing Upload.**
  Outcome (3 Nov): a drifted SD show is a `blockingErrors` entry, so Upload is
  disabled with the reason in its title before a press; the handler check
  stays as a backstop. The capacity meter already measured the player
  (`buildShowPlayerForMeasurement`) — the stale comment in `uploadStore.ts`
  said otherwise and is corrected; the pre-flash fit check remains for a
  meter not yet run. Copy is now "Connect a pattern to the LED output".
  Problem: `DP:530-533` sends a stale SD-show packaging error to the status
  bar; `src/state/upload/uploadStore.ts:920-958` reports "The player will not
  fit on this board" only in the console mid-upload, and the capacity meter
  never measures the player; `DP:656` tooltip says "Connect a frame to enable
  upload".
  Fix: fold these into the "Getting to your board" readiness layers
  (`ReadinessLayers.tsx:44`) before Upload is enabled; say "Connect a pattern
  to the LED output".

- [x] **In-app support claims are stale.**
  Outcome (3 Nov): Help derives the paragraph from the matrix
  (`src/utils/supportMatrix.ts` parses the two Supported tables from a `?raw`
  chunk; a test reads the real file). "(experimental)" on the Bluetooth and
  Internet Radio music sources and a chip on the several-boards sync toggle,
  from `src/utils/experimentalFeatures.ts`. No per-part chips: the matrix has
  no per-part rows, so a part is experimental by default and a chip on every
  part would say nothing.
  Problem: `src/components/HelpModal/HelpModal.tsx:823` enumerates validated
  hardware that `docs/release/beta-support-matrix.md:21-58` has since
  extended; "experimental" badges exist only on about eight board labels
  (`src/state/upload/uploadStore.ts:150-188`), none on Bluetooth, fleet sync,
  Internet Radio or any part, although the CHANGELOG ships them as
  experimental.
  Fix: generate the Help paragraph from the matrix, or link to it; add an
  "Experimental" chip to the Music Source options, the fleet sync toggle and
  any part whose matrix row is experimental.

- [x] **Docs drift.**
  Outcome (3 Nov): Segment networks ticked; the mixed-wiring question moved
  to Resolved with the warning named; the HUB75 chain-order caveat is in the
  LED output's help `propertyNote`.
  Problem: `docs/plans/pattern-node-expansion.md:505` leaves Segment networks
  unchecked while `todo.md` lists D-06 as shipped;
  `docs/design/collection-driven-performance.md:341` still calls an
  implemented warning an open question (`validateGraph.ts:4882-4892`);
  `docs/design/hub75-output.md:230-236` records a chain-orientation caveat
  that the in-app HUB75 help never mentions.
  Fix: tick or strike the two resolved items; add the HUB75 chain caveat to
  the node's help entry.

## 3. Workflow and copy

- [x] **Five overlapping view modes with different exits.**
  Outcome (3 Nov): Edit, Focus and Stage share one View radio group; the Deck
  stays independent. Keyboard shortcuts also keep Focus and Stage exclusive.
  Focus has a status-bar exit; Stage keeps its existing visible exit. All four
  workspaces appear as radio items, Build layout is Balanced, and Pause Eval
  is Freeze preview, with enough width for its label.
  Problem: four workspace tabs, plus Focus (F9, hides the tabs,
  `App.tsx:718`), Deck (F8) and Stage (F10, Esc, double-click cycle,
  `LEDPreview.tsx:304-310`), plus View > Layout presets Build/Tune/Preview
  (`MB:926-931`), plus View > Workspace with a single "Build Diagram" checkbox
  (`MB:915-924`) duplicating a tab, so "Build" means two things. The display
  editor hides the sidebar and preview on its own (`App.tsx:135-141`). Escape
  does something different in each layer (`App.tsx:564-590`). "Pause Eval"
  sits beside the show players' own play.
  Fix: one View control (Edit · Focus · Stage) with a visible exit chip in the
  status bar; remove the View > Workspace section or list all four tabs as
  radio items; rename the "Build" layout preset; rename Pause Eval to "Freeze
  preview".

- [x] **Helper offline says that, never how.**
  Outcome (3 Nov): shared build-tools guidance distinguishes a page served by
  the desktop build tools from a source checkout. Upload and Board & Port
  explain launcher restart or the source command, with a retry action.
  Problem: `DP:320-329` shows only "Browser uploads need the local helper
  running on this machine" and Retry; `src/components/Upload/BoardPopup.tsx:185`
  tells every user to "start the dev server, or run npm run helper", which
  desktop and portable users cannot do; `HelpModal.tsx:616` already explains
  that the portable build starts the helper itself.
  Fix: an inline "Build tools are not running" card that branches on bundle
  versus source checkout; call it "build tools" everywhere, as the guide strip
  does (`firstProjectSteps.ts:89`).

- [x] **Toolchain jargon on the Upload tab.**
  Outcome (3 Nov): the compiler picker is under Build tools & port > Advanced;
  readiness says compiler and board support package, and cached uploads say
  firmware. FQBN remains in the custom-board form.
  Problem: engine buttons read "fbuild" and "arduino-cli" (`DP:711-736`);
  copy says "needs the … core installed" (`DP:398`), "FQBN"
  (`BoardPopup.tsx:241`), "Re-upload last sketch" (`DP:922-1037`),
  "arduino-cli not found" (`ArduinoCliPopup.tsx:23`).
  Fix: engine picker under "Build tools ▸ Advanced"; say "board support
  package" and "firmware"; show FQBN only in the custom-board form.

- [x] **"Trust" is surfaced four times for one decision.**
  Outcome (3 Nov): the banner asks “Run code from this file?” once. Load and
  Upload no longer open another confirmation; Upload waits for unfamiliar
  code and its Review question button focuses the banner without granting
  permission. The same gate includes an open nested pattern. Safe shared
  content needs no decision, and the pattern critic keeps its separate
  per-pattern decision because it runs outside the workspace.
  Problem: confirm dialog (`src/utils/trustPrompt.ts:45-50`), banner
  (`TrustBanner.tsx:300-305`), a second confirm on Upload (`DP:552-561`,
  "Upload code made on another computer?"), an inline row (`DP:894-900`) and
  sidebar copy (`SB:1195`).
  Fix: one decision point (the banner) that also satisfies upload; copy "Run
  code from this file?" instead of "trust".

- [x] **Graph Health never says it blocks upload and opens only from Upload.**
  Outcome (3 Nov): the drawer is Checks, its error filter says Blocks upload,
  and arriving on Upload with blockers opens it, including a remount after
  Build Diagram. Closing it is respected until the next arrival.
  Problem: `GraphHealthDrawer.tsx:384` filters "Everything / To fix /
  Suggestions"; the drawer is closed by default and persisted
  (`uiStore.ts:567`); auto-open only from `DP:313-315`; categories such as
  "Preview parity", "GPIO" and "Board" sit under the heading "Graph health".
  Fix: rename to "Readiness" or "Checks"; label the first group "Blocks upload
  (N)"; auto-open on the Upload tab when blockers exist.

- [x] **Pattern → Collection → Slideshow is three unsignposted steps.**
  Outcome (3 Nov): the library selection menu offers New collection, played
  by Slideshow, Music Player or Generator, and wires the player to the
  collection and an unambiguous free LED output. Collected rows identify
  library copies and offer Update from library when content changes; nested
  groups compare correctly after registration renames their ids. Updates
  preserve show weights and tags and hold unfamiliar executable content.
  Problem: creating a collection adds only the collection node
  (`src/state/graphStore.ts:3506-3542`); the slideshow must be found under
  "show" and wired twice; help promises fewer steps
  (`HelpModal/reference/show.ts:275-283`); patterns are cloned into the
  collection (`graphStore.ts:3522-3527`) so later library edits do not follow,
  and nothing says so.
  Fix: "New collection" offers "…and play it with: Slideshow / Music Player /
  Generator" and auto-wires to the LED output; add a "copied from library"
  badge with "Update from library".

- [x] **Hidden ways to add nodes; the empty canvas names none of them.**
  Outcome (3 Nov): the empty canvas names double-click, Ctrl+K and library
  dragging, and the first library category opens on an empty graph without
  replacing the remembered category preference.
  Problem: double-click (`NGC:885-894`), Ctrl/Cmd+K (`NGC:898-912`),
  drag-wire-to-empty (`NGC:709-745`) and right-click "Add Node" exist; the
  empty-canvas screen (`NGC:1311-1340`) offers only starters; every library
  section is collapsed on an empty graph (`SB:884-886`).
  Fix: empty canvas line "Double-click or press Ctrl+K to add a node · drag
  from the library"; expand the first category by default.

- [x] **No path from a node to its help entry.**
  Outcome (3 Nov): Help for this node opens its Node Reference entry from
  the context menu. Header tooltips mention the action. The menu checks the
  node registry, keeping the help reference data lazy-loaded.
  Problem: `StudioNode.tsx:1561-1563, 1595` give a header tooltip only;
  `NodeContextMenu.tsx:198-255` has no Help item; the reference can only be
  opened to a node from inside itself (`NodeReference.tsx:690`).
  Fix: "Help for this node" in the node menu, or a "?" in the header that
  opens Node Reference at that node.

- [x] **Shelf hides the controller and LED outputs last, collapsed.**
  Outcome (3 Nov): the shelf begins with Controller and LED outputs, opens
  LED outputs by default, and the empty-bench board caption explains the
  controller hint: “Click the board to choose it”.
  Problem: `src/components/Hardware/hardwareShelfModel.ts:171-239` orders LED
  outputs eighth of eight; all categories collapsed on a blank project
  (`HardwarePartsShelf.tsx:49-53`); the only cue on the bench is a pulsing
  ring with no text (`HP:737-748`).
  Fix: "Controller" and "LED outputs" first and open on a blank bench; label
  the rings ("Click the board to choose it").

- [x] **Build Diagram is unreachable by signpost.**
  Outcome (3 Nov): a populated bench links to See wiring diagram; diagram
  gates describe the specific board model rather than an exact profile.
  Problem: no "Build Diagram" string under `src/components/Hardware` or
  `src/components/Upload`; `BuildDiagramWorkspace.tsx:1214-1215, 1269-1275`
  gate on "an exact board profile".
  Fix: after a board is chosen the bench shows "See wiring diagram →"; say
  "the specific board model (e.g. ESP32 DevKit V1)" instead of "exact board
  profile".

- [x] **Switching the active board changes the bench and Upload but not the canvas or status chips.**
  Outcome (3 Nov): nodes outside the active board's partition dim on the root
  canvas. Status counts follow that partition and the board chip names its
  ordinal; counts inside an open pattern still describe that pattern.
  Problem: `HP:93-102` applies the partition to bench, Build Diagram and
  Upload only; the canvas shows all boards; status chips read the first
  output (`StatusBar.tsx:48-54, 110-111`).
  Fix: dim non-active-board nodes on the canvas and make the chips follow the
  active board, or label them "Board 1".

- [x] **Display editor Run / Enabled / Custom design gate.**
  Outcome (3 Nov): Create screen design selects Custom design itself; a
  retained design can be reopened directly. The editor says Try it live
  and shows whether the mounted panel is enabled, off or controlled by a wire.
  Problem: `TransportDisplayNodeBody.tsx:123-147` says "Set Layout to Custom
  design to edit"; `DisplayEditor.tsx:1055-1061` "Run" leaves the editor and
  floats a window; the "Enabled" input (`output/definitions.ts:486-500`) is
  never shown in the editor; `uiStore.ts:500-503` keeps the overlay "open"
  invisibly off the Graph view.
  Fix: "Create screen design" sets Layout to Custom itself; rename Run to "Try
  it live"; show the Enabled state in the editor header.

- [x] **Vocabulary drift.**
  Outcome (3 Nov): the library and status bar use nodes and wires, collection
  and help copy name saved patterns, and the toolbar, menu, gallery, empty
  canvas, Checks and README consistently point to the Start Gallery.
  Problem: group / pattern / patch / module / rack used interchangeably
  (`GroupControls.tsx:85`, `NGC:606`, `StatusBar.tsx:92-93` "N modules / N
  patches" for nodes and edges, `SB:1265-1275` "Patch rack", "Find module");
  Start / Starter Templates / Start Gallery / starter patch name one dialog
  (`MB:983`, `MB:1023`, `TemplatesPopup.tsx:187`, `validateGraph.ts:3901`,
  `README.md:34`).
  Fix: nodes are nodes, wires are wires, a Group becomes a "saved pattern"
  when saved; one name, "Start Gallery", in the toolbar, File menu, Graph
  Health, docs and empty canvas.

Section 3 validation (3 Nov): production build and lint pass. The full suite
passes 8,989 tests, with 136 skipped, across 555 passing test files. All 414
tests in changed test files also pass; the final remembered-search regression
passes separately. Browser checks cover view shortcuts and exits, workspace
menu choices, Upload guidance and the Checks drawer.

## 4. Visual cleanup (mechanical, large payoff)

- [x] **Ten theme tokens are used but never defined.**
  Problem: `--danger`, `--surface-recessed`, `--good`, `--warn`, `--bad`,
  `--bg-deep`, `--bg-canvas`, `--status-error`, `--text-muted` are used with
  hard-coded dark fallbacks across `StudioNode.module.css`, several node
  bodies, `PatternRatingsPopup.module.css:282`,
  `DisplayEditor.module.css:291, 887`, `AppDialogHost.module.css`;
  `tokens.css` defines `--error`, `--success`, `--warning` instead.
  Fix: alias the stray names in `src/themes/tokens.css` or rename at the use
  sites; add a test that every `var(--x)` in `src/**/*.css` is defined.
  Done: the stray names are aliases in `tokens.css`; `src/themes/__tests__/definedTokens.test.ts` fails on any `var(--x)` nobody declares.

- [x] **Colour bypasses tokens; Light and Solarized themes cannot work.**
  Problem: 240 distinct hex literals in module CSS, `rgba(255,255,255,…)`
  377 times, `rgba(0,191,255)` 50 times, `#9ce8ff` 17, `#ff5e9d` 12; zero
  `[data-theme]` overrides in any module file while the menubar, status bar,
  canvas, popups and DisplayEditor hard-code dark (`MenuBar.module.css:4-5`,
  `StatusBar.module.css:3-4`, `NodeGraphCanvas.module.css:13-15`,
  `DisplayEditor.module.css:7`, `BuildDiagramWorkspace.module.css:802`).
  Fix: either drop Light and Solarized from `tokens.css:207-237` or tokenise;
  add one chrome accent (`--accent-ui`, suggest the brand cyan `#5ad1ff`,
  already the most-used literal) and `--accent-ui-text`; forbid raw hex in
  modules with stylelint.
  Done: no hex in any module file (stylelint `color-no-hex`, `npm run lint:styles`, in CI); fixed illustrative colours live in the `--paint-*` palette in `tokens.css`; chrome uses `--accent-ui`/`--accent-ui-text`. Light and Solarized stay, overriding structural tokens only.

- [x] **Glow as the default.**
  Problem: 119 `box-shadow: 0 0 Npx` halos and a token literally named
  `--border-glow`: menu dropdown bloom (`MenuBar.module.css:169`), logo
  drop-shadow (`:50`), hover glow on plain buttons (`:241`), popups
  (`ProjectsPopup.module.css:31`, `TemplatesPopup.module.css:41`,
  `Upload.module.css:697`), sidebar glyph inner glow (`Sidebar.module.css:436`),
  status indicator (`StatusBar.module.css:36`), selected node
  (`StudioNode.module.css:128-131`).
  Fix: glow only on things that emit light: LED preview, wire packets,
  ambilight, record dot, VU. Rename `--border-glow` to `--line`.
  Done: `--border-glow` is `--line`; the remaining `box-shadow: 0 0` halos sit on the live dot, record dot, standby blink, DMX and transport indicators.

- [x] **Ambient decoration loops.**
  Problem: 79 `radial-gradient` and 14 infinite idle keyframes. The canvas
  stacks signalField, fieldLattice, fieldOrbits, cursorWake, fieldScan and
  focusVeil (`NodeGraphCanvas.module.css:53-159`), a 28 px ghost frame
  (`:93-103, :241-249`), an orbiting beacon (`:481-518`) and a travelling
  "dormant signal" (`:403-448`); all duplicated on the bench
  (`HardwarePane.module.css:75-134`); the visualizer has a CRT scanline and
  220 ms flicker loop (`LEDPreview.module.css:817-857`); the logo twinkles and
  shine-sweeps (`:1311-1383`); the Upload tab shows a purple radial bloom
  while loading.
  Fix: delete orbits, frame, scan, beacon, dormantSignal, flicker and
  brandShine. Keep a plain dot grid, the cursor wake if cheap, and the
  data-driven `.signalAura` on nodes.
  Done: orbits, ghost frame, scan, beacon, dormant signal, CRT flicker and brand shine are gone; the dot grid, cursor wake and data-driven `.signalAura` stay. The bench keeps its one-shot controller hint ring, which leaves on the first click.

- [x] **Glassmorphism.**
  Problem: `backdrop-filter` 15 times: empty-state card
  (`NodeGraphCanvas.module.css:272`), HUD chips (`LEDPreview.module.css:401,
  426, 578`), stage header (`:127`), sidebar and preview handles
  (`App.module.css:195, 283`), node performance badge
  (`StudioNode.module.css:151`), `GroupControls.module.css:22`,
  `BoardPinoutPicker.module.css:9`.
  Fix: opaque `--bg-panel`; keep blur for the fullscreen stage overlay only.
  Done: no `backdrop-filter` left; panels are opaque `--bg-panel`.

- [x] **Gradient active buttons and the rainbow.**
  Problem: `MenuBar.module.css:307, 318, 373, 384` use a 135° accent gradient
  plus glow for active states; `:395` `.btnStyleActive` is
  `linear-gradient(135deg, #8a4dff, #ff5e9d 58%, #00f0ff)` with a pink glow;
  the visualizer glow bar is cyan→purple→pink (`LEDPreview.module.css:802`);
  node bodies carry ten per-category gradient or stripe textures
  (`StudioNode.module.css:293-350`) that read as noise at canvas zoom.
  Fix: active = flat accent fill with dark text; delete the `.btnStyleActive`
  gradient; node body = flat `--bg-node`.
  Done: active states and the Upload, Deck and transport buttons are flat fills; `.btnStyleActive` and the glow bar gradients are gone; node bodies are flat `--bg-node`.

- [x] **Pill radius on everything.**
  Problem: `border-radius: 999px` 93 times across 24 files, 30 distinct radii
  overall: every toolbar button (`MenuBar.module.css:225`), the live-tools
  housing (`:294`), the search input (`Sidebar.module.css:109`), chips
  (`:51, 89, 384, 467, 506`), status bar (`StatusBar.module.css:42, 87`), the
  node header tag (`StudioNode.module.css:272`), `Upload.module.css` 17 times.
  Fix: three radius tokens (3 px inputs, buttons, tags; 6 px nodes, cards;
  10 px dialogs). Round only LED and status dots. Toolbar buttons rectangular.
  Done: `--radius-control` 3 px, `--radius-card` 6 px, `--radius-dialog` 10 px; no `999px`; `50%` only on dots and round controls.

- [x] **Hover lift.**
  Problem: `translateY(-1px/-2px)` in `AppDialogHost.module.css:131`,
  `NodeGraphCanvas.module.css:367`, `Sidebar.module.css:659`,
  `TemplatesPopup.module.css:170`, `NewProjectPrompt.module.css:99`,
  `NodeReference.module.css:283`; `BeatDetectBody.module.css:84` scales 1.04.
  Fix: hover = border or text colour only.
  Done: no `translateY` or `scale` on hover; hover changes border or text colour.

- [x] **No spacing scale in practice.**
  Problem: `--space-*` used 62 times against about 1400 literal px paddings
  and gaps; 20 distinct `gap` values.
  Fix: 4 px base tokens; stylelint disallows literal px on padding, gap and
  margin.
  Done: `--space-0..5` on a 4 px base; stylelint rejects literal px on `padding`, `gap` and `margin`.

- [x] **Micro tracked-caps mono everywhere.**
  Problem: 141 declarations at 8 px or 9 px, 161 `text-transform: uppercase`,
  220 `letter-spacing`; `--font-code` used 245 times against `--font-body`
  37. Menu items are 11 px uppercase mono (`MenuBar.module.css:180-184`),
  sidebar tags 8 px (`Sidebar.module.css:504-513`), status chips 10 px
  (`StatusBar.module.css:39-47`), Upload kicker 9 px (`Upload.module.css:38-44`).
  Fix: floor 11 px; tracked caps only for section kickers; menus, list items
  and buttons in Inter 12–13 px sentence case; mono only for values, pins and
  code with `font-variant-numeric: tabular-nums`; Audiowide only for the
  wordmark and the four workspace tabs; add `--fs-label: 11px` and
  `--fs-ui: 13px`.
  Done: nothing below `--fs-label` 11 px except SVG pin labels; `--fs-ui` 13 px for menus and buttons in Inter; mono kept for values, pins and code; uppercase only on section kickers.

- [x] **Node header is a full-saturation sticker.**
  Problem: inline `background: accent` with `color: #000`
  (`StudioNode.tsx:1595`), Audiowide 14 px with ellipsis and a coloured drop
  shadow (`StudioNode.module.css:158-169`).
  Fix: dark header with a 3 px left rule (or 2 px top bar) in the category
  colour; title Inter 600 12 px `--text-primary`. Category stays obvious from
  the rule, the wire colour and the sidebar.
  Done: dark header with a 3 px left rule in the category colour, title Inter 600 12 px.

- [x] **Fifteen accents, none of them the UI's.**
  Problem: a hue wheel at 24° steps, all `hsl(h,100%,60%)`
  (`tokens.css:132-148`); signal `#33ff33`, math `#33ff85` and audio
  `#85ff33` are indistinguishable on wires; chrome borrows category colours at
  random: focus ring and sidebar focus are output magenta (`tokens.css:271`,
  `Sidebar.module.css:127`, `App.module.css:209`), the primary dialog button
  and help tabs are audio green (`AppDialogHost.module.css:110`,
  `HelpModal.module.css:79`), the guide is pattern colour
  (`FirstProjectGuide.module.css:49`), the workspace tab underline is
  `--accent-color` (`WorkspaceTabs.module.css:66`).
  Fix: at most eight category hues at about 80 % saturation, spaced for
  discrimination, set once in `nodeLibrary.ts CATEGORIES` and tokens; one UI
  accent for every interactive-chrome state.
  Done: category hues sweep the wheel in sidebar order at 80 % saturation (the sweep was kept at Steve's request on 4 November) in `CATEGORIES` and `tokens.css`; focus rings, primary buttons, tabs and guides use `--accent-ui`.

- [x] **Dialog family cloned with drift.**
  Problem: `fadeIn` defined nine times and `slideUp` seven (AppDialogHost,
  HelpModal, NewProjectPrompt, PatternRatings, Projects, Recover, Templates,
  Upload, RecordPopup); the overlay cyan spotlight repeated
  (`ProjectsPopup.module.css:5`, `TemplatesPopup.module.css:6`,
  `Upload.module.css:671`); radii 12/14/16/18, three shadow recipes, three
  close-button styles.
  Fix: `src/components/AppDialog/` becomes the only overlay primitive; popups
  supply content only.
  Done: every popup composes `sharedOverlay`, `sharedSurface` and `sharedClose` from `AppDialogHost.module.css`; one fade and one slide keyframe.

- [x] **Chip and badge inflation; hero copy inside a tool.**
  Problem: 144 badge, chip, tag and pill class definitions; the sidebar
  header shows three count pills (`Sidebar.module.css:48-58`); each library
  row carries a synthetic SKU from `moduleCode()` (`Sidebar.tsx:215-221`, for
  example "FIE-NOI") plus type and tag pills; the status bar has about nine
  pills. Copy: "Signal lab idle", "Wake the studio with a first patch", a
  "Last start:" pill (`NodeGraphCanvas.tsx:1315-1338`), minimap captioned
  "SIGNAL OVERVIEW" (`NodeGraphCanvas.module.css:700`), subtitles "PATCH RACK"
  and "OUTPUT BAY", a watermark logo in the preview pane.
  Fix: delete `moduleCode`; counts as plain muted text; status bar as text
  with "·" separators ("Ready · 15.4 A · pins ok · 8 modules · ESP32"); no
  minimap caption; subtitles gone or plain ("Node Library"); empty canvas
  reads "No nodes yet — drag one from the library, or press Start."
  Done: `moduleCode` deleted; sidebar counts and the status bar are plain text with · separators; the minimap caption, subtitles, "Signal lab idle" and "Last start" are gone; the empty canvas reads "No nodes yet".

- [x] **Emoji and Unicode glyphs as the icon system.**
  Problem: no icon library; 73 emoji lines in 29 files and about 290
  arrow/shape glyph lines in 93 files: 📌 (`StudioNode.tsx:906`,
  `BoardNodeBody.tsx:289`, de-coloured with `filter: grayscale(1)`), 👁
  (`BoardNodeBody.tsx:179, 219`), 🧪 🧭 (`MatrixOutputSetupWizard.tsx:503, 513`,
  `HelpModal.tsx:663`), ✦ Start (`MenuBar.tsx:983`), theme ☾ ✦ ☀ (`:152`),
  undo/redo ↩ ↪ (`:966, 975`); the socket glyph map is defined twice
  (`Sidebar.tsx:201-205`, `HelpModal/portCopy.ts:17-21`). The only real SVGs
  are `Preview/PlayerIcons.tsx` and `PatternTags/PatternFormIcons.tsx`.
  Fix: one in-repo 16 px stroke SVG set under `src/components/icons/`,
  including the port-type symbols.
  Done: `src/components/icons/Icon.tsx` is a 16 px stroke set including the port symbols (`portIconNames.ts`); icon-only buttons and the emoji use it. Typographic marks stay as text: ✓ radio ticks, ▾ chevrons, ★ ratings and the "↑ Upload"-style label prefixes.

## 5. Identity work (larger)

- [x] **"Only light emits light."**
  Make the LED preview, wire packets and hardware spill the sole sources of
  glow; chrome goes matte. Keep `.signalAura` (`StudioNode.module.css:76-91`),
  GlowEdge packets, `.ambilight` (`LEDPreview.module.css:429`) and
  HardwareLedSpill. Mostly deletions across tokens, App, MenuBar, StatusBar,
  Sidebar, NodeGraphCanvas, HardwarePane and LEDPreview. Effort M.
  Done: sockets are matte (`portHandleStyle` sets no halo), the sidebar, canvas badges, controls, bench tabs and inspector carry no coloured shadow or tint gradient; `.signalAura`, GlowEdge packets, `.ambilight` and the bench spill keep theirs.

- [x] **A real socket vocabulary.**
  Port `dataType` already drives a glyph map and coloured 12 px circle
  handles (`nodeHandleStyle.ts`, `StudioNode.tsx:1902, 1921`). Make one
  `portSymbols.tsx`: frame = square, field = diamond, float = circle,
  bool = small square, audio = hexagon, palette = striped pill, colour = dot,
  rendered as SVG for the handle, the sidebar glyph (`Sidebar.module.css:423`),
  the help reference (`NodeReference.module.css:131`), the minimap and the
  wire terminal (`GlowEdge.tsx:203`). Replaces the two glyph maps plus
  `moduleGlyph` and `indexGlyph`. Effort M.
  Done: `src/components/icons/portSymbols.ts` is the one table (shape per data type, SVG path plus handle CSS); `portHandleStyle` cuts every handle to it, `PortIcon` draws the sidebar and help glyph from it, and `GlowEdge` fills the wire terminal with the same path. `portIconNames.ts` and the glyph maps are gone; the minimap draws nodes only and has no port to mark.

- [x] **Let the photographic hardware set the material.**
  The bench renders real boards at true millimetre scale
  (`HardwarePane.module.css:224-257`); surround it with flat instrument-panel
  chrome: single `--bg-panel`, hairline `--line`, no gradients on bars
  (`MenuBar.module.css:4-5`, `StatusBar.module.css:3-4`,
  `Sidebar.module.css:340-343, 360-362`, `NodeGraphCanvas.module.css:686, 695`),
  no texture on node bodies. Keep the grid-paper part thumbnails
  (`HardwarePartsShelf.module.css:232-245`). Effort S.
  Done: sidebar, category and shelf headers, recipe cards, context menu, canvas badges and controls, bench tab and inspector, build and performance backgrounds are flat `--bg-panel`/`--bg-primary` with `--line` hairlines; node bodies flat; grid-paper thumbnails kept.

- [x] **Empty canvas as a ghost patch, not a hero.**
  Replace `.emptyPanel`, `.emptyBeacon`, `.dormantSignal` and
  `.emptyFieldFrame` (`NodeGraphCanvas.module.css:224-518`, `.tsx:1310-1340`)
  with a dim dot grid and a translucent Juggle → LED Output pair at 40 %
  opacity that materialises on click, plus one 12 px line "Drag a node from
  the library, or press Start." Effort S–M.
  Done: the card is a 40 % ghost Juggle → LED Output pair (the "Start with Juggle" button) over the dot grid, one line "Drag a node from the library, or press Start.", and text links for the audio demo, Start Gallery and guide.

- [x] **Example projects should not open black.**
  The bundled Music Player example shows a black output matrix and "Add local
  tracks, or preview a generated show" until the user acts, so the first
  thing a visitor sees is nothing lit. Open examples with a generated show
  playing, or bundle a short royalty-free track.
  Done: the Music Player starter names three bundled patterns (`collectionPatterns`) that `startTemplate` copies into its Pattern Collection on load, so the output plays on the wall clock from the first frame; `startFlow.test.ts` covers it.

## Keep as is

These came up in every audit as already distinctive or well done; do not
flatten them while doing the cleanup above.

- GlowEdge wires: layered halo, bloom and core with travelling packets whose
  opacity follows activity; connection flash and splice pulse
  (`GlowEdge.tsx:238-310`).
- The hardware bench at true scale with real board and part renders, spill
  lighting and grid-paper thumbnails.
- The LED output drawn in the shape of the part (ring annulus mask, corkscrew
  path, `mix-blend-mode: screen` emitters, `StudioNode.module.css:386-475`)
  and the ambilight lobes behind the preview.
- The Graph Health drawer's four-bar signal rail
  (`GraphHealthDrawer.module.css:47-69`) and its "Next step" cards whose
  button performs the fix.
- Motion hygiene: every loop has `prefers-reduced-motion` and
  `[data-reduced-motion]` fallbacks; one-shot feedback on connect, drop and
  splice already exists.
- The first-project guide strip reads progress off the project itself
  (`firstProjectSteps.ts`); the Start Gallery separates "In the browser" from
  "On a board" per starter.
- Destructive actions all go through `requestConfirm` and `AppDialog`;
  Escape layering all goes through `useEscapeLayer`; the Help Shortcuts tab
  matches the bound handlers.
- Node registry parity is exact: 235 library nodes, 235 help entries, every
  type in exactly one evaluator and one emitter table.
