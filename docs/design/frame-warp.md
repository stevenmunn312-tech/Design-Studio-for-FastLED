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
no offset fields, Zoom 1 and Rotate 0, the node is an exact identity, including
under bilinear sampling at integral coordinates.

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

The node reference inserts Noise plus two Field Formula nodes that produce a
slow polar displacement, followed by Frame Warp and Frame Feedback. Wrap edges
keep the source continuous while the feedback node supplies persistence without
forming a graph cycle.
