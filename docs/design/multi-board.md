# Multi-board projects — design note

Status: implemented, experimental (generated firmware; no compile or bench row
yet) · Owner: app · Date: 2026-10-22

Root todo, D-03: one project driving several controllers that stay in time
with each other, through the Build Diagram and the upload flow.

## The model

A project has one or more **Board** nodes in its root graph. The first,
`board-root`, is the **primary** board and exists in every project as before.
Extra boards are added from the Hardware pane's board menu ("Add another
controller") and have ids `board-2`, `board-3`, … They are hidden, unselectable
root nodes exactly like the primary one.

Every hardware part and every LED output **belongs to one board**. The
attachment is the `boardId` property on the part's root node; a part without
one belongs to the primary board, so every pre-D-03 project reads unchanged.
Pattern nodes, controls and everything else on the signal graph belong to no
board: they are shared design, and a board compiles whatever part of that
design reaches its own outputs and sinks.

The whole app keeps its one-board code. What changes is **what it is given**:
a **board partition** of the root graph, built by `boardPartition(nodes, edges,
boardId)` in `src/build/boardPartition.ts`:

- the one Board node;
- the hardware parts and LED outputs attached to it;
- the signal nodes joined to those parts by any run of wires, upstream from
  its outputs and sinks and downstream from its inputs, stopping at another
  board's part;
- the signal nodes no board reaches at all (an unfinished patch, or a sink
  such as Master Speed that every sketch applies), which land in every
  partition and are diagnosed once by id;
- the edges whose both ends are in the partition.

Inside a partition there is exactly one Board, so `find(Board)`,
`controllerSettings`, `collectPinUses`, `buildHardwareManifest`, `generateCpp`,
`generateShowSketch`, `findDeployBlockingErrors` and the rest work as they
always did. Pin conflicts, capacity, power and RAM are therefore per board by
construction. A part on board A whose signal runs, through any run of
signal nodes, into a part or output on board B (a button on A feeding a
pattern that B shows) is a **cross-board** error reported by
`findCrossBoardIssues` on the whole root graph, because no firmware can carry
that wire; two boards showing one pattern is not one.

`activeBoardId` (session-only, `uiStore`) names the board the Hardware pane,
the Build Diagram and the Upload tab are working on. It resets to the primary
board when a project loads. The Hardware pane adds parts to the active board;
the Build Diagram draws the active board's bench; the Upload tab builds and
flashes the active board's sketch. Switching the active board is the same
gesture in all three tabs.

## Upload targets

Each board has its own FQBN and port. The project stores
`uploadTargets: Record<boardId, { selectedFqbn, selectedPort }>`; the old
single `uploadTarget` is read as the primary board's. `uploadStore.selectedFqbn`
and `selectedPort` describe the **active** board, and the mirror in `App.tsx`
that keeps the FQBN in step with the Board node's profile now follows the
active board. Boards upload one at a time, because the helper runs one build
and one serial port at a time; the Upload tab says which board it is flashing
and the status line of each board is kept per board.

## Keeping boards in time

With `clockSync` on, every board brings up the sketch's one network connection
(the same bootstrap Art-Net and NTP use, `src/codegen/peripherals/networkCpp.ts`)
and the primary board **leads**: twice a second it broadcasts a UDP datagram on
port 6464 (`FLSY`, version, its sketch clock in milliseconds, and when it runs
a generative show the current pattern, the next pattern, the transition type,
whether a transition is running and when the current phase started). Each
follower keeps `offset = leaderMs - millis()` from the last datagram and reads
its sketch clock as `_syncNowMs() = millis() + offset`. The emitters that used
to read `millis()` for animation time — `float t`, the Master Speed
accumulator and the show's `now` — read `_syncNowMs()` instead, on every
board; on the leader and on an unsynced board the offset is zero, so the code
is one path.

A follower running the same show adopts the leader's pattern, transition and
phase start whenever they differ from its own and it is not mid-transition, and
makes no picks of its own while locked. Lock is lost five seconds after the
last datagram; the follower then runs its own clock and its own picks until
the leader is heard again, which is what it would have done without sync.

The sync is only as good as what is compiled on each board: a show stays in
step when every board carries the same collection in the same order, so the
pattern indexes mean the same thing. Validation says so. Local controls (a pot
on one board) change only that board, by design. The SD/music player is not
synced: its clock is the track position.

`clockSync` is stored on every Board node as `'off' | 'leader' | 'follower'`
and kept consistent by one store action, `setBoardClockSync(enabled)`: the
primary becomes the leader and every other board a follower; a board added
while sync is on starts as a follower. The Board node counts as a network user
when its sync is on, so its board needs Wi-Fi (or a wired link) and Wi-Fi
credentials, entered in the Hardware pane's board options and kept in the
same browser-local store as the Art-Net and NTP ones, keyed by the Board node
id.

## Validation

- Every partition is validated with its own FQBN; the Graph Health drawer
  merges the per-board diagnostics by id and prefixes a board-specific finding
  with the board's label when there is more than one board.
- `findCrossBoardIssues`: an edge between two partitions is an error naming
  both nodes and both boards.
- A board with no output and no sink is a warning (it will compile to a sketch
  that drives nothing).
- With sync on, each board must be able to reach the network (the usual
  "needs a Wi-Fi-capable board" gate, now also raised for the Board node) and
  each must have credentials unless it has a wired link; followers with a
  collection whose pattern order differs from the leader's get a warning.

## Build Diagram and the electrical plan

The Build Diagram shows one board at a time, chosen by the same active-board
selector. Each board's supply, fuse and trunk are sized from that board's own
outputs: a multi-board build has one supply per board unless the user plans
otherwise, and the plan's sheet says which board each page belongs to. Bonded
grounds between boards are the user's wiring, noted on the sheet, not modelled.

## Save shape

- Board nodes: extra Board nodes are kept on load (`ensureRootBoardNode` keeps
  them, normalises them like the primary and gives them `boardId`-free
  identity); the primary stays `board-root`.
- Parts and outputs: optional `boardId` property; absent means primary.
- Board properties: `clockSync` (default `'off'`).
- Project: `uploadTargets` map; legacy `uploadTarget` is read as the primary's.

No pre-1.0 migration: a saved project with one board is unchanged.

## Deliberately out of scope

- A single sketch driving two boards' outputs, or outputs attached to no board.
- Cross-board signal wires carried over the network.
- Music player sync, and sync without a network (a wired pulse line).
- Pin memory per board instance: `userPinsByBoard` stays keyed by profile id,
  so two boards of the same profile share their remembered pins.
- Parallel uploads.
