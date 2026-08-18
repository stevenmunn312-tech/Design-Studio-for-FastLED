# Per-output native rendering

**Status:** decided, not implemented. Decided 2026-08-18 from the bench.

## The problem

Studio renders one shared *composition canvas* — the largest route in each axis
— and then fits or crops that single frame into each physical output
(`src/state/outputRouting.ts`). Firmware does the same: `cppGenerator` emits one
render at composition dimensions and routes into per-output `leds_<id>` arrays.

That works when several outputs are windows onto one picture — a video wall
split across panels, which is what `crop` mode exists for. It fails when two
outputs of different shapes each want to show the *whole* pattern.

Observed on the bench: a 60-LED strip and a 16x16 matrix on one graph produce a
60x16 canvas. The matrix is `fit`, so the full 60-wide render is squeezed into
16 columns and shows a distorted sliver; the strip averages 16 rows into 1. Both
outputs are wrong, and the flashed sketch is wrong the same way.

Two contributing details:

- LED strings are hardcoded `routeMode: 'fit'` and cannot opt into `crop`.
- Unconnected outputs used to size the canvas too. Fixed 2026-08-18 — an output
  with nothing wired into its Frame input no longer votes (`compositionDims`
  takes the edges and filters). That removed the surprising half of the bug but
  not the connected case, which is this note.

## The decision

**Each output renders the graph at its own dimensions.** A 60x1 strip evaluates
at 60x1; a 16x16 matrix evaluates at 16x16. Neither distorts the other.

`fit`/`crop` stay, because a genuine multi-panel composition still wants one
shared canvas. The change is that *native* becomes the default, and the shared
canvas applies only to outputs that explicitly ask for it.

## What it costs

This is the part to design carefully rather than discover during implementation.

**Preview:** one `evaluateGraphFull` pass per distinct native output shape,
rather than one overall. The preview panel displays a single route at a time, so
the displayed route is cheap; the cost lands on per-node thumbnails and the
hardware view, which read published node outputs and currently assume one pass.
Decide which pass publishes `previewStore` outputs, or publish per route.

**Firmware:** the harder half. The generated sketch bakes one `width`/`height`
into `NUM_LEDS`, every `buf_<id>` render buffer, the baked `XY()` table and
expression scaling. Per-output rendering means either

- sizing every intermediate buffer to the largest output and re-rendering
  sequentially into the same buffers, populating each `leds_<id>` in turn before
  a single `FastLED.show()` — cheap in RAM, N times the per-frame work; or
- separate buffer sets per shape — faster, but multiplies the RAM that is
  already the binding constraint on a non-PSRAM ESP32 (the classic ESP32 bench
  build has hit 91% flash and the SD-show player has hit the DRAM ceiling).

The first is almost certainly right: RAM is the scarce resource, frame time is
not, and stateful nodes already keep their own state per instance.

**Stateful nodes need care.** `Fire`, `Particles`, `Trails` and friends key
their state by node id. Rendering the same node twice per frame at two shapes
must not advance one simulation twice or share a buffer sized for the other
shape — the record/capture path already solves this with a per-pass
`instancePrefix`, and the same trick applies.

## One pattern, rendered twice — not two patterns

Worth stating plainly, because it is the natural worry: per-output rendering
does **not** duplicate the pattern in firmware. The generated sketch still
contains one emitted render body. It is invoked once per output shape, so a
strip and a matrix showing the same pattern cost a second pass over the same
code at a different grid size, not a second copy of the code. Flash is unchanged;
frame time is what grows.

**Outputs of identical dimensions share a pass.** Two 16x16 matrices on
different pins want the same rasterisation, so the implementation should group
routes by (width x supersample, height x supersample) and render once per
distinct shape — not once per output. The common "same pattern on several
identical panels" case then costs exactly what it does today.

## Same pin is a different question

Two devices daisy-chained on **one** GPIO are one chain, not two outputs — a
16x16 matrix followed by a 60-LED strip is a single 316-LED run. Studio already
models that as **one** output node whose `layout` is `custom` (an explicit
`0..N-1` permutation) or `panels`, not as two nodes. This note is only about
outputs on separate pins, each driving its own chain.

Keeping those distinct matters for the UI too: "add a second LED output" and
"extend this output with another physical section" are different intentions, and
the hardware view will eventually need to express both.

## Preview and firmware must land together

CLAUDE.md's standing rule. A preview-only fix would look correct and quietly
disagree with what gets flashed, which is worse than the visible bug.

## Not this

- Making the canvas smarter. Any single shared canvas distorts one shape or the
  other; the aspect mismatch is the whole problem.
- Defaulting mismatched outputs to `crop`. Undistorted, but each output then
  shows only a window of the pattern, which is not what "put this pattern on my
  strip and my matrix" means.
