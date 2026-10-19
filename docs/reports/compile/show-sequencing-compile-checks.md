# Show-sequencing compile checks

> **Status: fixtures and the dead-code corpus compiled.** Four ESP32-S3
> sketches and all 250 dead-code sketches passed on 19 October 2026. This is
> compile evidence only. Weighted picks, energy tags, restart and resume, lane
> ramps, named inputs, and both sequence players stay experimental in the
> [support matrix](../../release/beta-support-matrix.md) until a bench row
> compares preview and LEDs. No board has been flashed.

The fixtures are generated from Studio graphs by
`scripts/compile-fixtures/show-sequencing.ts`:

- `weighted-player` — generic Music Player, two solid colours, weight 4 on the
  peak entry and calm/peak energy tags, so the sketch carries `patternPick`
  and the energy-band tracker.
- `sequenced-player` — the same player in Sequence order with Beat Transitions
  on. One step names an index. The next picks by a drop section and a peak
  tag. Holds count beats. The walker is a C++ lambda.
- `sequenced-slideshow` — Pattern Slideshow, Sequence order, Solid Colour set
  to resume and Noise set to restart. Noise's `render_p1` takes the entry
  flag. Holds are 4 s and 6 s, with a crossfade and a wipe.
- `ramped-show` — performance player, one Bass Pulse pattern, a `glow` Group
  Input, a 4 s brightness ramp and a 1 s `SET_PARAM` ramp. `ShowRamp::sample`
  and `ShowRamp::begin` are methods. A free function is prototyped by Arduino
  before the struct exists; the first compile of this sketch failed that way
  (`'ShowRamp' does not name a type`) and the passing build is the method form.

## Reproduce

From the repository root, with no other arduino-cli process running:

```powershell
npm run gen:compile-fixtures -- show-sequencing
python scripts/compile-fixtures/compile-matrix.py --only show-sequencing/
```

The runner uses the helper's compile path and never flashes. Logs and JSON
reports land beside the sketches in `artifacts/show-sequencing-compile/`.
That directory is gitignored. Run compiles one at a time.

## Result, 19 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.
Program storage limit 3,145,728 bytes. RAM limit 327,680 bytes.

The weighted player, sequenced player and sequenced slideshow finished in
`artifacts/compile-matrix/2026-10-19_1957`. The ramped show passed on the
following run, `artifacts/compile-matrix/2026-10-19_2009`, completed
2026-10-19T09:40:24Z.

| Fixture | Result | Flash | RAM | Source |
| --- | --- | --- | --- | --- |
| weighted-player | pass | 1,146,383 (36%) | 50,444 (15%) | `3fa297e15c54` |
| sequenced-player | pass | 1,146,247 (36%) | 50,404 (15%) | `0a97d6fbd210` |
| sequenced-slideshow | pass | 433,239 (13%) | 32,372 (9%) | `d08a5e2f7ca5` |
| ramped-show | pass | 1,077,119 (34%) | 43,388 (13%) | `be81bcdb9080` |

## Dead-code corpus, 19 October 2026

`python scripts/compile-fixtures/compile-matrix.py --only dead-code/ --low-priority`,
resumed from `artifacts/compile-matrix/2026-10-16_0244` and the partial runs
`2026-10-19_1223`, `2026-10-19_1305` and `2026-10-19_1308`. Finished
2026-10-19T20:29:31. Summary:
`artifacts/compile-matrix/2026-10-19_2013`.

250 of 250 passed. 233 sketches were unchanged and were carried from the
earlier pass. 17 were rebuilt because their source changed. Five of those
kept the same flash size (`music-no-patterns`, `music-one-pattern`,
`music-vu-only`, `performance-builtin`, `performance-one-pattern`). The other
twelve grew by the amounts below. RAM deltas are beside the flash deltas.
Same toolchain and the same ESP32-S3 target as the fixtures above.

| Sketch | Flash | Δ flash | Δ RAM |
| --- | ---: | ---: | ---: |
| music-beat-transitions | 1,149,431 | +340 | +16 |
| music-paced | 1,150,719 | +356 | +16 |
| music-particles | 1,150,371 | +320 | +32 |
| music-three-patterns | 1,075,307 | +300 | +16 |
| performance-audio-controls | 1,081,695 | +252 | +32 |
| performance-collection | 1,088,431 | +264 | +32 |
| performance-no-group-inputs | 1,078,411 | +256 | +16 |
| slideshow-3d-pool | 436,647 | +196 | +16 |
| slideshow-cut | 432,479 | +108 | +16 |
| slideshow-mixed | 437,095 | +240 | +32 |
| slideshow-one-warp | 427,927 | +144 | +32 |
| slideshow-sequential | 428,107 | +204 | +32 |
