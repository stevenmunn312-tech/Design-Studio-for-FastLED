# Strings and rings: the track contract

Status: implemented · Owner: app · Date: 2026-09-29

## Purpose

Most pattern nodes are drawn for a rectangular canvas. A string has one row and
a ring has a circle of pixels, so a node built for a string draws along a
*track* instead. `src/state/evaluator/stringTrack.ts` is the one place that says
which canvas pixel each position on a track lands on. The preview and the
generated sketch both follow it. String Particles uses it today, and Gauge
(Phase 10 of the [pattern node expansion](../plans/pattern-node-expansion.md))
will use it too.

## Tracks

| `track` | Positions | Canvas pixel |
| --- | --- | --- |
| `row` | `WIDTH` | the middle row, `(HEIGHT/2)*WIDTH + k` |
| `column` | `HEIGHT` | the middle column, `k*WIDTH + WIDTH/2` |
| `ring` | `ringLeds` (3–300) | `ringSampleMap(ringLeds, 0, 'cw', W, H)[k]` |

- The ring track is the inscribed circle through pixel centres that an LED
  Ring's output reads. Set `ringLeds` to the output's LED count and every
  particle lands on a pixel the ring samples; any other count still draws on the
  circle, but not on every ring pixel.
- The sketch computes the ring's index table once at start-up from `WIDTH` and
  `HEIGHT`, with the same rounding as `ringSampleMap`, so it stays correct when
  the output is supersampled.
- A track wraps: position `len` is position 0. `trackSplat` splits a sub-pixel
  position across its two neighbouring cells, and the far neighbour wraps, so a
  particle crossing the seam fades out of one end as it fades in at the other.

## String Particles

- The pool holds `count` particles (1–64), about 17 bytes each: position,
  velocity, life and hue as floats, plus a one-byte kind. Slots with no life are
  free. The pool never grows past `count`.
- The trail is one byte per channel per track cell. Each frame it is scaled by
  `fade` (`scale8`), then every live particle adds to it (`qadd8`). The preview
  uses the same integer maths as the sketch.
- `drift`: a dead slot respawns with probability `spawn`. Power falls from 1 to 0
  and drives speed, brightness and how washed-out the colour is together.
- `meteors`: a noise bed (`bed`), ambient sparks at probability `0.3 * spawn`,
  and a fast meteor with three pieces of debris on each rising edge of
  `trigger`. The edge is detected inside the node, so a trigger held high
  fires once.

## Known gaps

- The preview draws random numbers from a seeded LCG and its bed from simplex
  noise. The sketch uses `random16` and `inoise8`. With the same `seed` the
  structure matches and the exact particle paths do not, as with Particles.
