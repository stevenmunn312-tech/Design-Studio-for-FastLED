# SR1230 bare-encoder compile checks

> **Status: complete.** The normal, slideshow and module-guard sketches passed
> on classic ESP32 on 27 October 2026. This is compile evidence only; the
> Jaycar SR1230 remains experimental in the
> [support matrix](../../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each SR1230 fixture reads an `EncoderInput` with `partId`
`jaycar-sr1230-rotary-encoder`, A on GPIO 13, B on GPIO 14 and SW on GPIO 16,
Reset On Press on, and a saved `pullup: false`. The saved toggle is deliberate:
a bare encoder has no pull-ups of its own, so the sketch must still read all
three lines through `INPUT_PULLUP`.

- `normal` wires Position through Map Range (0 to 120 counts, 30 clicks) to
  LED brightness, and Pressed through Not to the output's Enabled.
- `slideshow` is the bench graph: Position into Player Controls' Pattern
  Selection and Pressed onto LED On / Off, driving a two-pattern Pattern
  Slideshow. Position reaches `_selUpdate` through `CtlDetent`.
- `module` is the `normal` graph with the encoder module instead (no `partId`,
  same pins), as the guard.

Fixture generation refuses any set where a sketch lacks `INPUT_PULLUP` on any
of the three pins, where an SR1230 sketch does not count each transition twice
(`_encTbl[...] * 2`), or where the module sketch does.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `module` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- encoder
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/encoder-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label encoder
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/encoder-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label encoder
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/encoder-fixtures/module.ino --fqbn esp32:esp32:esp32 --tag esp32 --label encoder
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result.

Run the compiles one at a time. They share one arduino-cli workspace per label,
and two runs at once, or a run killed part-way, leave a truncated cached object
that fails the next link with `ld: final link failed: file truncated`.

## Results, 27 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `normal` `07bf6b45`, `slideshow` `700fad3b`, and `module`
`32447bb5`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 385,571 / 3,145,728 (12%) | 27,684 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 392,183 / 3,145,728 (12%) | 28,428 / 327,680 (8%) |
| module | arduino-cli | pass | 385,563 / 3,145,728 (12%) | 27,684 / 327,680 (8%) |

The SR1230 sketch is 8 bytes of flash larger than the module's and uses the
same static RAM: the doubled count is one multiply in the decoder.

## What it does not cover

- **The board.** Nothing was flashed. One click moving pattern selection by one
  in both directions, and Position stepping by four per click, need the bench
  row the support matrix asks for.
- **The SD player sketch.** Its legacy control path (`ControlEncoder`) applies
  the same scale, but no player fixture was compiled here.
- **Other chips.** Only classic ESP32 was compiled.
