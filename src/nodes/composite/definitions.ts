// Effect node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const COMPOSITE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'Blur2D',
    label: 'Blur 2D',
    category: 'composite',
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
    inputs: [
      { id: 'a',      label: 'A',       dataType: 'frame' },
      { id: 'b',      label: 'B',       dataType: 'frame' },
      { id: 'amount', label: 'Opacity', dataType: 'float' },
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
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'mask',  label: 'Mask',  dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {},
  },

  // ── Compositing ────────────────────────────────────────────────────────
  {
    type: 'BrightnessMod',
    label: 'Brightness',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'brightness', label: 'Brightness', dataType: 'float' },
    ],
    propertyInputs: { brightness: 'brightness' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { brightness: 1.0 },
  },
  {
    // Fade the frame toward black — FastLED's fadeToBlackBy. fade 0 = unchanged, 1 = full black.
    type: 'Fade',
    label: 'Fade to Black',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
    ],
    propertyInputs: { fade: 'fade' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { fade: 0.5 },
  },
  {
    type: 'HueShift',
    label: 'Hue Shift',
    category: 'composite',
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
    type: 'Saturation',
    label: 'Saturation',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'amount', label: 'Amount', dataType: 'float' },
    ],
    propertyInputs: { amount: 'amount' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { amount: 1 },
  },
  {
    // Luminance-preserving saturation enhancement — pushes channels away from
    // their Rec. 709 luma so washed-out content gains colour without simply
    // brightening the whole frame.
    type: 'ColorBoost',
    label: 'Color Boost',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'boost', label: 'Boost', dataType: 'float' },
    ],
    propertyInputs: { boost: 'boost' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { boost: 0.5 },
  },
  {
    // Animated geometric transform of a frame (rotate / scale / translate).
    type: 'Transform',
    label: 'Transform',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'rate', label: 'Rate', dataType: 'float' },
      { id: 'angle', label: 'Angle', dataType: 'float' },
    ],
    propertyInputs: { rate: 'rate', angle: 'angle' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { transform: 'rotate', rate: 90, angle: 0 },
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
      blendMode: 'add',
    },
  },
  {
    type: 'Invert',
    label: 'Invert',
    category: 'composite',
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
    type: 'Mirror',
    label: 'Mirror',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'color', label: 'Tint', dataType: 'color' },
      { id: 'glowAmount', label: 'Glow', dataType: 'float' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: { glowAmount: 'glowAmount', r: 'r', g: 'g', b: 'b' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { mirrorMode: 'horizontal', glow: false, glowAmount: 0.35, r: 255, g: 255, b: 255 },
  },
  {
    // Feedback/trails buffer — persists its own output across frames, fading
    // by `decay` each tick and re-lightening wherever the incoming frame is
    // brighter (per-channel max). The canonical fadeToBlackBy()-and-accumulate
    // idiom, generalised to any upstream pattern (Circle, Blobs, Text, …).
    type: 'Trails',
    label: 'Trails',
    category: 'composite',
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
    // fields push the source coordinate, while zoom and rotation apply about
    // the canvas centre before one shared nearest/bilinear frame sample.
    type: 'FrameWarp',
    label: 'Frame Warp',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'dx', label: 'Offset X', dataType: 'field' },
      { id: 'dy', label: 'Offset Y', dataType: 'field' },
      { id: 'strength', label: 'Strength', dataType: 'float' },
      { id: 'zoom', label: 'Zoom', dataType: 'float' },
      { id: 'rotate', label: 'Rotate', dataType: 'float' },
    ],
    propertyInputs: { strength: 'strength', zoom: 'zoom', rotate: 'rotate' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      strength: 2,
      zoom: 1,
      rotate: 0,
      edgeMode: 'clamp',
      sampling: 'bilinear',
    },
  },
  {
    // Wallpaper-group repetition for a finished frame. Square and hexagonal
    // groups select their matching lattice automatically.
    type: 'Symmetry',
    label: 'Symmetry',
    category: 'composite',
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
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'amount', label: 'Amount', dataType: 'float' },
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
    // whichever side is wired when the other is empty.
    type: 'FrameSwitch',
    label: 'Frame Switch',
    category: 'composite',
    inputs: [
      { id: 'a', label: 'Frame A', dataType: 'frame' },
      { id: 'b', label: 'Frame B', dataType: 'frame' },
      { id: 'sel', label: 'Select', dataType: 'bool' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {},
  },
  {
    // Named rectangular regions ("zones") for installations with multiple
    // logical display areas — each zone routes its own wired frame into its
    // rectangle of the matrix (normalized 0–1 x/y/w/h), later zones painting
    // over earlier ones where they overlap. An unwired or disabled zone
    // leaves its rectangle showing whatever `base` (or an earlier zone)
    // already put there, so partially wiring the node is non-destructive.
    type: 'Zones',
    label: 'Zones',
    category: 'composite',
    inputs: [
      { id: 'base', label: 'Base', dataType: 'frame' },
      { id: 'a', label: 'Zone A', dataType: 'frame' },
      { id: 'b', label: 'Zone B', dataType: 'frame' },
      { id: 'c', label: 'Zone C', dataType: 'frame' },
      { id: 'd', label: 'Zone D', dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      aName: 'Zone A', aEnabled: true, aX: 0,   aY: 0,   aW: 0.5, aH: 0.5,
      bName: 'Zone B', bEnabled: true, bX: 0.5, bY: 0,   bW: 0.5, bH: 0.5,
      cName: 'Zone C', cEnabled: true, cX: 0,   cY: 0.5, cW: 0.5, cH: 0.5,
      dName: 'Zone D', dEnabled: true, dX: 0.5, dY: 0.5, dW: 0.5, dH: 0.5,
    },
  },
]

export const COMPOSITE_DESCRIPTIONS: Record<string, string> = {
  // composite
  Blur2D: 'Box-blurs the frame.',
  Blend: 'Blends B over A — normal, multiply, screen, overlay, add or difference.',
  Mask: 'Masks a frame by another frame’s brightness.',
  BrightnessMod: 'Dims or amplifies a frame with saturated 0–3× scaling.',
  Fade: 'Fades the frame toward black (fadeToBlackBy).',
  HueShift: 'Rotates all hues.',
  Gamma: 'Perceptual gamma correction so gradients look right on the LEDs.',
  Saturation: 'Scales color saturation (0 = greyscale, 1 = unchanged).',
  ColorBoost: 'Boosts saturation while approximately preserving luminance.',
  Transform: 'Animated rotate, scale or translate of a frame.',
  Array: 'Repeats a frame N times with an accumulating offset/rotate/scale, composited.',
  Invert: 'Inverts colors.',
  Mirror: 'Mirrors a frame into symmetry (4 axes) with an optional tinted glow bloom.',
  Trails: 'Fades the previous frame and re-lightens where the input is brighter.',
  FrameWarp: 'Displaces a frame per pixel with two fields, plus centred zoom and rotation.',
  Symmetry: 'Repeats a frame through a square or hexagonal wallpaper symmetry group.',
  FrameFeedback: 'Recursive delay — blend a faded prior output over the live input.',
  FrameSwitch: 'Shows frame A or B, selected by a boolean.',
  Zones: 'Routes up to four wired frames into their own named rectangle of the matrix.',
}
