import type { NodeDefinition } from '../types'

export const NODE_LIBRARY: NodeDefinition[] = [
  // ── Audio ──────────────────────────────────────────────────────────────
  {
    type: 'FFTAnalyzer',
    label: 'FFT Analyzer',
    category: 'audio',
    inputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    outputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
    ],
    defaultProperties: { bands: 16, smoothing: 3 },
  },
  {
    type: 'BeatDetect',
    label: 'Beat Detect',
    category: 'audio',
    inputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    outputs: [
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'bpm', label: 'BPM', dataType: 'float' },
    ],
    defaultProperties: { threshold: 0.5, attack: 0.1, decay: 0.3 },
  },
  {
    type: 'MicInput',
    label: 'Microphone',
    category: 'audio',
    inputs: [],
    outputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    defaultProperties: { gain: 1.0, sampleRate: 44100 },
  },

  // ── Pattern ────────────────────────────────────────────────────────────
  {
    type: 'SolidColor',
    label: 'Solid Color',
    category: 'pattern',
    inputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { r: 255, g: 0, b: 128 },
  },
  {
    // Paints a horizontal run on one row over an optional base frame.
    type: 'Span',
    label: 'Span',
    category: 'pattern',
    inputs: [
      { id: 'base',  label: 'Base',  dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { row: 0, start: 0, count: 8, r: 0, g: 128, b: 255 },
  },
  {
    // Paints an axis-aligned rectangle over an optional base frame.
    type: 'Rect',
    label: 'Rect',
    category: 'pattern',
    inputs: [
      { id: 'base',  label: 'Base',  dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { x: 0, y: 0, w: 4, h: 4, r: 0, g: 128, b: 255 },
  },
  {
    type: 'NoiseField',
    label: 'Noise Field',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1.0, scale: 1.0, palette: 'rainbow' },
  },
  {
    type: 'Fire',
    label: 'Fire',
    category: 'pattern',
    inputs: [{ id: 'intensity', label: 'Intensity', dataType: 'float' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { cooling: 55, sparking: 120 },
  },
  {
    type: 'Fire2012',
    label: 'Fire 2012',
    category: 'pattern',
    inputs: [],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { cooling: 55, sparking: 120 },
  },
  {
    type: 'Blur2D',
    label: 'Blur 2D',
    category: 'composite',
    inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { amount: 40 },
  },
  {
    type: 'LayerBlend',
    label: 'Blend Layers',
    category: 'composite',
    inputs: [
      { id: 'a',      label: 'A',      dataType: 'frame' },
      { id: 'b',      label: 'B',      dataType: 'frame' },
      { id: 'amount', label: 'Amount', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { amount: 128 },
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
  {
    type: 'Plasma',
    label: 'Plasma',
    category: 'pattern',
    inputs: [{ id: 'speed', label: 'Speed', dataType: 'float' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1.0 },
  },
  {
    type: 'SpectrumBars',
    label: 'Spectrum Bars',
    category: 'pattern',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { mirror: true },
  },

  // ── Compositing ────────────────────────────────────────────────────────
  {
    type: 'BlendFrames',
    label: 'Blend Frames',
    category: 'composite',
    inputs: [
      { id: 'a', label: 'A', dataType: 'frame' },
      { id: 'b', label: 'B', dataType: 'frame' },
      { id: 't', label: 'Mix', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { t: 0.5 },
  },
  {
    type: 'BrightnessMod',
    label: 'Brightness',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'brightness', label: 'Brightness', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { brightness: 1.0 },
  },
  {
    type: 'HueShift',
    label: 'Hue Shift',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'shift', label: 'Shift°', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { shift: 0 },
  },

  // ── Audio-reactive patterns ─────────────────────────────────────────────
  {
    type: 'BassPulse',
    label: 'Bass Pulse',
    category: 'pattern',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { r: 255, g: 0, b: 80 },
  },
  {
    type: 'MidrangeWaves',
    label: 'Midrange Waves',
    category: 'pattern',
    inputs: [{ id: 'mids', label: 'Mids', dataType: 'float' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1.0 },
  },
  {
    type: 'TrebleSparks',
    label: 'Treble Sparks',
    category: 'pattern',
    inputs: [{ id: 'treble', label: 'Treble', dataType: 'float' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { density: 0.5 },
  },
  {
    type: 'BeatFlash',
    label: 'Beat Flash',
    category: 'pattern',
    inputs: [
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'frame', label: 'Base', dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { decay: 0.85 },
  },

  // ── More pattern nodes ─────────────────────────────────────────────────
  {
    type: 'Noise2D',
    label: 'Noise 2D',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.4, scale: 0.4 },
  },
  {
    type: 'RadialBurst',
    label: 'Radial Burst',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1.0, r: 0, g: 200, b: 255 },
  },
  {
    type: 'Spiral',
    label: 'Spiral',
    category: 'pattern',
    inputs: [{ id: 'speed', label: 'Speed', dataType: 'float' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1.0, arms: 2 },
  },
  {
    type: 'Kaleidoscope',
    label: 'Kaleidoscope',
    category: 'pattern',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'segments', label: 'Segments', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { segments: 6 },
  },
  {
    type: 'Particles',
    label: 'Particles',
    category: 'pattern',
    inputs: [
      { id: 'rate', label: 'Rate', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { rate: 0.3, decay: 0.92, r: 100, g: 200, b: 255 },
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
    type: 'GradientFrame',
    label: 'Gradient Frame',
    category: 'pattern',
    inputs: [
      { id: 'colorA', label: 'Color A', dataType: 'color' },
      { id: 'colorB', label: 'Color B', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { rA: 0, gA: 200, bA: 255, rB: 255, gB: 0, bB: 255, vertical: false },
  },
  {
    type: 'GradientSampler',
    label: 'Gradient Sampler',
    category: 'color',
    inputs: [
      { id: 't', label: 'T (0–1)', dataType: 'float' },
      { id: 'colorA', label: 'Color A', dataType: 'color' },
      { id: 'colorB', label: 'Color B', dataType: 'color' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { rA: 0, gA: 200, bA: 255, rB: 255, gB: 0, bB: 255 },
  },
  {
    type: 'PaletteSampler',
    label: 'Palette Sampler',
    category: 'color',
    inputs: [
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 't', label: 'T (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { palette: 'rainbow', t: 0 },
  },

  // ── Math ───────────────────────────────────────────────────────────────
  {
    type: 'MathAdd',
    label: 'Add',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'Multiply',
    label: 'Multiply',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'Clamp',
    label: 'Clamp',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'min', label: 'Min', dataType: 'float' },
      { id: 'max', label: 'Max', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { min: 0, max: 1 },
  },
  {
    type: 'MapRange',
    label: 'Map Range',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'inMin', label: 'In Min', dataType: 'float' },
      { id: 'inMax', label: 'In Max', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { inMin: 0, inMax: 1, outMin: 0, outMax: 1 },
  },
  {
    type: 'Sin',
    label: 'Sin',
    category: 'math',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'Cos',
    label: 'Cos',
    category: 'math',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'Lerp',
    label: 'Lerp',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 't', label: 'T', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'TimeNode',
    label: 'Time',
    category: 'math',
    inputs: [],
    outputs: [
      { id: 'time', label: 'Time', dataType: 'float' },
      { id: 'dt', label: 'dt', dataType: 'float' },
    ],
    defaultProperties: {},
  },

  // ── Logic / Control ────────────────────────────────────────────────────
  {
    type: 'Abs',
    label: 'Abs',
    category: 'math',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'Mod',
    label: 'Mod',
    category: 'math',
    inputs: [
      { id: 'x', label: 'X', dataType: 'float' },
      { id: 'm', label: 'M', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { m: 1 },
  },
  {
    type: 'MinNode',
    label: 'Min',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'MaxNode',
    label: 'Max',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'Random',
    label: 'Random',
    category: 'math',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    defaultProperties: { min: 0, max: 1 },
  },
  {
    type: 'Counter',
    label: 'Counter',
    category: 'math',
    inputs: [{ id: 'speed', label: 'Speed', dataType: 'float' }],
    outputs: [{ id: 'value', label: 'Value 0–1', dataType: 'float' }],
    defaultProperties: { speed: 0.5 },
  },
  {
    type: 'Gate',
    label: 'Gate',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'gate', label: 'Gate', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { fallback: 0 },
  },
  {
    type: 'Not',
    label: 'Not',
    category: 'math',
    inputs: [{ id: 'x', label: 'X', dataType: 'bool' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'bool' }],
    defaultProperties: {},
  },
  {
    type: 'Compare',
    label: 'Compare (A > B)',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'A > B', dataType: 'bool' }],
    defaultProperties: { b: 0.5 },
  },

  // ── Audio extras ──────────────────────────────────────────────────────
  {
    type: 'AudioHue',
    label: 'Audio → Hue',
    category: 'audio',
    inputs: [
      { id: 'bass',   label: 'Bass',   dataType: 'float' },
      { id: 'mids',   label: 'Mids',   dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
    ],
    outputs: [{ id: 'hue', label: 'Hue (0–360)', dataType: 'float' }],
    defaultProperties: {},
  },

  // ── Color ──────────────────────────────────────────────────────────────
  {
    type: 'HSVToRGB',
    label: 'HSV → RGB',
    category: 'color',
    inputs: [
      { id: 'h', label: 'H (0–360)', dataType: 'float' },
      { id: 's', label: 'S (0–1)', dataType: 'float' },
      { id: 'v', label: 'V (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { h: 0, s: 1, v: 1 },
  },
  {
    type: 'BlendColors',
    label: 'Blend Colors',
    category: 'color',
    inputs: [
      { id: 'a', label: 'A', dataType: 'color' },
      { id: 'b', label: 'B', dataType: 'color' },
      { id: 't', label: 'Mix', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { t: 0.5 },
  },
  {
    type: 'CHSV',
    label: 'CHSV',
    category: 'color',
    inputs: [
      { id: 'hue', label: 'Hue (0–255)', dataType: 'float' },
      { id: 'sat', label: 'Sat (0–255)', dataType: 'float' },
      { id: 'val', label: 'Val (0–255)', dataType: 'float' },
    ],
    outputs: [{ id: 'rgb', label: 'RGB', dataType: 'color' }],
    defaultProperties: { hue: 128, sat: 255, val: 255 },
  },
  {
    type: 'PaletteSelector',
    label: 'Palette Selector',
    category: 'color',
    inputs: [],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { palette: 'rainbow' },
  },
  {
    // Builds a palette from up to four connected colors (in order).
    type: 'CustomPalette',
    label: 'Custom Palette',
    category: 'color',
    inputs: [
      { id: 'color0', label: 'Color 1', dataType: 'color' },
      { id: 'color1', label: 'Color 2', dataType: 'color' },
      { id: 'color2', label: 'Color 3', dataType: 'color' },
      { id: 'color3', label: 'Color 4', dataType: 'color' },
    ],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: {},
  },
  {
    type: 'PaletteBlend',
    label: 'Blend Palettes',
    category: 'color',
    inputs: [
      { id: 'paletteA', label: 'Palette A', dataType: 'palette' },
      { id: 'paletteB', label: 'Palette B', dataType: 'palette' },
      { id: 'amount', label: 'Amount', dataType: 'float' },
    ],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { paletteA: 'rainbow', paletteB: 'ocean', amount: 128 },
  },
  {
    type: 'BeatSin',
    label: 'BeatSin',
    category: 'math',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value (0–255)', dataType: 'float' }],
    defaultProperties: { bpm: 60, low: 0, high: 255 },
  },
  {
    type: 'XYMapper',
    label: 'XY → Index',
    category: 'math',
    inputs: [
      { id: 'x', label: 'X', dataType: 'float' },
      { id: 'y', label: 'Y', dataType: 'float' },
    ],
    outputs: [{ id: 'index', label: 'Index', dataType: 'float' }],
    defaultProperties: {},
  },

  // ── Proper noise ──────────────────────────────────────────────────────
  {
    type: 'Simplex2D',
    label: 'Simplex 2D',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.4, scale: 0.3, palette: 'rainbow' },
  },
  {
    type: 'Noise3D',
    label: 'Noise 3D',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, scale: 0.3, palette: 'ocean' },
  },

  // ── Transition nodes ──────────────────────────────────────────────────
  {
    type: 'Crossfade',
    label: 'Crossfade',
    category: 'composite',
    inputs: [
      { id: 'a', label: 'From', dataType: 'frame' },
      { id: 'b', label: 'To', dataType: 'frame' },
      { id: 't', label: 'T (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { t: 0.5 },
  },
  {
    type: 'Wipe',
    label: 'Wipe',
    category: 'composite',
    inputs: [
      { id: 'a', label: 'From', dataType: 'frame' },
      { id: 'b', label: 'To', dataType: 'frame' },
      { id: 't', label: 'T (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { t: 0.5, direction: 'right' },
  },
  {
    type: 'Dissolve',
    label: 'Dissolve',
    category: 'composite',
    inputs: [
      { id: 'a', label: 'From', dataType: 'frame' },
      { id: 'b', label: 'To', dataType: 'frame' },
      { id: 't', label: 'T (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { t: 0.5 },
  },

  // ── Multi-Pattern Master ───────────────────────────────────────────────
  {
    type: 'PatternMaster',
    label: 'Pattern Master',
    category: 'pattern',
    inputs: [
      { id: 'p0', label: 'Pattern 1', dataType: 'frame' },
      { id: 'p1', label: 'Pattern 2', dataType: 'frame' },
      { id: 'p2', label: 'Pattern 3', dataType: 'frame' },
      { id: 'p3', label: 'Pattern 4', dataType: 'frame' },
      { id: 'beat', label: 'Beat', dataType: 'bool' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { mode: 'cycle', interval: 4.0 },
  },
  {
    // Timeline-as-a-node: cycles its inputs with a timed crossfade.
    type: 'Sequencer',
    label: 'Sequencer',
    category: 'composite',
    inputs: [
      { id: 'p0', label: 'Pattern 1', dataType: 'frame' },
      { id: 'p1', label: 'Pattern 2', dataType: 'frame' },
      { id: 'p2', label: 'Pattern 3', dataType: 'frame' },
      { id: 'p3', label: 'Pattern 4', dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { interval: 4.0, fade: 1.0 },
  },

  // ── Custom Formula ────────────────────────────────────────────────────
  {
    type: 'CustomFormula',
    label: 'Custom Formula',
    category: 'pattern',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { formula: 'sin(x*6+t)*0.5+0.5', palette: 'rainbow' },
  },

  // ── Output ─────────────────────────────────────────────────────────────
  {
    type: 'MatrixOutput',
    label: 'Matrix Output',
    category: 'output',
    inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    outputs: [],
    defaultProperties: {
      width: 16,
      height: 16,
      chipset: 'WS2812B',
      colorOrder: 'GRB',
      dataPin: 5,
      serpentine: false,
    },
  },

  // ── Hardware ───────────────────────────────────────────────────────────
  {
    type: 'ButtonInput',
    label: 'Button',
    category: 'hardware',
    inputs: [],
    outputs: [{ id: 'pressed', label: 'Pressed', dataType: 'bool' }],
    defaultProperties: { pin: 0, pullup: true },
  },
  {
    type: 'PotInput',
    label: 'Potentiometer',
    category: 'hardware',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    defaultProperties: { pin: 34 },
  },
]

// Single source of truth for category display order, labels, and accent colors.
// `color` is the literal hex used in canvas/SVG contexts (minimap, edges); the
// CSS var is used wherever theming should apply.
// Order here drives the sidebar grouping order, following the authoring
// pipeline: sources → value transforms → color → frames → compositing → output.
export const CATEGORIES = [
  { id: 'audio',     label: 'Audio',      accentVar: '--accent-audio',     color: '#00ffff' },
  { id: 'hardware',  label: 'Hardware',   accentVar: '--accent-hardware',  color: '#ffa500' },
  { id: 'math',      label: 'Math',       accentVar: '--accent-math',      color: '#a8ff00' },
  { id: 'color',     label: 'Color',      accentVar: '--accent-color',     color: '#ff4d8d' },
  { id: 'pattern',   label: 'Pattern',    accentVar: '--accent-pattern',   color: '#ff00ff' },
  { id: 'composite', label: 'Composite',  accentVar: '--accent-composite', color: '#00e0a4' },
  { id: 'output',    label: 'Output',     accentVar: '--accent-output',    color: '#00bfff' },
] as const

/** id → literal hex (canvas/SVG: minimap nodes, edge strokes). */
export const CATEGORY_COLOR: Record<string, string> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]))

/** id → CSS var reference (DOM styling: node accents, sidebar). */
export const CATEGORY_ACCENT_VAR: Record<string, string> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, `var(${c.accentVar})`]))
