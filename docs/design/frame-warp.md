# Frame Warp

`FrameWarp` is the frame-level counterpart to `FieldWarp`: it reads a finished
RGB frame at a different coordinate for every output pixel. In front of Frame
Feedback this gives the continuous zoom, swirl and smear associated with the
Milkdrop/projectM per-pixel warp model, without importing projectM's runtime
expression evaluator or shader pipeline.

## Node contract

The primary `Frame` input is followed by `Offset X` and `Offset Y` fields, then
wireable `Strength`, `Zoom` and `Rotate` properties. Strength is measured in
source pixels (0–8), Zoom is clamped to 0.25–4, and Rotate is degrees about the
canvas centre. The remaining properties select an edge policy (`clamp`, `wrap`
or `black`) and sampling (`bilinear` or `nearest`). Bilinear is the default
because fractional reads stay stable as an edge moves; nearest is useful for
deliberately hard pixel art.

For output pixel `(x, y)`, the node applies inverse zoom and inverse rotation
about `((W-1)/2, (H-1)/2)`, then adds:

```text
((2 * dx) - 1) * strength
((2 * dy) - 1) * strength
```

An unwired offset field reads as 0.5, so it contributes no displacement. With
no offset fields, Motion `none`, Zoom 1 and Rotate 0, the node is an exact
identity, including under bilinear sampling at integral coordinates.

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

## Shared sampler and parity

The browser implementation uses `sampleFrame` in
`src/state/evaluator/frames.ts`. The generated sketch uses `_sampleFrame` from
`src/codegen/helpers/frameSampleHelperCpp.ts`, emitted once behind `needsFrameSample`.
Both resolve every bilinear neighbour independently through the edge policy and
round the weighted RGB sum once.

The same pair now owns the bilinear reads used by the five 3D transitions.
Their depth shade stays inside the weighted sum through the scaled form of the
sampler, preserving the existing transition golden output while removing the
private sampler that could otherwise drift from Frame Warp.

Frame Warp allocates only its ordinary three-byte-per-pixel output frame. It
has no persistent state; Frame Feedback owns the history when the two are used
together.

## Help example

The node reference inserts Noise, then Frame Warp with its built-in turbulence,
then Frame Feedback. Wrap edges
keep the source continuous while the feedback node supplies persistence without
forming a graph cycle.
