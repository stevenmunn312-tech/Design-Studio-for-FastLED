# Plan — Integrate `feature/thmi-touchscreen-ui` onto `main`

Status: **proposed** · Created 2026-06-25

## Why this is a plan and not a merge

`feature/thmi-touchscreen-ui` forked from `main` at commit `10e9354`, *before*
the recent refactor PRs landed on `main`:

- #53 — drive preview animation from wall-clock time
- #54 — make NoiseField use its palette
- #55 — palette-consumer test guard
- #56 — bundle redundant nodes into variant-selectable nodes

The branch then developed its own (older-shaped) node library, `todo.md`, and
`musicAnalyzer.ts`. A straight `git merge` would reintroduce the un-bundled
nodes and the frame-count timing loop, reverting `main`. So each feature is
**replayed as its own PR on top of current `main`** instead.

`main` already has the base music-sync pipeline (PR #58, squashed from the
branch's `1cf3d78`). The branch's commits *after* that point are the net-new
work to bring over.

## Commits to replay (newest → oldest)

| Commit    | Feature | Notes / conflict risk |
|-----------|---------|-----------------------|
| `d53785d` | T-HMI touchscreen controller firmware (`firmware/thmi/.../TMHIController.ino`, 636 lines) | New file, no source conflict. Pairs with #58's player sketch + SD card export. |
| `96b4518` | 8 transition nodes (FadeThroughBlack/White, Blinds, Ripple/Spiral Wipe, Curtain, ScanLines, Zoom) | **High** — `main` bundled Crossfade/Wipe/Dissolve into one `Transition` node (`transitionType`). Fold these in as new variants, don't re-add standalone nodes. |
| `1e2410e` | 5 transition nodes (Iris, ClockWipe, Push, Checkerboard, Diagonal) | Same as above — add as `Transition` variants. |
| `a9ebb15` | Audio node C++ codegen upgrade | Medium — re-target onto `main`'s `cppGenerator.ts`. |
| `510c860` | Audio engine → 2048-pt FFT + spectral analysis nodes | Medium — touches `audioEngine.ts` / `audioStore.ts`. |
| `995ce56` | FFT-based music-analyzer rewrite | **High** — must reconcile with #58's `musicAnalyzer.ts` already on `main`; pick the better implementation, keep the `SongAnalysis` contract in `showFile.ts` stable. |
| `3c753ba` | In-browser audio preview + synced show timeline | Medium — new UI; aligns with the *Show editor / timeline* todo item. |

(`1cf3d78` and everything below it is already on `main` via #58 or via the
PR-based refactors.)

## Suggested order

1. **Firmware** (`d53785d`) — isolated, no source conflict, ships value immediately.
2. **Transition variants** (`1e2410e` + `96b4518`) — fold 13 effects into the
   bundled `Transition` node; one PR, with evaluator + cppGenerator cases and
   `NODE_DESCRIPTIONS` entries (enforced by `nodeLibrary.test.ts`).
3. **Audio stack** (`995ce56` → `510c860` → `a9ebb15`) — reconcile analyzer
   first, then engine/nodes, then codegen. Largest conflict surface.
4. **Audio preview + timeline** (`3c753ba`) — depends on the reconciled audio stack.

Each step: branch off `main`, replay, get `lint` + `test` + `build` green, PR.

## Done when

- All seven features live on `main` (or explicitly dropped, noted here).
- `feature/thmi-touchscreen-ui` deleted.
- `CLAUDE.md` node lists + `todo.md` updated per merged PR.
