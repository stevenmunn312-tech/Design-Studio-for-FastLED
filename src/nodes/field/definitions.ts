// Field node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const FIELD_DEFINITIONS: NodeDefinition[] = [

  // ── Float Field (ANIMartRIX-style coordinate → scalar pipeline) ─────────
  // FieldFormula emits a per-pixel scalar `field` (0–1); FieldToFrame maps a
  // field through a palette to a frame. See
  // docs/design/animartrix-float-field.md.
  {
    type: 'FieldFormula',
    label: 'Field Formula',
    category: 'field',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'fieldIn', label: 'Field', dataType: 'field' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { formula: 'sin8(r*200 + t*60)/255' },
  },
  {
    // Organic fBm noise source (sum of Simplex octaves, same construction as
    // the FractalNoise pattern node) direct as a field — the noise-driven
    // counterpart of FieldFormula's hand-written expressions.
    type: 'FieldNoise',
    label: 'Field Noise',
    category: 'field',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'octaves', label: 'Octaves', dataType: 'float' },
    ],
    propertyInputs: { octaves: 'octaves' },

    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { speed: 0.25, scale: 0.3, octaves: 4, seed: 0, wrapX: false, noiseShape: 'plain' },
  },
  {
    type: 'SliceTiling',
    label: 'Slice Tiling',
    category: 'field',
    inputs: [
      { id: 'cells', label: 'Cells', dataType: 'float' },
      { id: 'rotation', label: 'Rotation', dataType: 'float' },
      { id: 'spin', label: 'Spin', dataType: 'float' },
      { id: 'warp', label: 'Warp', dataType: 'float' },
      { id: 'morph', label: 'Morph', dataType: 'float' },
      { id: 'edge', label: 'Edge', dataType: 'float' },
    ],
    propertyInputs: {
      cells: 'cells', rotation: 'rotation', spin: 'spin',
      warp: 'warp', morph: 'morph', edge: 'edge',
    },
    // `cell` holds one value per lattice polygon, 0.25–1, so Field Math can
    // multiply it into `field` and give each polygon's slices its own colour
    // without any matching the empty slices' 0.
    outputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'cell', label: 'Cell', dataType: 'field' },
    ],
    defaultProperties: {
      lattice: 'hex', depth: 2, symmetry: 'dihedral', preset: 'pinwheel',
      bits: 'ffff', bitsB: '6996', cells: 1, rotation: 0, spin: 0,
      warp: 0, morph: 0, edge: 0.03, seed: 0,
    },
  },
  {
    // Hash-oriented motifs meet at cell boundaries, so scrolling or rerolling
    // changes the topology without breaking the lines between neighbours.
    type: 'Truchet',
    label: 'Truchet Tiles',
    category: 'field',
    inputs: [
      { id: 'reroll', label: 'Reroll', dataType: 'bool' },
      { id: 'cells', label: 'Cells', dataType: 'float' },
      { id: 'lineWidth', label: 'Line Width', dataType: 'float' },
      { id: 'scroll', label: 'Scroll', dataType: 'float' },
      { id: 'rotation', label: 'Rotation', dataType: 'float' },
    ],
    propertyInputs: {
      cells: 'cells', lineWidth: 'lineWidth', scroll: 'scroll', rotation: 'rotation',
    },
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: {
      lattice: 'square', motif: 'arcs', cells: 4, lineWidth: 0.08,
      scroll: 0, rotation: 0, seed: 0,
    },
  },
  {
    // Curated closed-form fields, selected by a dropdown instead of typing a
    // FieldFormula expression — a third raw-field generator beside
    // FieldFormula (free-text) and FieldNoise (fBm). See
    // docs/design/formula-pattern-nodes.md.
    type: 'FormulaField',
    label: 'Formula Field',
    category: 'field',
    /*
     * Every knob is a property input, so a touch control or an LFO can drive
     * the shape live. Ports are named after their property, the convention the
     * rest of `propertyInputs` follows.
     *
     * Only the knobs `isPropertyEnabled` allows for the chosen `formulaType`
     * do anything: the generator emits one variant's block, and the evaluator
     * reads one variant's params, so a wire into another variant's knob is
     * inert by construction rather than by a rule anyone has to maintain.
     * `formulaType` itself stays a property — the generator bakes one variant
     * at generation time and has nothing to branch on at runtime.
     */
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'petals', label: 'Petals', dataType: 'float' },
      { id: 'offset', label: 'Offset', dataType: 'float' },
      { id: 'symmetry', label: 'Symmetry', dataType: 'float' },
      { id: 'n1', label: 'N1', dataType: 'float' },
      { id: 'n2', label: 'N2', dataType: 'float' },
      { id: 'n3', label: 'N3', dataType: 'float' },
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'turns', label: 'Turns', dataType: 'float' },
      { id: 'tightness', label: 'Tightness', dataType: 'float' },
      { id: 'bandWidth', label: 'Band Width', dataType: 'float' },
      { id: 'density', label: 'Density', dataType: 'float' },
      { id: 'phase', label: 'Phase', dataType: 'float' },
      { id: 'freqA', label: 'Freq A', dataType: 'float' },
      { id: 'freqB', label: 'Freq B', dataType: 'float' },
      { id: 'thickness', label: 'Thickness', dataType: 'float' },
    ],
    propertyInputs: {
      speed: 'speed', petals: 'petals', offset: 'offset',
      symmetry: 'symmetry', n1: 'n1', n2: 'n2', n3: 'n3', a: 'a', b: 'b',
      turns: 'turns', tightness: 'tightness', bandWidth: 'bandWidth',
      density: 'density', phase: 'phase',
      freqA: 'freqA', freqB: 'freqB', thickness: 'thickness',
    },
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: {
      formulaType: 'rose',
      speed: 0.3,
      // rose
      petals: 5,
      offset: 0,
      // superformula
      symmetry: 6,
      n1: 0.3,
      n2: 0.3,
      n3: 0.3,
      a: 1,
      b: 1,
      // fibonacciSpiral
      turns: 3,
      tightness: 0.15,
      bandWidth: 0.25,
      // goldenTiling
      density: 12,
      phase: 0,
      // lissajousField
      freqA: 3,
      freqB: 2,
      thickness: 0.1,
    },
  },
  {
    // Damped ripple simulation on a scalar field. A rising-edge trigger injects
    // a new splash, so BeatDetect or a button can kick the water.
    type: 'WaveSim',
    label: 'Wave Sim',
    category: 'field',
    inputs: [
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'damping', label: 'Damping', dataType: 'float' },
      { id: 'impulse', label: 'Impulse', dataType: 'float' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { speed: 4, damping: 0.985, impulse: 1, halfDuplex: false, wrapX: true },
  },
  {
    // Stam's stable fluids at LED resolution. Dye comes out as the field, and
    // the flow as two fields centred on 0.5 so Frame Warp can advect a frame by it.
    type: 'FluidSim',
    label: 'Fluid',
    category: 'field',
    inputs: [
      { id: 'inject', label: 'Inject', dataType: 'float' },
      { id: 'injectX', label: 'Inject X', dataType: 'float' },
      { id: 'injectY', label: 'Inject Y', dataType: 'float' },
      { id: 'forceX', label: 'Force X', dataType: 'field' },
      { id: 'forceY', label: 'Force Y', dataType: 'field' },
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
      { id: 'viscosity', label: 'Viscosity', dataType: 'float' },
      { id: 'diffusion', label: 'Diffusion', dataType: 'float' },
      { id: 'dissipation', label: 'Dissipation', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
    ],
    propertyInputs: {
      inject: 'inject', injectX: 'injectX', injectY: 'injectY', viscosity: 'viscosity',
      diffusion: 'diffusion', dissipation: 'dissipation', speed: 'speed',
    },
    outputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'velocityX', label: 'Velocity X', dataType: 'field' },
      { id: 'velocityY', label: 'Velocity Y', dataType: 'field' },
    ],
    defaultProperties: { inject: 0.6, injectX: 0.5, injectY: 0.85, viscosity: 0, diffusion: 0, dissipation: 0.02, speed: 8, buoyancy: 0.5 },
  },
  {
    // Escape-time and Newton fractals as a field. c, zoom, centre and spin are
    // ports, so an LFO can morph a Julia set or fly into a Mandelbrot one.
    type: 'FractalField',
    label: 'Fractal',
    category: 'field',
    inputs: [
      { id: 'cRe', label: 'C Real', dataType: 'float' },
      { id: 'cIm', label: 'C Imag', dataType: 'float' },
      { id: 'zoom', label: 'Zoom', dataType: 'float' },
      { id: 'centerX', label: 'Center X', dataType: 'float' },
      { id: 'centerY', label: 'Center Y', dataType: 'float' },
      { id: 'spin', label: 'Spin', dataType: 'float' },
    ],
    propertyInputs: { cRe: 'cRe', cIm: 'cIm', zoom: 'zoom', centerX: 'centerX', centerY: 'centerY', spin: 'spin' },
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { fractalType: 'julia', cRe: -0.8, cIm: 0.156, zoom: 1, centerX: 0, centerY: 0, spin: 0, iterations: 32, smooth: true },
  },
  {
    // Cellular automata as a field: scrolling elementary rows, cyclic spirals,
    // Brian's Brain and falling sand. One byte per cell; a rising `reset`
    // restarts it.
    type: 'Automaton',
    label: 'Automaton',
    category: 'field',
    inputs: [
      { id: 'reset', label: 'Reset', dataType: 'bool' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'rule', label: 'Rule', dataType: 'float' },
      { id: 'spawn', label: 'Spawn', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', rule: 'rule', spawn: 'spawn' },
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { automatonType: 'elementary', rule: 90, states: 8, threshold: 3, spawn: 0.5, speed: 8, seed: 0 },
  },
  {
    // McCabe's multi-scale Turing patterns: labyrinths inside labyrinths. Each
    // pixel follows whichever scale's activator and inhibitor agree most, so
    // the look keeps reorganising. `scales` and `baseRadius` are baked into
    // the sketch; a rising `reset` restarts from a fresh seeded start.
    type: 'TuringField',
    label: 'Turing Field',
    category: 'field',
    inputs: [
      { id: 'reset', label: 'Reset', dataType: 'bool' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'stepSize', label: 'Step Size', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', stepSize: 'stepSize' },
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { speed: 2, stepSize: 0.05, scales: 3, baseRadius: 1, seed: 0 },
  },
  {
    type: 'FieldToFrame',
    label: 'Field → Frame',
    category: 'field',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'brightness', label: 'Brightness', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { palette: 'ocean', brightness: 1 },
  },
  // Phase 2 field-composition nodes.
  {
    type: 'DistanceField',
    label: 'Distance Field',
    category: 'field',
    inputs: [
      { id: 'px', label: 'X', dataType: 'float' },
      { id: 'py', label: 'Y', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { px: 0.5, py: 0.5, scale: 1 },
  },
  {
    // The inverse of Field → Frame: extracts a 0–1 brightness field from a
    // rendered frame (average of r,g,b — the same convention Mask uses for a
    // mask frame's opacity), so a pattern's output can drive a warp or mask.
    type: 'FrameToField',
    label: 'Frame → Field',
    category: 'field',
    inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: {},
  },
  {
    type: 'FieldMath',
    label: 'Field Math',
    category: 'field',
    inputs: [
      { id: 'a', label: 'A', dataType: 'field' },
      { id: 'b', label: 'B', dataType: 'field' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { fieldOp: 'add' },
  },
  {
    type: 'FieldLevels',
    label: 'Field Levels',
    category: 'field',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'low', label: 'Low', dataType: 'float' },
      { id: 'high', label: 'High', dataType: 'float' },
    ],
    propertyInputs: { low: 'low', high: 'high' },
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { low: 0, high: 1, steps: 1, invert: false },
  },
  {
    type: 'FieldLerp',
    label: 'Field Lerp',
    category: 'field',
    inputs: [
      { id: 'a', label: 'A', dataType: 'field' },
      { id: 'b', label: 'B', dataType: 'field' },
      { id: 't', label: 'T', dataType: 'float' },
    ],
    propertyInputs: { t: 't' },
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { t: 0.5 },
  },
  {
    type: 'ShapeField',
    label: 'Shape Field',
    category: 'field',
    inputs: [
      { id: 'cx', label: 'Center X', dataType: 'float' },
      { id: 'cy', label: 'Center Y', dataType: 'float' },
      { id: 'size', label: 'Size', dataType: 'float' },
      { id: 'rotation', label: 'Rotation', dataType: 'float' },
      { id: 'sides', label: 'Sides', dataType: 'float' },
      { id: 'aspect', label: 'Aspect', dataType: 'float' },
    ],
    propertyInputs: {
      cx: 'cx', cy: 'cy', size: 'size', rotation: 'rotation', sides: 'sides', aspect: 'aspect',
    },
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: {
      shape: 'circle', fieldMode: 'fill',
      cx: 0.5, cy: 0.5, size: 0.3, rotation: 0, sides: 5, aspect: 1,
      softness: 0.1, range: 0.5,
    },
  },
  {
    type: 'FieldWarp',
    label: 'Field Warp',
    category: 'field',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'dx', label: 'dX', dataType: 'field' },
      { id: 'dy', label: 'dY', dataType: 'field' },
      { id: 'strength', label: 'Strength', dataType: 'float' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { strength: 1 },
  },
  // Phase 3 coordinate-space transforms (resample a field at remapped coords).
  {
    type: 'FieldRotate',
    label: 'Field Rotate',
    category: 'field',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'angle', label: 'Angle', dataType: 'float' },
      { id: 'spin', label: 'Spin', dataType: 'float' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { angle: 0, spin: 30 },
  },
  {
    type: 'FieldTile',
    label: 'Field Tile',
    category: 'field',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'tilesX', label: 'Tiles X', dataType: 'float' },
      { id: 'tilesY', label: 'Tiles Y', dataType: 'float' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { tilesX: 2, tilesY: 2 },
  },

  {
    // Scalar-field twin of Symmetry. Nearest sampling keeps field thresholds
    // crisp; Field to Frame remains the explicit palette boundary.
    type: 'FieldSymmetry',
    label: 'Field Symmetry',
    category: 'field',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
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
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: {
      group: 'p4m', cells: 2, rotation: 0, spin: 0, offsetX: 0, offsetY: 0,
    },
  },
]

export const FIELD_DESCRIPTIONS: Record<string, string> = {
  FieldFormula: 'Per-pixel scalar field from an expression (cx/cy/r/angle, sin8/beatsin8…).',
  FieldNoise: 'Organic fBm noise as a scalar field (same construction as Fractal Noise).',
  SliceTiling: 'Recursive fan slices on hex, square or triangle lattices, plus a per-cell value.',
  Truchet: 'Joins hash-oriented arcs and lines across a square or hexagonal tile lattice.',
  FormulaField: 'Curated closed-form field: rose, superformula, spiral, tiling, Lissajous.',
  WaveSim: 'Damped 2D ripple simulation as a scalar field, with triggerable splashes.',
  FluidSim: 'Smoke-like fluid: dye and the flow that carries it, as fields.',
  FractalField: 'Julia, Mandelbrot, Newton or Burning Ship fractal as a field.',
  Automaton: 'Cellular automata as a field: rows, spirals, Brian\'s Brain, sand.',
  TuringField: 'Multi-scale Turing pattern field: labyrinths that keep reorganising.',
  FieldToFrame: 'Maps a scalar field through a palette to a frame.',
  DistanceField: 'Scalar field of distance from each pixel to a movable point.',
  FrameToField: 'Extracts a brightness field from a rendered frame.',
  FieldMath: 'Combines two scalar fields (add, subtract, multiply, mix, min, max, difference).',
  FieldLevels: 'Remaps, thresholds, quantises or inverts a scalar field.',
  FieldLerp: 'Interpolates between two scalar fields with a wireable 0–1 amount.',
  ShapeField: 'Circle, rectangle or morphing polygon as a fill or signed-distance field.',
  FieldWarp: 'Samples a field at coordinates pushed by two offset fields.',
  FieldRotate: 'Rotates a field around its centre (angle + spin over time).',
  FieldTile: 'Tiles/repeats a field across the matrix.',
  FieldSymmetry: 'Repeats a field through a square or hexagonal wallpaper symmetry group.',
}
