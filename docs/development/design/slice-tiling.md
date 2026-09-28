# Slice Tiling

`SliceTiling` is a stateless field generator based on sections 4 and 6 of
Scandurra et al., *Procedural generation of geometric patterns for thin shell
fabrication* (Computers & Graphics 122, 2024, 103958; [open
PDF](http://vcgdata.isti.cnr.it/Publications/2024/SLMCCG-ProceduralPatterns/SLMCCG-ProceduralPatterns.pdf)).
Section 4 supplies the recursively subdivided polygon slice; section 6 supplies
the constrained vertex perturbation used by the Warp control.

## Node contract

The node outputs a 0–1 field. Its property inputs, in port order, are `cells`,
`rotation`, `spin`, `warp`, `morph`, and `edge`.

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

## Shared geometry and parity

Pixel centres are scaled by `cells / WIDTH`, then mapped to exactly one lattice
cell by `squareCell`, `hexCell`, or `triCell` in
`src/state/evaluator/lattice.ts`. `fanFold` maps the cell-local point into one
regular-polygon fan triangle. The point is converted to barycentric
coordinates and walks the four child transforms once per depth level,
accumulating `leaf = leaf * 4 + child`.

`src/state/sliceTiling.ts` owns pattern parsing, preset bytes, the child-matrix
builder, and the TypeScript leaf walk. Generated firmware emits the numeric
preset bytes into two fixed eight-byte arrays and uses the C++ twin in
`src/codegen/latticeHelperCpp.ts`, emitted once behind `needsLattice`. Parity
tests pin the split fraction, sector constant, lattice branch, and the exact
bytes selected for the node.

The node keeps no state. Its per-pixel cost is one cell lookup, one `atan2`, and
up to three subdivision walks. Depth 1 suits several small polygons on a 16×16
matrix; depth 2 suits one dominant polygon; depth 3 is intended for 32×32 and
larger canvases.

