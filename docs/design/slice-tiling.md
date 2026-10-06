# Slice Tiling

`SliceTiling` is a stateless field generator based on sections 4 and 6 of
Scandurra et al., *Procedural generation of geometric patterns for thin shell
fabrication* (Computers & Graphics 122, 2024, 103958; [open
PDF](http://vcgdata.isti.cnr.it/Publications/2024/SLMCCG-ProceduralPatterns/SLMCCG-ProceduralPatterns.pdf)).
Section 4 supplies the recursively subdivided polygon slice; section 6 supplies
the constrained vertex perturbation used by the Warp control.

## Node contract

The node outputs a 0–1 `field` of solid and empty slices, and a `cell` value
per lattice polygon, described [below](#cell-output). Its property inputs, in
port order, are `cells`, `rotation`, `spin`, `warp`, `morph`, and `edge`.

- `lattice` selects hexagonal, square, or triangular cells. `cells` is the
  number of polygons across the canvas width (0.5–8).
- `rotation` is degrees and `spin` is degrees per second. Coordinates are
  inverse-rotated before cell lookup, keeping animation independent of the
  selected lattice.
- `depth` is 1–3. Each level quarters the current fan triangle, producing 4,
  16, or 64 leaf bits per slice.
- `symmetry` is rotational or dihedral. Dihedral mode reflects alternate fan
  sectors.
- `warp` moves both radial split points with
  `s = clamp(0.5 + 0.3 * warp, 0.2, 0.8)`. The shared polygon-edge split stays
  at 0.5, preserving the paper's tileability constraint.
- `morph` interpolates leaf-wise between pattern A and B. `edge` applies a
  barycentric smoothstep inward from every solid leaf boundary; zero is a hard
  fill.

The twelve named presets contain a pair of patterns at every depth. Custom
mode exposes `bits` and `bitsB`. Each is hexadecimal with exactly `4^depth`
bits (1, 4, or 16 hex digits); leaf zero is the low bit. Invalid custom text
falls back to an all-solid pattern and is never copied into generated C++.

## Cell output

`cell` holds one value per lattice polygon, from 0.25 up to 1. Every pixel of
a hexagon, square or triangle reads the same number, and the number turns with
its polygon as the lattice rotates or spins. It ignores depth, preset, warp,
morph and edge. `seed` shuffles the values; the Field output ignores it.

The output exists to colour the tiling. Field → Frame maps `field` through a
palette, which gives two colours: one for solid slices, one for empty ones.
Multiplying `field` by `cell` in Field Math before Field → Frame gives each
polygon's solid slices their own palette colour, and the node's help example
is that graph. The 0.25 floor serves the recipe: empty slices are 0, and a
polygon hashed near 0 would take their colour and disappear. Field Levels
(Low 0.25, High 1) stretches the output back to 0–1 where the whole palette is
wanted. A palette that starts dark keeps the empty slices dark.

The value is `latticeCellValue` in `src/state/evaluator/lattice.ts`, an
unsigned 32-bit hash of the polygon's integer lattice coordinates. A
triangle's orientation is folded into the key, because two triangles share one
rhombus. The result is 2^22 plus three quarters of the hash's top 24 bits,
over 2^24. Every step is an integer, so float32 holds it exactly and the
sketch's `_latticeCellValue` returns the identical number; `lattice.test.ts`
checks the TypeScript against a BigInt model of the C arithmetic. The raw hash,
`latticeHash`, is exported for later lattice nodes.

Firmware writes `field_<id>_cell` only while a wire reads the port, and the
RAM estimate prices it by the same rule, at 4 bytes per LED. The preview fills
it regardless, because its field buffers come from a per-pass pool.

## Shared geometry and parity

Pixel centres are scaled by `cells / WIDTH`, then mapped to exactly one lattice
cell by `squareCell`, `hexCell`, or `triCell` in
`src/state/evaluator/lattice.ts`. `fanFold` maps the cell-local point into one
regular-polygon fan triangle. The point is converted to barycentric
coordinates and walks the four child transforms once per depth level,
accumulating `leaf = leaf * 4 + child`.

`src/nodes/field/sliceTiling.ts` owns pattern parsing, preset bytes, the child-matrix
builder, and the TypeScript leaf walk. Generated firmware emits the numeric
preset bytes into two fixed eight-byte arrays and uses the C++ twin in
`src/codegen/latticeHelperCpp.ts`, emitted once behind `needsLattice`. Parity
tests pin the split fraction, sector constant, lattice branch, and the exact
bytes selected for the node.

The node keeps no state. Its per-pixel cost is one cell lookup, one `atan2`, and
up to three subdivision walks. Depth 1 suits several small polygons on a 16×16
matrix; depth 2 suits one dominant polygon; depth 3 is intended for 32×32 and
larger canvases.

