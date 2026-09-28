# Truchet Tiles

Status: implemented · Owner: app · Date: 2026-09-28

## Purpose

`Truchet` produces a scalar glow field from motifs whose endpoints agree at
tile boundaries. Random-looking orientation comes from the same deterministic
24-bit lattice hash used by Slice Tiling, so the browser preview and generated
firmware choose the same tile in every cell.

Square lattices offer quarter-circle arcs, midpoint diagonals, a four-corner
Smith-style curve, and classic corner-to-corner 10 PRINT lines. Hexagonal
lattices use three alternating vertex arcs: each arc reaches its two adjacent
edge midpoints, so all six sides join whatever orientation the neighbouring
cell chooses. A saved motif that does not belong to the selected lattice falls
back to that lattice's arc motif rather than reaching generated C++ as text.

## Node contract

- `reroll` is a boolean input. Each rising edge increments a local epoch; a
  held high signal does not reroll again.
- `cells` is the number of cells across the canvas width, clamped to 0.5–8.
- `lineWidth` is a 0–0.5 cell-space glow width. The output is
  `1 - smoothstep(0, lineWidth, distance)`.
- `scroll` moves horizontally in cells per second, clamped to −8–8.
- `rotation` rotates the whole lattice by −180–180 degrees.
- `seed` is a baked integer from 0–9999. Together with the epoch and integer
  cell coordinates it selects an orientation without mutable random state.

The controls except `reroll` are property inputs where runtime animation is
meaningful. `lattice`, `motif`, and `seed` stay properties because they choose
the generated branch or deterministic hash family.

## Geometry and parity

`src/state/evaluator/truchet.ts` owns the motif order, compatibility fallback,
distance primitives, orientation count, hash selection, and glow curve. The
field evaluator owns only rising-edge epoch state and the canvas walk.

Generated firmware uses `src/codegen/truchetHelperCpp.ts` behind
`needsTruchet`, while cell lookup and `_latticeHashBits` remain in the existing
lattice helper. The motif and lattice are baked as validated numeric ids; the
per-cell hash is unsigned 32-bit on both sides and keeps its top 24 bits before
orientation selection. Generative shows lift both complete helper blocks.

The Phase 4 fixture combines square diagonals and hex arcs with Field Math,
then maps the result through a palette. Its classic-ESP32 toolchain, source
hash, flash, and RAM result are recorded in
[pattern-node compile checks](../pattern-node-compile-checks.md).
