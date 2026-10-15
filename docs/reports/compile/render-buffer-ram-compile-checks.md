# Render-buffer RAM compile checks

> **Status: scratch pooling (D-10.1) and in-graph sharing (D-10.2) measured
> on 15 October 2026.** This is compile evidence, not a bench run: no device
> has compared preview and LEDs on a persistent pattern across a transition.

Every bundled pattern compiled as SD Music Player collections on the
ESP32-S3 at 16×16 with arduino-cli, through
`python scripts/compile-fixtures/compile-matrix.py --only pattern-collections/`.
RAM, not flash, is the limit: before this work flash sat at 35–41% of the
3 MB app slot, while 40 audio patterns overflowed `dram0_0_seg` by 3,272
bytes. Each colour buffer is `3 × NUM_LEDS` bytes, so the cost grows with the
matrix: the same 90 buffers are about 1.1 MB at 64×64. The rules behind both
changes are in
[firmware generation](../../development/patterns/firmware-generation.md).

## Pooling scratch across collected patterns (D-10.1)

Collected patterns share one scratch pool, sized for the largest pattern. A
buffer that carries pixels between frames stays the pattern's own.

| Sketch | Buffers before | Buffers after | RAM before | RAM after |
|---|---|---|---|---|
| bundled 1–40 | 117 CRGB + 11 float | 14 + 3 | 152,844 B (46%) | 65,548 B (20%) |
| bundled 41–60 | 91 + 4 | 21 + 4 | 170,932 B (52%) | 117,940 B (35%) |
| bundled 61–80 | 102 + 14 | 18 + 8 | 167,028 B (50%) | 96,372 B (29%) |
| bundled 81–114 | 93 + 7 | 24 + 4 | 144,220 B (44%) | 88,156 B (26%) |

What remains per pattern is persistent state and Frame Feedback history.

## Sharing buffers within one graph (D-10.2)

Scratch buffers whose loop spans do not overlap share one array, and a node
seeding from a source with no later reader works on it in place. Buffer
counts are declared pool slots plus per-pattern persistent buffers. Old and
new firmware for six chain, branch, field and zone graphs, compiled to WASM,
gave byte-identical frames.

| Sketch | Buffers before | Buffers after | `memmove`s | RAM before | RAM after |
|---|---|---|---|---|---|
| bundled 1–40 | 13 CRGB + 3 float | 9 + 2 | 93 → 44 | 65,548 B (20%) | 61,452 B (18%) |
| bundled 41–60 | 21 + 4 | 15 + 4 | 59 → 36 | 117,940 B (35%) | 113,332 B (34%) |
| bundled 61–80 | 17 + 8 | 12 + 5 | 86 → 30 | 96,372 B (29%) | 89,460 B (27%) |
| bundled 81–114 | 23 + 4 | 17 + 3 | 77 → 42 | 88,156 B (26%) | 82,524 B (25%) |
