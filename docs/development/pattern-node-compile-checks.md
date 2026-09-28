# Pattern-node firmware compile checks

> **Status: Phases 0–5 complete.** The generated fixtures passed on classic
> ESP32, and the integer-heavy Slice Tiling fixture and the stateful Phase 5
> fixture also passed on ESP8266, on 28 September 2026. This is compile
> evidence, not a physical LED bench run.

The fixture is generated from a real Studio graph:

```text
Shape Field (circle distance) ─┐
                               ├─ Field Lerp ─ Field Levels ─ Field → Frame
Shape Field (square distance) ─┘                                  │
                                                                 Shape ─ LED output
```

This exercises both new field buffers, interpolation, the low-equals-high hard
threshold, palette conversion, and the shared signed-distance C++ helper used
by both Shape Field and the existing Shape node. The generator refuses to write
the fixture if any Phase 0 emitter is absent or if `_sdfPolygon` is emitted more
than once.

The Phase 1 fixture is one live field chain:

```text
Slice Tiling (hex, depth 3) ── Field × Cell ─┐
Slice Tiling (square, depth 2) ──────────────├─ Field Math ─ Field Math ─ Field → Frame ─ LED output
Slice Tiling (triangle/custom) ──────────────┘
```

It exercises all three cell finders, both symmetry modes, all supported depth
classes, a named preset, parsed custom bits, morphing, warping and hard/soft
edges. The hex tiling's Cell output is multiplied into its own field, so the
fixture also declares `field_hex_cell` and calls `_latticeCellValue` with a
seed. Generation fails if any lattice block is absent, if the Cell output's
buffer or hash call is missing, or if the shared `_squareCell` helper is
emitted more than once. Both fixtures map their field through Field → Frame,
which now emits `LINEARBLEND_NOWRAP`, and declare `paldef_` tables that end
on their palette's last colour.

The Phase 2 fixture is the node reference's liquid-feedback graph:

```text
Noise ─────────────── Frame Warp ─ Frame Feedback ─ LED output
Field Formula (dx) ────┤
Field Formula (dy) ────┘
```

It exercises two field buffers, wrap-edge bilinear sampling, centred zoom and
rotation, the shared frame sampler and a two-frame recursive history. Generation
fails if the Frame Warp block, either field, feedback ring or sampler is absent,
or if `_sampleFrame` is emitted more than once.

The Phase 3 fixture runs both symmetry layers in one chain:

```text
Field Formula → Field Symmetry (p4m) → Field → Frame → Symmetry (p6m) → LED output
```

It exercises nearest field sampling, bilinear frame sampling, square and hex
lattice lookup, every wireable transform, and the append-only group ids. The
fixture generator refuses a sketch missing either node, either lattice finder,
either selected fold id, or any shared helper, and verifies the lattice,
symmetry, and frame-sampling helpers are each emitted once.

The Phase 4 fixture combines both Truchet lattice families:

```text
Truchet (square diagonals) ─┐
                             ├─ Field Math (max) ─ Field → Frame ─ LED output
Truchet (hex arcs) ─────────┘
```

It exercises square and hex cell lookup, two motif ids, seeded per-cell
orientation, scrolling, rotation and the glow-distance curve. Generation fails
if either Truchet block, motif id, the lattice hash or glow call is absent, and
verifies that both the lattice and Truchet helper blocks are emitted once.

The Phase 5 fixture runs both stateful Phase 5 fields into one output, and is
generated twice, at 16×16 and 32×32, so its RAM can be read at both sizes:

```text
Interval ─ reset ─ Turing Field (3 scales) ────────────┐
                                                      ├─ Field Math (max) ─ Field → Frame ─ LED output
Reaction Diffusion (coral preset) ─ Field output ─────┘
```

It exercises the baked radius list, the rising-edge reset, the shared
summed-area step, the Worley-hash start state, a preset's baked feed and kill,
and Reaction Diffusion's V state living in its Field output buffer. Generation
fails if the Turing block, radii, step call, baked preset pair or the V copy
into `field_rd` is absent, and verifies that the Turing helper and the Worley
hash are each emitted once. Bit-exact agreement between the step and the
preview is tested separately, with the host compiler, by
`turingNativeParity.test.ts`.

## Reproduce

From the repository root:

```powershell
npm run gen:pattern-node-compile-fixture
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase0.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase1.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase1
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase1.ino --fqbn esp8266:esp8266:nodemcuv2 --tag esp8266 --label pattern-node-phase1
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase2.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase2
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase3.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase3
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase4.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase4
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase5.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase5
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase5-32.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase5
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase5.ino --fqbn esp8266:esp8266:nodemcuv2 --tag esp8266 --label pattern-node-phase5
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase5-32.ino --fqbn esp8266:esp8266:nodemcuv2 --tag esp8266 --label pattern-node-phase5
```

The shared compile runner uses the local helper's real Arduino CLI path and
never flashes. `backend/sketches/` is gitignored; regenerate the sketch before
re-running the command.

## Result, 28 September 2026

Re-run after the palette-table, Field → Frame and Slice Tiling Cell output
changes. Phase 1 RAM rose by 2,048 bytes on both targets: the Cell output's
buffer and the multiply's own field buffer, 1,024 bytes each at 16×16.

| Fixture | Target | Core | Arduino CLI | FastLED | Result | Flash | RAM |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 398,899 / 3,145,728 (12%) | 33,732 / 327,680 (10%) |
| Phase 1 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 400,591 / 3,145,728 (12%) | 36,036 / 327,680 (10%) |
| Phase 1 | `esp8266:esp8266:nodemcuv2` | 3.1.2 | 1.5.1 | 3.10.5 | pass | 250,192 / 1,048,576 (23%) | 38,516 / 80,192 (48%) |
| Phase 2 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 404,379 / 3,145,728 (12%) | 35,780 / 327,680 (10%) |
| Phase 3 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 399,239 / 3,145,728 (12%) | 31,684 / 327,680 (9%) |
| Phase 4 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 397,703 / 3,145,728 (12%) | 31,940 / 327,680 (9%) |
| Phase 5, 16×16 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 393,991 / 3,145,728 (12%) | 38,020 / 327,680 (11%) |
| Phase 5, 32×32 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 395,547 / 3,145,728 (12%) | 69,636 / 327,680 (21%) |
| Phase 5, 16×16 | `esp8266:esp8266:nodemcuv2` | 3.1.2 | 1.5.1 | 3.10.5 | pass | 243,424 / 1,048,576 (23%) | 39,432 / 80,192 (49%) |
| Phase 5, 32×32 | `esp8266:esp8266:nodemcuv2` | 3.1.2 | 1.5.1 | 3.10.5 | pass | 245,008 / 1,048,576 (23%) | 71,048 / 80,192 (88%) |

The Phase 5 rows were built on Linux in a cloud session, not on the Windows
machine that built the others. Going from 256 to 1,024 LEDs adds 31,616 bytes
of RAM on both targets, about 41 bytes per added LED for this graph. Most of
that is the two simulations: Reaction Diffusion's 16 bytes per LED, the
Turing Field's 12 (state, table and field buffer) plus its table's extra row
and column, and the Field Math, frame and LED buffers. On ESP8266 a
32×32 graph holding both simulations reaches 88% of RAM, so the RAM estimate
and the capacity check, not a board gate, are the guard.

Generated source: 6,170 bytes, SHA-256
`b83bc2739107d19f7abe4029df9dc11d343c5266e6c1ac1688560d3e9dd89e93`.

Phase 1 generated source: 11,860 bytes, SHA-256
`eff39c21aebf507964775d7e5c1918eb0e5df93e0808d9f1e4b391a52c18be54`.

Phase 2 generated source: 7,465 bytes, SHA-256
`151ebb5340d01c4d9880bf463446237ba5d2be3b50c36c52b106c8a3c20ba7f9`.

Phase 3 generated source: 11,716 bytes, SHA-256
`9fdb486108a20d8027e0ff813ec5d8aa4d862a9a21d4f0cd206e6de38095d2b5`.

Phase 4 generated source: 10,435 bytes, SHA-256
`a44022452bdbf552dd64d53b6bae163c8cab795425a63d38ab505fd4d854d80a`.

Phase 5 generated source, 16×16: 7,636 bytes, SHA-256
`1fb213ed38430fda84f7b4afcfabbfc1c5307b98662ac8bd627cc2f84f3156f2`.

Phase 5 generated source, 32×32: 10,733 bytes, SHA-256
`6ddd2cfdfc6651ee3eb34bbe0b83e91e4f647f400de9f09161f2497349d0349e`.
