// Shape and text pattern node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const SHAPES_DEFINITIONS: NodeDefinition[] = [

  // ── Pattern ────────────────────────────────────────────────────────────
  {
    type: 'SolidColor',
    label: 'Solid Color',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: { r: 'r', g: 'g', b: 'b' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { r: 255, g: 0, b: 128 },
  },
  {
    // Gauge — shows a 0–1 value as a bar, ring, arc or dot, with an optional
    // held peak. Wire a Map Range in front of it to turn sensor units into 0–1.
    type: 'Gauge',
    label: 'Gauge',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'base', label: 'Base', dataType: 'frame' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { value: 'value', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      gaugeStyle: 'bar', direction: 'right', value: 0.6, segments: 0, peakHold: 0, thickness: 1,
      arcStart: 225, arcSweep: 270, ringLeds: 60, palette: 'heat',
    },
  },
  {
    // SD Video — plays a clip read from the SD card. The Studio decodes the
    // video, shrinks it to the LED canvas and writes raw RGB frames (see
    // state/evaluator/sdVideo.ts); the sketch only reads bytes off the card.
    // The imported clip's record is `properties.clip`; its bytes live in
    // IndexedDB, not in the project.
    type: 'SDVideo',
    label: 'SD Video',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1, loop: true },
  },
  {
    // Renders text with the built-in 3×5 font; scroll > 0 scrolls it left.
    // X/Y are normalised 0..1 around the text's visual centre; `wrap` tiles it
    // across the opposite edges.
    type: 'Text',
    label: 'Text',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'color',  label: 'Color',  dataType: 'color' },
      { id: 'x',      label: 'X',      dataType: 'float' },
      { id: 'y',      label: 'Y',      dataType: 'float' },
      { id: 'scroll', label: 'Scroll', dataType: 'float' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: { x: 'x', y: 'y', scroll: 'scroll', r: 'r', g: 'g', b: 'b' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      text: 'HELLO', x: 0.5, y: 0.5, scroll: 0, wrap: false, r: 0, g: 255, b: 255,
      hAlign: 'center', vAlign: 'middle', scrollAxis: 'horizontal', letterSpacing: 1,
    },
  },
  {
    // RTC-fed clock/date display plus local stopwatch/timer modes. The clock
    // modes normally read one structured DateTime value from RTCInput; the
    // legacy scalar inputs remain useful for synthetic/test clocks and saves
    // made before DateTime wiring existed. The
    // stopwatch/timer modes keep their own state so graph bools can run/pause
    // or reset them.
    type: 'ClockDisplay',
    label: 'Clock Display',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'dateTime', label: 'DateTime', dataType: 'datetime' },
      { id: 'base', label: 'Base', dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'secondsOfDay', label: 'Seconds Today', dataType: 'float' },
      { id: 'valid', label: 'Valid', dataType: 'bool' },
      { id: 'day', label: 'Day', dataType: 'float' },
      { id: 'month', label: 'Month', dataType: 'float' },
      { id: 'run', label: 'Run', dataType: 'bool' },
      { id: 'reset', label: 'Reset', dataType: 'bool' },
      { id: 'durationSec', label: 'Duration', dataType: 'float' },
      { id: 'x', label: 'X', dataType: 'float' },
      { id: 'y', label: 'Y', dataType: 'float' },
      { id: 'radius', label: 'Radius', dataType: 'float' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: {
      run: 'run', reset: 'reset', durationSec: 'durationSec',
      x: 'x', y: 'y', radius: 'radius',
      r: 'r', g: 'g', b: 'b',
    },
    outputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      // Stopwatch/Timer readouts, so a transport can drive the rest of the
      // graph instead of only drawing itself. Clock modes pass the time of day
      // through on `seconds` and hold `done` low.
      { id: 'seconds', label: 'Seconds', dataType: 'float' },
      { id: 'done', label: 'Done', dataType: 'bool' },
    ],
    defaultProperties: {
      displayMode: 'Digital HH:MM',
      x: 0.5,
      y: 0.5,
      radius: 6,
      scaleWithMatrix: true,
      run: true,
      reset: false,
      durationSec: 300,
      r: 255,
      g: 220,
      b: 90,
      hAlign: 'center',
      vAlign: 'middle',
    },
  },
  {
    // Draws a circle (ring, or filled disc) over an optional base frame.
    // `fill`/`edge`/`thickness` mirror the Shape node — same SDF renderer
    // (a circle is Shape's ellipse at aspect 1), so drawing matches exactly.
    type: 'Circle',
    label: 'Circle',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'base',  label: 'Base',  dataType: 'frame' },
      { id: 'fill',  label: 'Fill',  dataType: 'color' },
      { id: 'edge',  label: 'Edge',  dataType: 'color' },
      { id: 'cx',    label: 'Center X', dataType: 'float' },
      { id: 'cy',    label: 'Center Y', dataType: 'float' },
      { id: 'radius', label: 'Radius', dataType: 'float' },
      { id: 'thickness', label: 'Thickness', dataType: 'float' },
    ],
    propertyInputs: { cx: 'cx', cy: 'cy', radius: 'radius', thickness: 'thickness', fill: 'fill', edge: 'edge' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { cx: 0.5, cy: 0.5, radius: 6, scaleWithMatrix: true, thickness: 1.5, wrap: false, filled: true, fill: '#ff3080', edge: '#ff0080' },
  },
  {
    // Draws a line between two points over an optional base frame.
    type: 'Line',
    label: 'Line',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'base',  label: 'Base',  dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'x1',    label: 'X1', dataType: 'float' },
      { id: 'y1',    label: 'Y1', dataType: 'float' },
      { id: 'x2',    label: 'X2', dataType: 'float' },
      { id: 'y2',    label: 'Y2', dataType: 'float' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: { x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2', r: 'r', g: 'g', b: 'b' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { x1: 0, y1: 0, x2: 'W-1', y2: 'H-1', r: 0, g: 200, b: 255 },
  },
  {
    // Bundled shape generator: draws a rect / ellipse / regular polygon at
    // (cx, cy) with a filled interior (fill colour) and/or an outline (edge
    // colour, thickness). `sides` is wire-able and fractional, so a polygon
    // morphs triangle→square→…→decagon — an ideal Array source. `fill`/`edge`
    // are hex props that double as colour inputs (port id == prop name).
    type: 'Shape',
    label: 'Shape',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'base', label: 'Base', dataType: 'frame' },
      { id: 'fill', label: 'Fill', dataType: 'color' },
      { id: 'edge', label: 'Edge', dataType: 'color' },
      { id: 'cx', label: 'Center X', dataType: 'float' },
      { id: 'cy', label: 'Center Y', dataType: 'float' },
      { id: 'size', label: 'Size', dataType: 'float' },
      { id: 'aspect', label: 'Aspect', dataType: 'float' },
      { id: 'sides', label: 'Sides', dataType: 'float' },
      { id: 'rotation', label: 'Rotation', dataType: 'float' },
      { id: 'thickness', label: 'Thickness', dataType: 'float' },
    ],
    propertyInputs: {
      fill: 'fill', edge: 'edge',
      cx: 'cx', cy: 'cy', size: 'size', aspect: 'aspect',
      sides: 'sides', rotation: 'rotation', thickness: 'thickness',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      shape: 'polygon',
      cx: 0.5,
      cy: 0.5,
      size: 6,
      aspect: 1,
      sides: 5,
      rotation: 0,
      thickness: 1.5,
      wrap: false,
      filled: true,
      fill: '#ff3080',
      edge: '#00e0ff',
    },
  },
  {
    // Traces a point around a parametric curve. Feed a 0–1 `t` signal into it
    // and stack it into Trails for a persistent orbit/heart/rose drawing.
    type: 'Path',
    label: 'Path',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'base',  label: 'Base', dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 't',     label: 'T (0–1)', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'thickness', label: 'Thickness', dataType: 'float' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: { t: 't', scale: 'scale', thickness: 'thickness', r: 'r', g: 'g', b: 'b' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { pathShape: 'circle', customPoints: '', t: 0, scale: 0.8, thickness: 1.25, r: 255, g: 220, b: 80 },
  },
  {
    // An outline redrawn by nested rotating circles: its discrete Fourier
    // transform, largest terms first. `harmonics` is fractional, so animating
    // it grows a circle into the outline one term at a time. `maxHarmonics`
    // sizes the baked coefficient table, so it stays a property, as
    // Particles' `count` does; the wired `harmonics` is clamped to it.
    type: 'FourierEpicycles',
    label: 'Fourier Epicycles',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'base', label: 'Base', dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'harmonics', label: 'Harmonics', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'thickness', label: 'Thickness', dataType: 'float' },
      { id: 'persistence', label: 'Persistence', dataType: 'float' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: {
      harmonics: 'harmonics', speed: 'speed', scale: 'scale', thickness: 'thickness',
      persistence: 'persistence', r: 'r', g: 'g', b: 'b',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      outline: 'heart', customPoints: '', maxHarmonics: 32, harmonics: 32, speed: 0.2,
      scale: 0.8, thickness: 1.25, persistence: 0.995, showCircles: true, showPen: true,
      r: 255, g: 220, b: 80,
    },
  },
  {
    // Rotating 3D wireframe (a built-in Platonic-solid preset, or an uploaded
    // custom mesh) drawn over an optional base frame. Vertices are normalised
    // to a unit sphere and auto-scaled to fit the matrix before projecting, so
    // any model reads at a sensible size by default. See
    // src/nodes/shapes/wireframeModel.ts for the shared rotate/project math — kept
    // in lockstep with the Wireframe3D case in cppGenerator.ts.
    type: 'Wireframe3D',
    label: '3D Wireframe',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'base',  label: 'Base',  dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'spinX', label: 'Spin X', dataType: 'float' },
      { id: 'spinY', label: 'Spin Y', dataType: 'float' },
      { id: 'spinZ', label: 'Spin Z', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'perspectiveStrength', label: 'Perspective', dataType: 'float' },
    ],
    propertyInputs: {
      r: 'r', g: 'g', b: 'b',
      spinX: 'spinX', spinY: 'spinY', spinZ: 'spinZ',
      scale: 'scale', perspectiveStrength: 'perspectiveStrength',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      model: 'cube',
      spinX: 0,
      spinY: 40,
      spinZ: 0,
      scale: 1,
      projection: 'orthographic',
      perspectiveStrength: 0.4,
      depthShade: true,
      r: 0, g: 200, b: 255,
    },
  },
  {
    type: 'GradientFrame',
    label: 'Gradient Frame',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'colorA', label: 'Color A', dataType: 'color' },
      { id: 'colorB', label: 'Color B', dataType: 'color' },
      { id: 'vertical', label: 'Vertical', dataType: 'bool' },
      { id: 'rA', label: 'R (A)', dataType: 'float' },
      { id: 'gA', label: 'G (A)', dataType: 'float' },
      { id: 'bA', label: 'B (A)', dataType: 'float' },
      { id: 'rB', label: 'R (B)', dataType: 'float' },
      { id: 'gB', label: 'G (B)', dataType: 'float' },
      { id: 'bB', label: 'B (B)', dataType: 'float' },
    ],
    propertyInputs: {
      vertical: 'vertical',
      rA: 'rA', gA: 'gA', bA: 'bA', rB: 'rB', gB: 'gB', bB: 'bB',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { rA: 0, gA: 200, bA: 255, rB: 255, gB: 0, bB: 255, vertical: false, mixMode: 'rgb' },
  },
  {
    // Angled palette gradient across the matrix.
    type: 'PaletteGradient',
    label: 'Palette Gradient',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'angle', label: 'Angle', dataType: 'float' },
      { id: 'repeat', label: 'Repeat', dataType: 'float' },
      { id: 'speed', label: 'Scroll', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { angle: 'angle', repeat: 'repeat', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { angle: 45, repeat: 1, speed: 0, palette: 'rainbow' },
  },
  {
    // Palette swept around the canvas centre by angle, radius, or a spiral of
    // both. Whole angular repeats keep the ±π cut invisible, so it also reads
    // as a seamless wheel on an LED ring.
    type: 'PolarGradient',
    label: 'Polar Gradient',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'angleOffset', label: 'Angle', dataType: 'float' },
      { id: 'spin', label: 'Spin', dataType: 'float' },
      { id: 'repeat', label: 'Repeat', dataType: 'float' },
      { id: 'radialMix', label: 'Radial Mix', dataType: 'float' },
      { id: 'radialScroll', label: 'Radial Scroll', dataType: 'float' },
    ],
    propertyInputs: { palette: 'paletteIn', angleOffset: 'angleOffset', spin: 'spin', repeat: 'repeat', radialMix: 'radialMix', radialScroll: 'radialScroll' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { palette: 'rainbow', angleOffset: 0, spin: 0.1, repeat: 1, radialMix: 0, radialScroll: 0 },
  },
  {
    // Uploaded image with placement, sampling, alpha, and crop controls.
    // Handles both a still image and a GIF/APNG/WebP animation — whichever the
    // uploaded file is (stored in `properties.image` or `properties.animation`
    // respectively; see ImageNodeBody). `playbackRate`/`loop` apply only to an
    // animation (gated off in the inline editor for a still).
    type: 'Image',
    label: 'Image',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'positionX', label: 'Pos X', dataType: 'float' },
      { id: 'positionY', label: 'Pos Y', dataType: 'float' },
      { id: 'rotation', label: 'Rotation', dataType: 'float' },
      { id: 'brightness', label: 'Brightness', dataType: 'float' },
      { id: 'zoom', label: 'Zoom', dataType: 'float' },
      { id: 'cropX', label: 'Crop X', dataType: 'float' },
      { id: 'cropY', label: 'Crop Y', dataType: 'float' },
      { id: 'saturation', label: 'Saturation', dataType: 'float' },
      { id: 'contrast', label: 'Contrast', dataType: 'float' },
      { id: 'hueShift', label: 'Hue', dataType: 'float' },
      { id: 'playbackRate', label: 'Playback', dataType: 'float' },
      { id: 'gamma', label: 'Gamma', dataType: 'float' },
    ],
    propertyInputs: {
      positionX: 'positionX', positionY: 'positionY', rotation: 'rotation',
      brightness: 'brightness', zoom: 'zoom', cropX: 'cropX', cropY: 'cropY',
      saturation: 'saturation', contrast: 'contrast', hueShift: 'hueShift',
      playbackRate: 'playbackRate',
      gamma: 'gamma',
    },
    outputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'image', label: 'Image Data', dataType: 'image' },
    ],
    defaultProperties: {
      fit: 'stretch',
      positionX: 0.5,
      positionY: 0.5,
      rotation: '0',
      flipX: false,
      flipY: false,
      sampling: 'nearest',
      brightness: 1,
      background: '#000000',
      zoom: 1,
      cropX: 0.5,
      cropY: 0.5,
      saturation: 1,
      contrast: 1,
      hueShift: 0,
      monochrome: false,
      gamma: 1,
      paletteLevels: 'full',
      dithering: 'none',
      // Animation playback (ignored for a still image).
      playbackRate: 1,
      loop: true,
    },
  },
]

export const SHAPES_DESCRIPTIONS: Record<string, string> = {
  // pattern
  SolidColor: 'Fills the matrix with one color.',
  Gauge: 'A 0–1 value as a bar, ring, arc or dot, with an optional held peak.',
  SDVideo: 'Plays a video clip from the SD card, shrunk to the LED canvas.',
  Text: 'Renders scrolling text in a bitmap font.',
  ClockDisplay: 'RTC-fed digital/analog clock plus stopwatch and timer displays.',
  Circle: 'Draws a circle — ring or filled disc, with a fill and outline colour.',
  Line: 'Draws a line between two points.',
  Shape: 'Rect, ellipse or morphing N-gon with a fill and outline colour.',
  Path: 'Traces a parametric curve point with subpixel splatting.',
  FourierEpicycles: 'Redraws an outline with nested rotating circles, from its Fourier series.',
  Wireframe3D: 'Rotating 3D wireframe model, auto-scaled to fit the matrix.',
  GradientFrame: 'Two-color linear gradient fill.',
  PaletteGradient: 'Palette gradient across the matrix at any angle.',
  PolarGradient: 'Palette swept around the centre by angle, radius or a spiral of both.',
  Image: 'Still or animated (GIF/APNG/WebP) image with fit, crop, colour controls.',
}
