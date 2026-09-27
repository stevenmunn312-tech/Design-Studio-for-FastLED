# Pattern-node firmware compile checks

> **Status: Phase 0 complete.** The generated all-Phase-0 fixture passed on
> classic ESP32 on 28 September 2026. This is compile evidence, not a physical
> LED bench run.

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

## Reproduce

From the repository root:

```powershell
npm run gen:pattern-node-compile-fixture
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/pattern-node-fixtures/phase0.ino --fqbn esp32:esp32:esp32 --tag esp32 --label pattern-node
```

The shared compile runner uses the local helper's real Arduino CLI path and
never flashes. `backend/sketches/` is gitignored; regenerate the sketch before
re-running the command.

## Result, 28 September 2026

| Fixture | Target | ESP32 core | Arduino CLI | FastLED | Result | Flash | RAM |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0 | `esp32:esp32:esp32` | 3.3.11 | 1.5.1 | 3.10.5 | pass | 398,891 / 3,145,728 (12%) | 33,732 / 327,680 (10%) |

Generated source: 6,147 bytes, SHA-256
`d0ac565458da7e68555ef8a8604539a8e4fdb465f1b26c730de9d84e44491a97`.
