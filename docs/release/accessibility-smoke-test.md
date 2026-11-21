# Keyboard and Screen-Reader Smoke Test

This checklist is the release evidence for the accessibility exit criterion in
`todo.md`. Automated component tests and browser accessibility-tree inspection
reduce regressions, but the criterion is complete only after the core workflow
passes with a real screen reader.

## Supported test environment

Run the primary pass on the supported desktop combination:

- Windows 11
- the supported Chrome release recorded in `beta-support-matrix.md`
- current NVDA stable
- a fresh browser account/profile where practical

Record the exact Windows build, Chrome version, NVDA version, date, tester, and
whether the source app or a packaged desktop archive was used.

## Keyboard-only scenario

Do not use a mouse or touchpad during this pass.

1. Launch Studio and use normal `Tab`/`Shift+Tab` navigation to reach the menu
   bar, node library, canvas controls, preview, Graph Health, and status bar.
2. Open and close the File and View menus. Verify arrow-key navigation,
   Home/End, Escape, and focus restoration.
3. Start with the Juggle starter.
4. Press `Ctrl+K`, search for a node, and add it with the keyboard.
5. Focus a source port, press Enter or Space to start a connection, focus a
   compatible destination port, and press Enter or Space to finish it. Each
   node's ports are one Tab stop (its first port); the arrow keys step between
   a node's ports from there, and Home/End jump to the ends.
6. Focus a node and verify selection, arrow-key movement, property editing,
   undo/redo, deletion, and Escape behavior.
7. On the Upload tab, open the LED output **Setup…** wizard and **View Code**.
   Verify initial focus, forward and reverse focus trapping, Escape-to-close,
   and focus restoration.
8. Select the supported board and port, read the upload-readiness result, and
   export a sketch. If the validation machine has the supported hardware,
   perform the normal upload path as well.
9. Trigger at least one validation error and one successful status message.
   Confirm neither blocks subsequent keyboard navigation.

Any missing action, keyboard trap, lost focus, invisible focus indicator, or
pointer-only operation is a release blocker for this criterion.

## NVDA scenario

Repeat the same workflow with NVDA running and confirm:

- the main regions and Node Graph Editor are named;
- each node announces its display name, input/output count, and selection;
- each connection announces its source node/port and destination node/port;
- ports announce direction, node, port, data type, and the Enter/Space action;
- property controls announce their label, role, value, disabled state, and
  invalid state where applicable;
- dialogs announce their title, keep virtual/keyboard focus inside, close with
  Escape, and restore focus to the opener;
- collapsed panels do not appear in the browse order;
- Graph Health, status, upload progress, success, and failure messages are
  announced once and at an appropriate urgency;
- decorative preview graphics do not add noise, while functional preview and
  transport controls retain useful names.

Record the exact wording of confusing or duplicated announcements. Add a
focused component regression for every defect that can be represented in the
DOM, then repeat the affected manual step.

## Browser-assisted preflight — 2026-07-26

The local Vite app was inspected with the Codex in-app Chromium browser before
the NVDA pass:

- normal `Tab` no longer opened node search;
- `Ctrl+K` opened node search and focused its search field;
- the graph exposed the accessible name `Node graph editor`;
- all 8 nodes and 7 edges in the loaded test project had descriptive names;
- all 31 visible ports had `role="button"`, a descriptive accessible name, and
  keyboard focus;
- Enter on a source port started React Flow's click-to-connect state;
- all 16 visible non-file controls inside graph nodes had a programmatic label;
- no browser console warnings or errors were emitted during the pass.

Automated coverage also verifies the node-search shortcut, node/edge names,
port keyboard activation, common property labels, and modal focus
entry/trapping/Escape/restoration. The complete repository gates passed after
the change: lint, 1,478 tests across 93 files, and the production build.

## Completion record

Status: **Keyboard and NVDA focus-mode passes recorded on the v1 candidate; the browse-mode checks below are still to do by hand.**

The 2026-07-26 pass predates the workspace tabs and shelves, so the v1
candidate needs both scenarios again (todo.md HW-18).

| Date | Tester | Windows | Chrome | NVDA | Build | Keyboard | Screen reader | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-26 | User-confirmed | Version not supplied | Version not supplied | Version not supplied | Local Vite app | Pass | Pass | NVDA pass confirmed by the user; exact environment versions were not supplied. |
| 2026-11-21 | Claude Code, keys only | 11 (10.0.26300) | Chromium 156.0.8078.100 (Claude desktop browser pane) | Not run | Local Vite app, helper blocked | Pass after fixes | Pending | See the v1 candidate keyboard pass below. |
| 2026-11-22 | Claude Code, NVDA speech log | 11 (10.0.26300) | Google Chrome | 2026.3.1 | Local Vite app, helper blocked | — | Pass after fixes, browse-mode checks pending | See the v1 candidate NVDA pass below. |

## v1 candidate keyboard pass — 2026-11-21

Run with keys only, in the Claude desktop app's browser pane, against the
local Vite app with the helper blocked, so step 8 read the readiness result
and opened the generated sketch but selected no port and uploaded nothing.
Steps 1 to 4 and 9 passed as written. The first run failed on:

- **Ports unreachable (step 5).** Since 2026-11-04 every port handle carried
  `tabIndex={-1}`, so a connection needed the pointer. Each node's first port
  is now a Tab stop and the arrow keys walk the rest.
- **No focus ring on a node or connection.** React Flow's stylesheet removes
  the outline; `NodeGraphCanvas.module.css` puts the app's ring back.
- **Untrapped modals (step 7).** The generated-code viewer and 15 other
  overlay dialogs did not move focus in or trap Tab; they now use
  `useModalFocus`. The Live Touch Screen window and the hardware inspector are
  popovers and stay unblocking.
- **Focus dropped to the page** after adding a node from search, deleting a
  node or connection, and Escape on a node (`canvasFocus.ts`).
- **Smaller:** Ctrl+Z did nothing while a slider had focus; a node's label
  could still say "selected" after the selection moved; the code viewer's
  close button was named "×".

After the fixes, every step above passed on a second run. Node search still
moves through its results with Tab rather than the arrow keys.

## v1 candidate NVDA pass — 2026-11-22

NVDA 2026.3.1 ran with its log at the input/output level, which records every
utterance. Claude drove the nine steps in Chrome (with Chrome in the
foreground) and read the log. That covers what NVDA says as focus moves and
live regions change. It cannot press NVDA's own commands, so the browse-mode
checks below were not run.

Heard correctly from the start: the dialog titles with focus inside and
restored on close; menu items with their positions ("New Project, 1 of 13");
workspace tabs ("Graph, tab, selected, 2 of 4"); toggle buttons with their
state; nodes with their input and output counts and selection; connections
with both ends; ports with direction, node, port and type; slider values,
including after undo; React Flow's move announcement; and "Saved project".

Defects found and fixed:

- **Keyboard connections were silent.** Enter on a port now says "Choose a
  destination port for Juggle Frame", and completing it says "Connected
  Juggle Frame to LED String Frame". A mouse drag stays quiet.
- **Deletions were silent.** Now "Deleted Field Blur" or "Deleted a
  connection".
- **The Checks summary ran together** as "1 blocks upload1 suggestionESP32⌄".
  It now speaks one sentence: "Checks: 1 problem blocks upload, 1
  suggestion. LED output has no input."
- **The status bar said "Ready"** after every message as it reset; the idle
  text is no longer announced.
- **"Tracing LED Matrix"** used the library label; it now names the node as
  the canvas does ("Tracing LED String").
- **Wizard steps read "1Controller"**; now "Step 1: Controller, current step".
- **Start Gallery cards ran their text together** ("FireEasyShape the
  classic…"); now "Fire, Easy. Shape the classic…".
- **View Code read its `</>` glyph**; the glyph is hidden from speech.

Known and left:

- Moving onto a connection first says "graphic": React Flow wraps each edge
  in its own unnamed `<svg>`, which the app does not render.
- After a deletion, NVDA can briefly announce a Pattern Library button before
  focus settles on the graph editor.
- Node search announces neither its result count nor that it is a search.

Browse-mode checks still to do by hand (about 5 minutes, NVDA in Chrome):

1. Insert+F7, Landmarks: banner, navigation, complementary and content info
   are listed; note that there is no main landmark.
2. Arrow through a collapsed node property group and the closed Checks
   drawer in browse mode: their contents must not be read.
3. Arrow past the LED preview and node previews: no stream of unnamed
   graphics; Record and the transport buttons have names.
