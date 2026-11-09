# Frame Warp and the transform nodes

Three nodes move pixels around without drawing any: **Frame Warp** displaces a
finished frame per pixel, **Frame Transform** turns, scales, flips and slides a
whole frame, and **Field Transform** (`FieldWarp`) does both for a scalar field
before it is painted. Each has one kernel per side, the preview in TypeScript
beside the C++ the sketch emits, so the two cannot drift.

One node owns each job: a whole-frame move, still or animated, is Frame
Transform's (it absorbed the old Transform node and Frame Warp's zoom and
rotate), and every field move is Field Transform's (it absorbed Field Rotate
and Field Tile). Array, Frame Feedback and Tile Symmetry keep their own
offset, turn and scale, because each repeats or feeds back a frame rather
than moving it once.

## Frame Warp

`FrameWarp` reads a finished RGB frame at a different coordinate for every
output pixel. In front of Frame Feedback this gives the continuous swirl and
smear associated with the Milkdrop/projectM per-pixel warp model, without
importing projectM's runtime expression evaluator or shader pipeline. A
whole-frame turn or zoom is Frame Transform's; Frame Warp's own zoom and rotate
moved there.

The primary `Frame` input is followed by `Offset X` and `Offset Y` fields, then
a wireable `Strength`, measured in source pixels (0–8). The remaining
properties select an edge policy (`clamp`, `wrap` or `black`) and sampling
(`bilinear` or `nearest`). Bilinear is the default because fractional reads
stay stable as an edge moves; nearest is useful for deliberately hard pixel
art. Output pixel `(x, y)` reads the source at itself plus:

```text
((2 * dx) - 1) * strength
((2 * dy) - 1) * strength
```

An unwired offset field reads as 0.5, so it contributes no displacement. With
no offset fields and Motion `none`, the node is an exact identity, including
under bilinear sampling at integral coordinates.

### Built-in motion

With neither offset field wired, `motion` supplies the push instead, so one
node makes liquid motion: `swirl` (a turn about the centre that rolls outward
in rings and fades at the rim), `ripple` (rings that push out and pull in as
they travel) or `turbulence` (two crossed layers of sines). Each push spans
about -1 to 1 per unit of Strength, as a wired field's `2v - 1` does, at the
point measured from the centre in half-sizes of the longer side. The phase is
`motionSpeed` cycles a second integrated through `speedPhase` and its
firmware twin, so a wired speed does not jump. The new node's default is
`swirl`, because a fresh Frame Warp used to do nothing visible. The formulas
are plain sines in `src/nodes/composite/frameWarpMotion.ts`, beside the C++
the sketch emits; one wired field turns the motion off and the other axis
reads 0.5 as before. A moving warp's block reads its phase, so the
first-frame-only freeze never takes it.

## Frame Transform

`FrameTransform` (`src/nodes/composite/frameTransform.ts`) applies a turn, a
scale, two flips and a slide, in that order, so a destination pixel finds its
source by undoing them in reverse. Rotate (degrees), Scale and Offset X/Y
each have a Rate beside them: degrees a second, percent of a doubling a
second, and LEDs a second. Every value and rate is a property input, and each
rate is integrated through `speedPhase` (terms `rotate`, `scale`, `x`, `y`),
so a wired rate never jumps. The Scale rate keeps Transform's breathing zoom
(`transformZoom.ts`): it swings between double and half the set Scale and
back, exponentially, 100 being one doubling a second.

The Mode select chooses the kernel:

- **Exact** keeps whole pixels, as Frame Transform always did. The turn snaps
  to the nearest quarter turn and is applied on normalised coordinates, so a
  turned picture is stretched to fit a non-square matrix. The slide, value
  plus integrated rate, is rounded (`floor(v + 0.5)` on both sides) and wraps
  round the edges. Every output pixel is a copy of an input pixel: nothing is
  resampled, and Scale, Edges and Sampling are hidden.
- **Smooth** turns by any angle about the canvas centre, scales, and slides
  by fractions of a pixel, then reads through the shared frame sampler
  below with its own edge mode (`black` by default, `clamp` or `wrap`) and
  sampling (`bilinear` by default, or `nearest`).

On a square matrix a Smooth quarter turn lands on the same pixels as Exact's.
The sketch leaves out every step the graph can never move: an unwired value at
rest and an unwired rate of 0 emit nothing, a fixed turn in Exact is unrolled
into that many quarter turns, and a node with nothing to do is a plain
`memmove` that scratch sharing turns into running in place. Exact's turn
becomes a loop over a run-time count only when a wire or a rate moves it.

Conversions from the removed nodes keep their look: Transform's rotate and
scale are Smooth with `nearest` and `black` (Transform's own sampling), its
translate is Exact with the slide on the rate of its direction, and Frame
Warp's zoom and rotate with no push are Smooth with the warp's edge and
sampling. `frameTransform.test.ts` holds each against a copy of the removed
code, and both kernels against their C++ through `compileCppSnippet`.

## Field Transform

`FieldWarp` (`src/nodes/field/fieldTransform.ts`) is labelled Field Transform
and mirrors Frame Warp for fields: a destination pixel is pushed by
`(2v - 1) × Strength` canvas pixels from the Offset X and Y fields, turned by
Angle plus the integrated Spin about the canvas centre, zoomed (above 1
enlarges), and then tiled: Tiles X and Y (whole copies, 1–8) repeat the field
from the top-left corner. The edge mode resolves every read past the field's
own edges, index by index, so `clamp` holds the edge (the default), `wrap`
repeats the field and `mirror` reflects every other copy, repeating the edge
pixel so copies join without a seam. Reads are bilinear by default, blending
the four neighbours in the order the old Field Warp did, or nearest.

Two old faults are gone. Field Rotate always wrapped, so a ramp or an edge
shape pulled the far side into the corners; the turn now holds the edge
unless Wrap is chosen. Field Tile shrank a field by skipping pixels, so fine
detail dropped out; a pixel that the tiles or a zoom below 1 squeeze several
source pixels into now averages an n × n grid of reads across its own area,
n being `ceil(max(tilesX, tilesY) / zoom)`, at most 4. With whole tiles and
no turn the grid lands on pixel centres, an exact box average.

As with Frame Transform, the sketch emits only the steps the graph can move
(no push without an offset field, no turn while Angle and Spin are unwired at
0, no zoom at an unwired 1, no tiles at an unwired 1 × 1), and the read count
is a constant unless Zoom or a Tiles count is wired. The preview skips the
same steps by their values, which reads the same numbers.
`fieldTransform.test.ts` runs the emitted loop through `compileCppSnippet`
against the preview for every edge mode and step, and holds the push and a
nearest, wrapped turn to the removed Field Warp and Field Rotate.

Bundled conversions: a Field Rotate became a Field Transform with `wrap`, so
the rotating patterns keep their corners; Lissajous Lattice's and Tiled Aurora
Silk's tile-then-rotate pairs became one node, which tiles and then turns the
tiled plane as the pair did, now without a seam.

## Shared sampler and parity

The browser implementation of Frame Warp and Smooth Frame Transform uses
`sampleFrame` in `src/state/evaluator/frames.ts`. The generated sketch uses
`_sampleFrame` from `src/codegen/helpers/frameSampleHelperCpp.ts`, emitted
once behind `needsFrameSample`. Both resolve every bilinear neighbour
independently through the edge policy and round the weighted RGB sum once.

The same pair owns the bilinear reads used by the five 3D transitions.
Their depth shade stays inside the weighted sum through the scaled form of the
sampler, preserving the existing transition golden output while removing the
private sampler that could otherwise drift from Frame Warp.

Frame Warp and Frame Transform allocate only their ordinary three-byte-per-pixel
output frame, and Field Transform its float field. None keeps state beyond
its speed-clock phases; Frame Feedback owns the history when it follows them.

## Help examples

The node reference inserts Noise, then Frame Warp with its built-in turbulence,
then Frame Feedback. Wrap edges keep the source continuous while the feedback
node supplies persistence without forming a graph cycle. Frame Transform's
example turns Fire a quarter turn so it streams sideways; Field Transform's
pushes three stripes with two noise fields. Transform, Field Rotate and Field
Tile went with their nodes, together with their reference pages.
