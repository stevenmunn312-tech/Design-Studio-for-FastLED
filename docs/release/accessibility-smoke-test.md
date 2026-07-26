# Keyboard and Screen-Reader Smoke Test

This checklist is the release evidence for the accessibility exit criterion in
`todo.md`. Automated component tests and browser accessibility-tree inspection
reduce regressions, but the criterion is complete only after the core workflow
passes with a real screen reader.

## Supported test environment

Run the primary pass on the supported public-beta desktop combination:

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
3. Start with the Rainbow starter.
4. Press `Ctrl+K`, search for a node, and add it with the keyboard.
5. Focus a source port, press Enter or Space to start a connection, focus a
   compatible destination port, and press Enter or Space to finish it.
6. Focus a node and verify selection, arrow-key movement, property editing,
   undo/redo, deletion, and Escape behavior.
7. Open Matrix Output Setup and Upload Tools. Verify initial focus, forward and
   reverse focus trapping, Escape-to-close, and focus restoration.
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

Status: **Passed**.

The release exit criterion was checked after the keyboard-only and NVDA
scenarios were confirmed.

| Date | Tester | Windows | Chrome | NVDA | Build | Keyboard | Screen reader | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-26 | User-confirmed | Version not supplied | Version not supplied | Version not supplied | Local Vite app | Pass | Pass | NVDA pass confirmed by the user; exact environment versions were not supplied. |
