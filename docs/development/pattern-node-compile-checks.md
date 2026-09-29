# Pattern-node firmware compile checks

> **Status: Phases 0–7 complete; Phase 8 has its Vibe, Song Structure, Pitch Detect and Waveform fixtures.** The generated fixtures passed on classic
> ESP32, and the integer-heavy Slice Tiling fixture and the Phase 5 and 6
> fixtures also passed on ESP8266, on 28 September 2026 (UTC). This is
> compile evidence, not a physical LED bench run.

Phase 8 adds one fixture per detector as each ships. The Vibe fixture wires
Microphone → Audio → Vibe (bass) → Map Range → Brightness over a Plasma, with
an INMP441 engine. It proves the pinned FastLED 3.10.5 has every getter the
engine publishes (`getVibeBass`, `getVibeBassAtt`, `isVibeBassSpike` and the
mid and treble forms). Generation fails if any of those lines is missing.

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

The Phase 6 fixture layers two Fourier Epicycles nodes over a dimmed Plasma,
and is generated twice, with 16 and with 64 baked terms per node and nothing
else changed, so the flash each term costs can be read off:

```text
Plasma ─ Brightness ─ Fourier Epicycles (star, Harmonics from BeatSin) ─ Fourier Epicycles (custom, no circles) ─ LED output
```

It exercises the PROGMEM coefficient tables, a wired fractional Harmonics,
the guide circles on one node and not the other, a parsed custom outline, the
trail fade and substeps, and the pen head. Generation fails if either table,
the custom node's circle-free call or the trail call is absent, and verifies
that the shared Fourier helper is emitted once. Byte-level agreement with the
preview is tested separately, with the host compiler, by
`fourierNativeParity.test.ts`.

The Phase 7 fixtures are the three bundled starters, built from their shipped
subgraphs rather than restated: each Group Output becomes a 16×16 LED output,
and Truchet Beat Maze's audio Group Input becomes an Audio node backed by an
INMP441 on a classic ESP32 Board node, since the Board is the only thing that
turns the audio engine on. Generation fails if a pattern is missing, if
Breathing Rosette lacks its Slice Tiling block, Liquid Mirage its Frame Warp,
feedback ring or offset field, or Truchet Beat Maze its Truchet block or audio
processor.

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
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase6-16.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase6
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase6-64.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase6
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase6-16.ino --fqbn esp8266:esp8266:nodemcuv2 --tag esp8266 --label pattern-node-phase6
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase6-64.ino --fqbn esp8266:esp8266:nodemcuv2 --tag esp8266 --label pattern-node-phase6
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase7-rosette.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase7
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase7-mirage.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase7
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase7-maze.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase7
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
| Phase 6, 16 terms | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 399,795 / 3,145,728 (12%) | 32,756 / 327,680 (9%) |
| Phase 6, 64 terms | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 400,947 / 3,145,728 (12%) | 32,756 / 327,680 (9%) |
| Phase 6, 16 terms | `esp8266:esp8266:nodemcuv2` | 3.1.2 | 1.5.1 | 3.10.5 | pass | 248,432 / 1,048,576 (23%) | 35,124 / 80,192 (43%) |
| Phase 6, 64 terms | `esp8266:esp8266:nodemcuv2` | 3.1.2 | 1.5.1 | 3.10.5 | pass | 249,584 / 1,048,576 (23%) | 35,124 / 80,192 (43%) |
| Phase 7, Breathing Rosette | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 405,987 / 3,145,728 (12%) | 30,636 / 327,680 (9%) |
| Phase 7, Liquid Mirage | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 402,907 / 3,145,728 (12%) | 36,548 / 327,680 (11%) |
| Phase 7, Truchet Beat Maze | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 517,867 / 3,145,728 (16%) | 33,292 / 327,680 (10%) |
| Phase 8, Vibe | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 529,459 / 3,145,728 (16%) | 31,468 / 327,680 (9%) |
| Phase 8, Vibe | `esp32:esp32:esp32s3` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 546,571 / 3,145,728 (17%) | 30,896 / 327,680 (9%) |
| Phase 8, Song Structure | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 557,931 / 3,145,728 (17%) | 33,284 / 327,680 (10%) |
| Phase 8, Song Structure | `esp32:esp32:esp32s3` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 574,187 / 3,145,728 (18%) | 32,712 / 327,680 (9%) |
| Phase 8, Pitch Detect | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 532,203 / 3,145,728 (16%) | 34,548 / 327,680 (10%) |
| Phase 8, Pitch Detect | `esp32:esp32:esp32s3` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 549,279 / 3,145,728 (17%) | 33,976 / 327,680 (10%) |
| Phase 8, Waveform | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 525,987 / 3,145,728 (16%) | 33,804 / 327,680 (10%) |
| Phase 8, Waveform | `esp32:esp32:esp32s3` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 543,295 / 3,145,728 (17%) | 33,232 / 327,680 (10%) |

The Phase 5, 6 and 7 rows were built on Linux in a cloud session, not on
the Windows machine that built the others. Truchet Beat Maze's larger flash
is FastLED's audio processor, which the other fixtures do not include. Going from 16 to 64 terms on each of
the Phase 6 fixture's two nodes adds 1,152 bytes of flash on both targets:
96 terms at exactly 12 bytes each. RAM does not move, because the tables live
in flash. Going from 256 to 1,024 LEDs adds 31,616 bytes
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

Phase 6 generated source, 16 terms: 9,647 bytes, SHA-256
`b7c49cdfb29cc4b39f0e53e4d5761dad441db2e91dc599b13d97498349533f78`.

Phase 6 generated source, 64 terms: 12,951 bytes, SHA-256
`c7ea8601a0c2b38fd38d1c598b36a159a3dea4482b2b29d8a933fb9058686d01`.

Phase 7 generated sources: Breathing Rosette 8,836 bytes, SHA-256
`302d20a9cc1fbfb0abaced8f9212ba6a9686df33d7896056092b081b117a8bf8`;
Liquid Mirage 8,310 bytes, SHA-256
`590465897b96b681081c74ddb67839cdfa079973c8a18b22a496a5a59d4669ee`;
Truchet Beat Maze 15,891 bytes, SHA-256
`27f30662acde1acd2f82d48cb12abfce174ba7cbc1f079af5a632ebba48cf377`.

Phase 8 generated source, Vibe (identical for both boards; the engine differs
only by target): 8,203 bytes, SHA-256
`624ed24d0a13703e5f251a4083567b212a2d45ddb552a9f1342bbae9621ca90c`.
Built on Windows 11 on 29 September 2026. Each compile took about 11 minutes.
The ESP32-S3 was compiled without a board-specific PSRAM setting. The plan's
phase-level compile check on classic ESP32 and ESP32-S3 still waits for
Song Structure, Pitch and Waveform, so the RAM and flash delta per detector
is not yet separated from the shared audio engine.

Phase 8 generated source, Song Structure (identical for both boards): 10,519
bytes, SHA-256 `3ecb153c5d8eab141ca10c7415853290152a6ca1feb0601c79f4f978c9338954`.
It wires Microphone → Audio → Song Structure into Rain Ripples (drop), a
Brightness (arousal) and a Blend, and fails generation if any of the twelve
callback and getter lines is missing. Built on Windows 11 on 29 September 2026.

Phase 8 generated source, Pitch Detect (identical for both boards): 11,404
bytes, SHA-256 `035e296e516447a7e974e110d6268f7327a044e20f9a7959c4676c581a49e919`.
It wires Microphone → Audio → Pitch Detect into a Map Range, Brightness and a
Counter, and fails generation if the helper, the `getSample()` reads, the key
callbacks or the published globals are missing.

Phase 8 generated source, Waveform (identical for both boards): 9,948 bytes,
SHA-256 `3d627395ae27d4fc68c92ce3b53743e0fc076dde3fddb9e763586f03ea55df8f`.
It chains a line trace and a ring trace over a Plasma base, so the column and
radial emitters both compile. Built on Windows 11 on 29 September 2026.

Each Phase 8 detector is compiled with its own INMP441 engine, so the rows
above include the shared audio engine. The delta a single detector adds is the
difference from the Vibe rows only within a few kilobytes of flash and about
1 KB of RAM, and is not separated further.
