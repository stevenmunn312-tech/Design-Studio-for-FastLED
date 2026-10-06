# Fourier Epicycles

Status: implemented · Owner: app · Date: 2026-09-29

## Purpose

`FourierEpicycles` redraws a closed outline with a chain of rotating circles.
It takes the outline's discrete Fourier transform, keeps the largest terms,
and draws each term as a circle turning at its own whole-number rate. The
pen at the end of the chain traces the outline, leaving a fading trail.
The Harmonics knob sets how many circles are in use. Animating it grows a
single circle into the full outline, one term at a time. It is Phase 6 of
the [pattern node expansion](../plans/pattern-node-expansion.md).

## Node contract

- Inputs, in order: `base` (frame), `color`, `harmonics`, `speed`, `scale`,
  `thickness`, `persistence`, then `r`, `g`, `b`. Every float and colour
  channel is a property input; a wired `color` wins over the channels.
- `outline` is `circle`, `heart`, `lissajous`, `rose`, `star`, `square`,
  `infinity` or `custom`. The first four are Path's curves, from the shared
  `src/nodes/shapes/pathShapes.ts`. The list is append-only.
- `customPoints` is text: x,y pairs from −1 to 1, separated by commas, spaces
  or semicolons, 3 to 128 points, joined into a closed outline. Anything else
  (a non-number, an odd count, too few or too many points, or points with no
  length between them) draws the circle. The inspector shows the field only
  for the custom outline.
- `maxHarmonics` (4–64) sizes the coefficient table baked into the sketch, so
  it is a property, as Particles' `count` is.
- `harmonics` (1–64, fractional) is the number of circles in use, clamped to
  the table. A fraction draws the next circle at that fraction of its radius,
  so the morph is smooth.
- `speed` is turns of the outline per second, −2 to 2.
- `scale` (0.1–1) sizes the outline as a fraction of half the shorter canvas
  side. `thickness` (0.5–4 px) is the pen width.
- `persistence` (0–1) is how much of the trail survives each frame; 1 never
  fades. The default, 0.995, fades one byte per frame, so a trail lasts about
  four seconds at 60 frames per second.
- `showCircles` draws the circles as dim guides; `showPen` draws a brighter
  dot at the pen.

## Outlines and the transform

`src/nodes/shapes/fourierOutline.ts` samples every outline at 128 points. Curves are
sampled evenly in their parameter, polygons evenly by length. Built-in
outlines are centred on their bounding box and scaled to fill −1..1; a custom
outline keeps the author's coordinates.

The transform keeps every coefficient c_k for k from −64 to 63 as frequency
k, amplitude |c_k| and phase arg c_k. It drops terms below 10⁻⁶ of the
largest, sorts the rest largest first (ties by lower |k|, then the positive
one), and keeps `maxHarmonics` of them. A circle is one term. The heart is 9,
the Lissajous figure 4, the rose 2, and the square 32 at 128 samples. The star
and custom outlines use all 64 terms and come within a hundredth of the
outline, about a quarter of a pixel on a 64×64 panel.

The table is computed in TypeScript and cached per outline, custom text and
size. The sketch receives it as numbers in a `static const float [n][3]
PROGMEM` array, 12 bytes of flash per term, so outline names and custom text
never reach C++.

## Drawing

Per frame, with `turn = speed · t` wrapped to 0..1:

1. Start from the base frame, or black.
2. Walk the chain from the canvas centre. Before adding each circle's arm,
   draw that circle as a thin ring at 35% of the pen colour when it is at
   least half a pixel across.
3. Fade the trail, which lives in its own state, not in the output, so the
   base and the circles never smear into it.
4. Draw the pen's path since last frame into the trail, keeping the brighter
   channel. The path is sampled along the outline itself: one splat per half
   pixel of movement, up to 64, each a fresh evaluation of the chain at an
   in-between turn. A low frame rate therefore still draws the curve, not
   dots or chords across it. More than a quarter turn since last frame is a
   restart or a seek, and draws only the new point.
5. Add the trail to the output, then the pen head when `showPen` is on.

## Parity

The byte arithmetic is written out on both sides rather than left to
`nscale8` and `fadeToBlackBy`: FastLED's fixed `scale8`, `(c · (1 + s)) >> 8`,
truncating float-to-byte casts, and saturating adds. The preview copies it
exactly. `src/codegen/__tests__/fourierNativeParity.test.ts` compiles the
emitted block against a small CRGB stand-in with the host `g++` and compares
it with the preview after 120 to 300 frames on three outlines. With glibc the
frames match byte for byte; the test allows 1% of the canvas to differ,
because another maths library may round a sine differently. It is skipped
where no `g++` is installed.

## Cost

- Flash: 12 bytes per baked term, plus the shared helpers. Two nodes grew by
  1,152 bytes going from 16 to 64 terms each, exactly 12 per term, on classic
  ESP32 and on ESP8266.
- RAM: the trail is one CRGB per LED beside the node's own frame buffer,
  priced as `FourierEpicycles: 3` in `STATEFUL_EXTRA_BYTES_PER_LED`. The plan
  expected none, by fading the node's own buffer as Formula Points does, but
  that buffer also holds the base and the circles, which would then smear.
- Time: one sine and cosine per term per frame, the ring scans, and on a slow
  frame up to 64 extra chain evaluations for the trail.

Firmware evidence is in the
[pattern-node compile record](../reports/compile/pattern-node-compile-checks.md).
