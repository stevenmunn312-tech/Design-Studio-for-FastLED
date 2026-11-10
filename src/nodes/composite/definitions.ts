// Effect node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const COMPOSITE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'Blur2D',
    label: 'Blur 2D',
    category: 'composite',
    subcategory: 'Trails & Blur',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'amount', label: 'Amount', dataType: 'float' },
    ],
    propertyInputs: { amount: 'amount' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { amount: 0.15 },
  },
  {
    // Frame blend with real blend modes — composites B over A per `blendMode`,
    // mixed by `amount` (opacity, 0–1; scaled to FastLED's 0–255 in the
    // evaluator/codegen). Replaces the former LayerBlend + BlendFrames. See
    // PROPERTY_META.blendMode and the `Blend` case in graphEvaluator/cppGenerator.
    type: 'Blend',
    label: 'Blend',
    category: 'composite',
    subcategory: 'Layer',
    inputs: [
      { id: 'a',      label: 'A',       dataType: 'frame' },
      { id: 'b',      label: 'B',       dataType: 'frame' },
      { id: 'amount', label: 'Opacity', dataType: 'float' },
      // A per-pixel opacity: the mask frame's brightness scales `amount`
      // where it is dark, so B shows through only inside a shape or gradient.
      { id: 'mask', label: 'Mask', dataType: 'frame' },
    ],
    propertyInputs: { amount: 'amount' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    // Dropping Blend onto a frame noodle inserts that existing stream as the
    // base layer; B remains free for the frame that will be composited over it.
    spliceInput: 'a',
    defaultProperties: { blendMode: 'normal', amount: 0.5 },
  },
  {
    // Scales a frame per-pixel by a mask frame's luminance — feed any soft
    // frame (gradient, radial) as the mask for feathered edges.
    type: 'Mask',
    label: 'Mask',
    category: 'composite',
    subcategory: 'Layer',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'mask',  label: 'Mask',  dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {},
  },
  {
    // Glitter overlay — FastLED's addGlitter() over any frame: a handful of
    // random pixels take the glitter colour each frame (added, or replacing),
    // so a quiet pattern sparkles. The count follows `density` and the
    // matrix size; a seed makes the sparkle positions repeatable.
    type: 'Glitter',
    label: 'Glitter',
    category: 'composite',
    subcategory: 'Layer',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'density', label: 'Density', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: { density: 'density', r: 'r', g: 'g', b: 'b' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { density: 0.3, glitterMode: 'add', r: 255, g: 255, b: 255, seed: 0 },
  },
  {
    // Turn, scale, flip and slide a frame (./frameTransform.ts). Exact keeps
    // whole pixels: quarter turns, flips and a wrapping slide, nothing
    // resampled, which fixes a panel mounted sideways or scrolls a pattern.
    // Smooth turns by any angle, scales and slides by fractions of a pixel
    // through the shared frame sampler. Turn, scale and slide each take a
    // per-second rate, so one node also keeps a frame moving.
    type: 'FrameTransform',
    label: 'Frame Transform',
    category: 'composite',
    subcategory: 'Geometry',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      // Each socket sits on its property row, so it reads as the row does.
      { id: 'rotate', label: 'Rotate (°)', dataType: 'float' },
      { id: 'rotateRate', label: 'Rate (°/s)', dataType: 'float' },
      { id: 'scale', label: 'Scale (×)', dataType: 'float' },
      { id: 'scaleRate', label: 'Rate (%/s)', dataType: 'float' },
      { id: 'offsetX', label: 'Offset X (px)', dataType: 'float' },
      { id: 'offsetY', label: 'Offset Y (px)', dataType: 'float' },
      { id: 'offsetXRate', label: 'X Rate (px/s)', dataType: 'float' },
      { id: 'offsetYRate', label: 'Y Rate (px/s)', dataType: 'float' },
    ],
    propertyInputs: {
      rotate: 'rotate', rotateRate: 'rotateRate', scale: 'scale', scaleRate: 'scaleRate',
      offsetX: 'offsetX', offsetY: 'offsetY', offsetXRate: 'offsetXRate', offsetYRate: 'offsetYRate',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      mode: 'exact',
      rotate: 0, rotateRate: 0,
      scale: 1, scaleRate: 0,
      flipX: false, flipY: false,
      offsetX: 0, offsetY: 0, offsetXRate: 0, offsetYRate: 0,
      edgeMode: 'black', sampling: 'bilinear',
    },
  },

  {
    type: 'BrightnessMod',
    label: 'Brightness',
    category: 'composite',
    subcategory: 'Color',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'brightness', label: 'Brightness', dataType: 'float' },
    ],
    propertyInputs: { brightness: 'brightness' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { brightness: 1.0 },
  },
  {
    type: 'HueShift',
    label: 'Hue Shift',
    category: 'composite',
    subcategory: 'Color',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'shift', label: 'Shift', dataType: 'float' },
    ],
    propertyInputs: { shift: 'shift' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { shift: 0 },
  },
  {
    // Perceptual gamma correction (FastLED napplyGamma_video) so gradients and
    // fades look right on the LEDs. gamma ≈ 2.2–2.8 for typical WS2812B strips.
    type: 'Gamma',
    label: 'Gamma',
    category: 'composite',
    subcategory: 'Color',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'gamma', label: 'Gamma', dataType: 'float' },
    ],
    propertyInputs: { gamma: 'gamma' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { gamma: 2.2 },
  },
  {
    // RGB→HSV→scale saturation→RGB; `amount` 1 = unchanged, 0 = greyscale,
    // >1 = boosted (clamped). Shares HueShift's inline RGB↔HSV extraction.
    // `keepBrightness` scales distance from the Rec. 709 luma instead, so
    // washed-out content gains colour without brightening (the old Color
    // Boost, whose boost b is amount 1 + 1.5b here).
    type: 'Saturation',
    label: 'Saturation',
    category: 'composite',
    subcategory: 'Color',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'amount', label: 'Amount', dataType: 'float' },
    ],
    propertyInputs: { amount: 'amount' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { amount: 1, keepBrightness: false },
  },
  {
    // Blender-style array modifier: repeat the input frame `count` times, each
    // copy offset/rotated/scaled by an accumulating step from the previous, then
    // composited. Rotation/scale accumulate about the matrix centre (angle with
    // zero offset ⇒ a radial ring; offset + falloff ⇒ an echo trail; scale<1 +
    // angle ⇒ a recursive spiral). Best fed a small/sparse source shape.
    type: 'Array',
    label: 'Array',
    category: 'composite',
    subcategory: 'Geometry',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      // Wire a signal here to animate the array — e.g. a Counter/Sin into `angle`
      // spins the whole ring; a stepped signal into `count` grows/shrinks it.
      { id: 'count', label: 'Count', dataType: 'float' },
      { id: 'offsetX', label: 'Offset X', dataType: 'float' },
      { id: 'offsetY', label: 'Offset Y', dataType: 'float' },
      { id: 'angle', label: 'Angle', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'falloff', label: 'Falloff', dataType: 'float' },
    ],
    propertyInputs: {
      count: 'count', offsetX: 'offsetX', offsetY: 'offsetY',
      angle: 'angle', scale: 'scale', falloff: 'falloff',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      count: 5,
      offsetX: 3,
      offsetY: 0,
      angle: 0,
      scale: 1,
      falloff: 0.7,
      // Lighten, not add: five copies at falloff 0.7 add up to about 2.8x,
      // which turns a full-frame source such as Plasma almost white.
      blendMode: 'lighten',
    },
  },
  {
    type: 'Invert',
    label: 'Invert',
    category: 'composite',
    subcategory: 'Color',
    inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {},
  },
  {
    // Reflects a frame into symmetry — `mirrorMode` picks the axis: horizontal
    // (left→right), vertical (top→bottom), quad (4-way), or diagonal (across the
    // main diagonal). A pure per-pixel coordinate remap; evaluator and codegen
    // share the same source-coordinate logic. See PROPERTY_META.mirrorMode.
    // `glow` blends each pixel with its reflected partner instead of hard-copying
    // one half — a symmetric bloom where the two halves overlap, its strength set
    // by `glowAmount`. The bloom is multiplied per-channel by the `Tint` colour
    // (wired or the r/g/b swatch); white is neutral, so a colour filters the glow.
    // `radial` is the old Kaleidoscope: each pixel's polar angle folds into one
    // of `segments` mirrored wedges, turned by Tile Symmetry's Rotation and
    // Spin (./mirror.ts). It has no glow: no single partner to blend in.
    type: 'Mirror',
    label: 'Mirror',
    category: 'composite',
    subcategory: 'Geometry',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'color', label: 'Tint', dataType: 'color' },
      { id: 'glowAmount', label: 'Glow', dataType: 'float' },
      { id: 'segments', label: 'Segments', dataType: 'float' },
      { id: 'rotation', label: 'Rotation', dataType: 'float' },
      { id: 'spin', label: 'Spin', dataType: 'float' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: {
      glowAmount: 'glowAmount', segments: 'segments', rotation: 'rotation', spin: 'spin', r: 'r', g: 'g', b: 'b',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      mirrorMode: 'horizontal', glow: false, glowAmount: 0.35, segments: 6, rotation: 0, spin: 0, r: 255, g: 255, b: 255,
    },
  },
  {
    // Feedback/trails buffer — persists its own output across frames, fading
    // by `decay` each tick and re-lightening wherever the incoming frame is
    // brighter (per-channel max). The canonical fadeToBlackBy()-and-accumulate
    // idiom, generalised to any upstream pattern (Circle, Blobs, Text, …).
    type: 'Trails',
    label: 'Trails',
    category: 'composite',
    subcategory: 'Trails & Blur',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'decay', label: 'Decay', dataType: 'float' },
    ],
    propertyInputs: { decay: 'decay' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { decay: 0.15 },
  },
  {
    // Per-pixel frame displacement in the Milkdrop/projectM tradition. Two
    // fields push the source coordinate before one shared nearest/bilinear
    // frame sample; a whole-frame turn or zoom is Frame Transform's.
    // With neither field wired, `motion` pushes instead (./frameWarpMotion.ts),
    // animated at `motionSpeed` cycles a second, so a lone node moves.
    type: 'FrameWarp',
    label: 'Frame Warp',
    category: 'composite',
    subcategory: 'Geometry',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'dx', label: 'Offset X', dataType: 'field' },
      { id: 'dy', label: 'Offset Y', dataType: 'field' },
      { id: 'strength', label: 'Strength', dataType: 'float' },
      { id: 'motionSpeed', label: 'Motion Speed', dataType: 'float' },
    ],
    propertyInputs: { strength: 'strength', motionSpeed: 'motionSpeed' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      strength: 2,
      motion: 'swirl',
      motionSpeed: 0.25,
      edgeMode: 'clamp',
      sampling: 'bilinear',
    },
  },
  {
    // Wallpaper-group repetition for a finished frame. Square and hexagonal
    // groups select their matching lattice automatically.
    type: 'Symmetry',
    label: 'Tile Symmetry',
    category: 'composite',
    subcategory: 'Geometry',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'cells', label: 'Cells', dataType: 'float' },
      { id: 'rotation', label: 'Rotation', dataType: 'float' },
      { id: 'spin', label: 'Spin', dataType: 'float' },
      { id: 'offsetX', label: 'Offset X', dataType: 'float' },
      { id: 'offsetY', label: 'Offset Y', dataType: 'float' },
    ],
    propertyInputs: {
      cells: 'cells', rotation: 'rotation', spin: 'spin',
      offsetX: 'offsetX', offsetY: 'offsetY',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      group: 'p4m', cells: 2, rotation: 0, spin: 0, offsetX: 0, offsetY: 0,
    },
  },
  {
    // Bounded recursive frame feedback without graph cycles: composites a
    // delayed copy of this node's own prior output over the live input. The
    // history buffer is fixed by `delayFrames` so RAM cost is predictable.
    type: 'FrameFeedback',
    label: 'Frame Feedback',
    category: 'composite',
    subcategory: 'Trails & Blur',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      // Opacity, as Blend calls the same 0-1 mix (its row says opacity too).
      { id: 'amount', label: 'Opacity', dataType: 'float' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
      { id: 'offsetX', label: 'Offset X', dataType: 'float' },
      { id: 'offsetY', label: 'Offset Y', dataType: 'float' },
      { id: 'angle', label: 'Angle', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
    ],
    propertyInputs: {
      amount: 'amount', fade: 'fade', offsetX: 'offsetX',
      offsetY: 'offsetY', angle: 'angle', scale: 'scale',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      delayFrames: 2,
      fade: 0.08,
      amount: 0.5,
      blendMode: 'screen',
      feedbackTransform: 'none',
      offsetX: 0,
      offsetY: 0,
      angle: 0,
      scale: 1,
    },
  },
  {
    // Manual A/B frame selector — shows A when `sel` is false, B when true
    // (the bool-driven counterpart of the time-based Sequencer). Falls back to
    // whichever side is wired when the other is empty. Unwired, the `select`
    // switch picks the side, so it works as a manual or remote A/B toggle.
    type: 'FrameSwitch',
    label: 'Frame Switch',
    category: 'composite',
    subcategory: 'Layer',
    inputs: [
      { id: 'a', label: 'Frame A', dataType: 'frame' },
      { id: 'b', label: 'Frame B', dataType: 'frame' },
      { id: 'sel', label: 'Select', dataType: 'bool' },
    ],
    propertyInputs: { select: 'sel' },
    defaultExposedInputs: ['sel'],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { select: false },
  },
  {
    // Rectangular regions ("zones") for installations with multiple
    // logical display areas — each zone routes its own wired frame into its
    // rectangle of the matrix (normalized 0–1 x/y/w/h), later zones painting
    // over earlier ones where they overlap. An unwired or disabled zone
    // leaves its rectangle showing whatever `base` (or an earlier zone)
    // already put there, so partially wiring the node is non-destructive.
    // A zone shows the part of its frame that lies inside the rectangle;
    // with Fit on it squeezes the whole frame into it (nearest neighbour).
    type: 'Zones',
    label: 'Zones',
    category: 'composite',
    subcategory: 'Layer',
    inputs: [
      { id: 'base', label: 'Base', dataType: 'frame' },
      { id: 'a', label: 'Zone A', dataType: 'frame' },
      { id: 'b', label: 'Zone B', dataType: 'frame' },
      { id: 'c', label: 'Zone C', dataType: 'frame' },
      { id: 'd', label: 'Zone D', dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      aEnabled: true, aX: 0,   aY: 0,   aW: 0.5, aH: 0.5, aFit: false,
      bEnabled: true, bX: 0.5, bY: 0,   bW: 0.5, bH: 0.5, bFit: false,
      cEnabled: true, cX: 0,   cY: 0.5, cW: 0.5, cH: 0.5, cFit: false,
      dEnabled: true, dX: 0.5, dY: 0.5, dW: 0.5, dH: 0.5, dFit: false,
    },
  },
]

export const COMPOSITE_DESCRIPTIONS: Record<string, string> = {
  // composite
  Blur2D: 'Box-blurs the frame.',
  Blend: 'Blends B over A — normal, multiply, screen, overlay, add, difference or lighten.',
  Mask: 'Masks a frame by another frame’s brightness.',
  Glitter: 'Sprinkles random sparkles of one colour over a frame each frame.',
  FrameTransform: 'Turns, scales, flips and slides a frame, held still or kept moving.',
  BrightnessMod: 'Dims or amplifies a frame with saturated 0–3× scaling.',
  HueShift: 'Rotates all hues.',
  Gamma: 'Perceptual gamma correction so gradients look right on the LEDs.',
  Saturation: 'Scales color saturation (0 = greyscale), optionally keeping brightness.',
  Array: 'Repeats a frame N times with an accumulating offset/rotate/scale, composited.',
  Invert: 'Inverts colors.',
  Mirror: 'Mirrors a frame across an axis or into kaleidoscope wedges, with optional glow.',
  Trails: 'Fades the previous frame and re-lightens where the input is brighter.',
  FrameWarp: 'Displaces each pixel by two fields or a built-in swirl, ripple or turbulence.',
  Symmetry: 'Repeats a frame through a square or hexagonal wallpaper symmetry group.',
  FrameFeedback: 'Recursive delay — blend a faded prior output over the live input.',
  FrameSwitch: 'Shows frame A or B, selected by a boolean.',
  Zones: 'Routes up to four wired frames into their own rectangle of the matrix.',
}
