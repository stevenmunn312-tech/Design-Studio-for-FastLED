# Pattern-node firmware compile checks

> **Status: Phases 0–1 complete.** The generated fixtures passed on classic
> ESP32, and the integer-heavy Slice Tiling fixture also passed on ESP8266, on
> 28 September 2026. This is compile evidence, not a physical LED bench run.

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
Slice Tiling (hex, depth 3) ───┐
Slice Tiling (square, depth 2) ├─ Field Math ─ Field Math ─ Field → Frame ─ LED output
Slice Tiling (triangle/custom) ┘
```

It exercises all three cell finders, both symmetry modes, all supported depth
classes, a named preset, parsed custom bits, morphing, warping and hard/soft
edges. Generation fails if any lattice block is absent or if the shared
`_squareCell` helper is emitted more than once.

## Reproduce

From the repository root:

```powershell
npm run gen:pattern-node-compile-fixture
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase0.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase1.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node-phase1
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase1.ino --fqbn esp8266:esp8266:nodemcuv2 --tag esp8266 --label pattern-node-phase1
```

The shared compile runner uses the local helper's real Arduino CLI path and
never flashes. `backend/sketches/` is gitignored; regenerate the sketch before
re-running the command.

## Result, 28 September 2026

| Fixture | Target | Core | Arduino CLI | FastLED | Result | Flash | RAM |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 398,891 / 3,145,728 (12%) | 33,732 / 327,680 (10%) |
| Phase 1 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 400,423 / 3,145,728 (12%) | 33,988 / 327,680 (10%) |
| Phase 1 | `esp8266:esp8266:nodemcuv2` | 3.1.2 | 1.5.1 | 3.10.5 | pass | 250,000 / 1,048,576 (23%) | 36,468 / 80,192 (45%) |

Generated source: 6,147 bytes, SHA-256
`d0ac565458da7e68555ef8a8604539a8e4fdb465f1b26c730de9d84e44491a97`.

Phase 1 generated source: 10,856 bytes, SHA-256
`af3684607d38247ef4a1d0ee70e5c4c5300d4ad8a67637e25dd7a2be81918904`.
