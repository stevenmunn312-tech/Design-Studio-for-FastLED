import type { NodeDefinition } from '../types'

export const NODE_LIBRARY: NodeDefinition[] = [
  // ── Input (signal sources) ─────────────────────────────────────────────
  {
    type: 'MicInput',
    label: 'Microphone',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    // gain/agc/threshold/attack/decay drive the browser preview's adaptive
    // noise gate; the i2s* pins + channel drive the generated firmware's
    // INMP441 I2S reader (ESP32). Defaults match a common ESP32-S3 wiring.
    defaultProperties: {
      gain: 1.0,
      agc: false,
      threshold: 0.08,
      attack: 0.2,
      decay: 0.05,
      sampleRate: 44100,
      i2sWs: 39,
      i2sSck: 40,
      i2sSd: 41,
      channel: 'Left',
    },
  },
  {
    // Song source for the pre-planned show pipeline. Double-click on the canvas
    // opens the Music Library panel (drop MP3s, analyse, export).
    type: 'MusicLibrary',
    label: 'Music Library',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'songs', label: 'Songs', dataType: 'songs' }],
    defaultProperties: {},
  },

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
    defaultProperties: { bands: 24, gain: 1, smoothing: 0.72 },
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
    defaultProperties: { threshold: 0.2, attack: 0.55, decay: 0.25 },
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
    // Renders text with the built-in 3×5 font; scroll > 0 scrolls it left.
    type: 'Text',
    label: 'Text',
    category: 'pattern',
    inputs: [
      { id: 'color',  label: 'Color',  dataType: 'color' },
      { id: 'scroll', label: 'Scroll', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { text: 'HELLO', x: 1, y: 1, scroll: 0, r: 0, g: 255, b: 255 },
  },
  {
    // Draws a circle (ring, or filled disc) over an optional base frame.
    type: 'Circle',
    label: 'Circle',
    category: 'pattern',
    inputs: [
      { id: 'base',  label: 'Base',  dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { cx: 8, cy: 8, radius: 6, filled: false, r: 255, g: 0, b: 128 },
  },
  {
    // Draws a line between two points over an optional base frame.
    type: 'Line',
    label: 'Line',
    category: 'pattern',
    inputs: [
      { id: 'base',  label: 'Base',  dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { x1: 0, y1: 0, x2: 15, y2: 15, r: 0, g: 200, b: 255 },
  },
  {
    // Bundled noise generators — `noiseType` selects the algorithm. The
    // variants (sine field, simplex, 3D, Worley, plasma-fractal) all share the
    // same (speed, scale, palette)→frame signature, so they collapse into one
    // node with an inline dropdown. See PROPERTY_META.noiseType.
    type: 'Noise',
    label: 'Noise',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { noiseType: 'field', speed: 1.0, scale: 0.4, palette: 'rainbow' },
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
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
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
    // Fade the frame toward black — FastLED's fadeToBlackBy. fade 0 = unchanged, 1 = full black.
    type: 'Fade',
    label: 'Fade to Black',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { fade: 0.5 },
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
  {
    // Animated geometric transform of a frame (rotate / scale / translate).
    type: 'Transform',
    label: 'Transform',
    category: 'composite',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'rate', label: 'Rate', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { transform: 'rotate', rate: 90, angle: 0 },
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
    type: 'BassRings',
    label: 'Bass Rings',
    category: 'pattern',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1.0, r: 255, g: 120, b: 32 },
  },
  {
    type: 'MidrangeWaves',
    label: 'Midrange Waves',
    category: 'pattern',
    inputs: [
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'intensity', label: 'Intensity', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { intensity: 1.0, speed: 1.0, palette: 'ocean' },
  },
  {
    type: 'TrebleSparks',
    label: 'Treble Sparks',
    category: 'pattern',
    inputs: [
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'density', label: 'Density', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { density: 0.5, r: 180, g: 220, b: 255 },
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
    // Bundled particle systems — `particleType` selects the simulation. All
    // variants share the (rate, color, decay)→frame signature; the evaluator and
    // codegen dispatch on the variant. See PROPERTY_META.particleType.
    type: 'Particles',
    label: 'Particles',
    category: 'pattern',
    inputs: [
      { id: 'rate', label: 'Rate', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { particleType: 'fountain', rate: 0.3, decay: 0.92, r: 100, g: 200, b: 255 },
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
    // Bundled binary math — `mathOp` selects the operation. All variants share
    // the (a, b)→result signature; the header reflects the chosen op. See
    // PROPERTY_META.mathOp and the `Math` case in graphEvaluator/cppGenerator.
    type: 'Math',
    label: 'Math',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { mathOp: 'add' },
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
    // Waveform oscillator over time: amplitude · wave(frequency·t + phase).
    type: 'Wave',
    label: 'Wave',
    category: 'math',
    inputs: [
      { id: 'amplitude', label: 'Amplitude', dataType: 'float' },
      { id: 'frequency', label: 'Frequency', dataType: 'float' },
      { id: 'phase', label: 'Phase', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { amplitude: 1, frequency: 1, phase: 0, waveform: 'sine' },
  },
  {
    // Combines two wave (float) signals via a selectable operation.
    type: 'ComplexWave',
    label: 'Complex Wave',
    category: 'math',
    inputs: [
      { id: 'a', label: 'Wave A', dataType: 'float' },
      { id: 'b', label: 'Wave B', dataType: 'float' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { operation: 'add' },
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
    // Black-body white point from a colour temperature in Kelvin.
    type: 'Temperature',
    label: 'Color Temperature',
    category: 'color',
    inputs: [{ id: 'kelvin', label: 'Kelvin', dataType: 'float' }],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { kelvin: 4000 },
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
    // Polar-interpolated palette between two anchor colours (poline).
    type: 'Poline',
    label: 'Poline Palette',
    category: 'color',
    inputs: [
      { id: 'colorA', label: 'Anchor A', dataType: 'color' },
      { id: 'colorB', label: 'Anchor B', dataType: 'color' },
    ],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { anchorA: '#1020ff', anchorB: '#ff20a0', points: 4, position: 'sinusoidal' },
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
    defaultProperties: { paletteA: 'rainbow', paletteB: 'ocean', amount: 0.5 },
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

  // ── Proper noise (Simplex2D / Noise3D / Worley / PlasmaFractal folded into
  //    the bundled `Noise` node above) ───────────────────────────────────────
  {
    // Fractal (fBm) noise — summed octaves for detailed, cloud-like motion.
    type: 'FractalNoise',
    label: 'Fractal Noise',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.3, scale: 0.15, octaves: 4, palette: 'forest' },
  },
  {
    // Gabor noise — sparse-convolution oriented bands through a palette.
    type: 'GaborNoise',
    label: 'Gabor Noise',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'frequency', label: 'Frequency', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, scale: 0.35, frequency: 1.2, orientation: 45, palette: 'ocean' },
  },
  {
    // Angled palette gradient across the matrix.
    type: 'PaletteGradient',
    label: 'Palette Gradient',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Scroll', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { angle: 45, repeat: 1, speed: 0, palette: 'rainbow' },
  },
  {
    // Uploaded image, downscaled and nearest-sampled to the matrix.
    type: 'Image',
    label: 'Image',
    category: 'pattern',
    inputs: [],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {},
  },
  {
    // Metaballs — merging lava-lamp blobs from summed inverse-square fields.
    type: 'Blobs',
    label: 'Blobs',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Size', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.6, scale: 0.22, count: 3, palette: 'lava' },
  },
  {
    // Flow field — particles drift along a noise direction field, leaving trails.
    type: 'FlowField',
    label: 'Flow Field',
    category: 'pattern',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1, scale: 0.08, count: 80, fade: 0.9, palette: 'ocean' },
  },
  {
    // Warp starfield — stars streak outward from the centre.
    type: 'Starfield',
    label: 'Starfield',
    category: 'pattern',
    inputs: [
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 1, count: 60, r: 255, g: 255, b: 255 },
  },
  {
    // Audio-reactive flowing noise field (bass/mids/treble drive it).
    type: 'AudioFlow',
    label: 'Audio Flow',
    category: 'pattern',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, scale: 0.5, palette: 'rainbow' },
  },
  {
    // Gray-Scott reaction-diffusion — organic spots/stripes that evolve.
    type: 'ReactionDiffusion',
    label: 'Reaction Diffusion',
    category: 'pattern',
    inputs: [
      { id: 'feed', label: 'Feed', dataType: 'float' },
      { id: 'kill', label: 'Kill', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { feed: 0.055, kill: 0.062, speed: 8, palette: 'ocean' },
  },
  {
    // Conway's Game of Life with fading trails; reseeds when it stagnates.
    type: 'GameOfLife',
    label: 'Game of Life',
    category: 'pattern',
    inputs: [
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 8, fade: 0.75, r: 0, g: 255, b: 70 },
  },

  // ── Transition nodes ──────────────────────────────────────────────────
  {
    // Bundled transitions — `transitionType` selects one of 16 A→B effects.
    // All share the (a, b, t)→frame signature; the variant-specific properties
    // (`direction`, `axis`, `tileSize`, `count`, `turns`) only apply to some
    // variants (the inline editor disables the others via isPropertyEnabled).
    // See the `Transition` case in graphEvaluator/cppGenerator.
    type: 'Transition',
    label: 'Transition',
    category: 'composite',
    inputs: [
      { id: 'a', label: 'From', dataType: 'frame' },
      { id: 'b', label: 'To', dataType: 'frame' },
      { id: 't', label: 'T (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      transitionType: 'crossfade', t: 0.5,
      direction: 'right', axis: 'horizontal', tileSize: 4, count: 4, turns: 2,
    },
  },

  // ── Pattern Master — the generative show engine (Phase 3) ──────────────
  {
    // Runs a random show from a Pattern Collection: holds a random pattern for
    // a random dwell (minTime…maxTime), then transitions (a random style from
    // the chosen pool) into another. A wired `beat` advances early (after
    // minTime). See docs/development/design/generative-pattern-show.md.
    type: 'PatternMaster',
    label: 'Pattern Master',
    category: 'pattern',
    inputs: [
      { id: 'patternset', label: 'Patterns', dataType: 'patternset' },
      { id: 'beat',       label: 'Beat',     dataType: 'bool' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      minTime: 4, maxTime: 12, transitionSec: 1,
      transitions: ['crossfade', 'wipe', 'dissolve', 'iris', 'push', 'fadeblack'],
    },
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

  // ── Generative pattern show (Phase 2) ──────────────────────────────────
  {
    // Holds a chosen subset of pattern groups for a show. Wire a Group node's
    // frame output here and confirm to *absorb* it into the collection's list
    // (it leaves the canvas). Outputs a `patternset` for the Pattern Master.
    // See docs/development/design/generative-pattern-show.md.
    type: 'PatternCollection',
    label: 'Pattern Collection',
    category: 'composite',
    inputs: [{ id: 'pattern', label: 'Pattern', dataType: 'frame' }],
    outputs: [{ id: 'patternset', label: 'Patterns', dataType: 'patternset' }],
    defaultProperties: { patternIds: [] },
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
  {
    // Paste raw FastLED C++ (a loop body that writes into leds[]). The text is
    // emitted verbatim into the sketch; the live preview approximates it via a
    // lightweight C++→JS shim. See docs/development/design/code-node.md.
    type: 'Code',
    label: 'Code',
    category: 'pattern',
    inputs: [
      // Optional: seed leds[] from an upstream frame (e.g. to fadeToBlackBy it).
      { id: 'frame', label: 'Frame', dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // File-scope: persistent vars, palettes, helper functions. Emitted above
      // setup()/loop() in the sketch; runs each frame in the preview.
      globalCode: '',
      // The loop() body — runs every frame, writes into leds[].
      code: [
        'fadeToBlackBy(leds, NUM_LEDS, 20);',
        'uint8_t dothue = 0;',
        'for (int i = 0; i < 8; i++) {',
        '  leds[beatsin16(i + 7, 0, NUM_LEDS - 1)] |= CHSV(dothue, 200, 255);',
        '  dothue += 32;',
        '}',
      ].join('\n'),
    },
  },

  // ── Float Field (ANIMartRIX-style coordinate → scalar pipeline) ─────────
  // FieldFormula emits a per-pixel scalar `field` (0–1); FieldToFrame maps a
  // field through a palette to a frame. See
  // docs/development/design/animartrix-float-field.md.
  {
    type: 'FieldFormula',
    label: 'Field Formula',
    category: 'pattern',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'fieldIn', label: 'Field', dataType: 'field' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { formula: 'sin8(r*200 + t*60)/255' },
  },
  {
    type: 'FieldToFrame',
    label: 'Field → Frame',
    category: 'pattern',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { palette: 'ocean', brightness: 1 },
  },
  // Phase 2 field-composition nodes.
  {
    type: 'DistanceField',
    label: 'Distance Field',
    category: 'pattern',
    inputs: [
      { id: 'px', label: 'X', dataType: 'float' },
      { id: 'py', label: 'Y', dataType: 'float' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { px: 0.5, py: 0.5, scale: 1 },
  },
  {
    type: 'FieldMath',
    label: 'Field Math',
    category: 'pattern',
    inputs: [
      { id: 'a', label: 'A', dataType: 'field' },
      { id: 'b', label: 'B', dataType: 'field' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { fieldOp: 'add' },
  },
  {
    type: 'FieldWarp',
    label: 'Field Warp',
    category: 'composite',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'dx', label: 'dX', dataType: 'field' },
      { id: 'dy', label: 'dY', dataType: 'field' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { strength: 1 },
  },
  // Phase 3 coordinate-space transforms (resample a field at remapped coords).
  {
    type: 'FieldRotate',
    label: 'Field Rotate',
    category: 'composite',
    inputs: [
      { id: 'field', label: 'Field', dataType: 'field' },
      { id: 'angle', label: 'Angle', dataType: 'float' },
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { angle: 0, spin: 30 },
  },
  {
    type: 'FieldTile',
    label: 'Field Tile',
    category: 'composite',
    inputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { tilesX: 2, tilesY: 2 },
  },

  // ── Output ─────────────────────────────────────────────────────────────
  {
    type: 'MatrixOutput',
    label: 'Matrix Output',
    category: 'output',
    inputs: [
      { id: 'frame',  label: 'Frame',   dataType: 'frame' },
      // Optional: wire an SD Card node here to bundle songs/shows onto the card
      // (written first over serial) before the sketch is flashed on upload.
      { id: 'sdcard', label: 'SD Card', dataType: 'sdcard' },
    ],
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

  // ── Music-sync pipeline (the Music Library source lives in the Input group) ─
  {
    type: 'PerformanceGenerator',
    label: 'Performance Generator',
    category: 'hardware',
    inputs: [{ id: 'songs', label: 'Songs', dataType: 'songs' }],
    outputs: [{ id: 'shows', label: 'Shows', dataType: 'shows' }],
    defaultProperties: {
      beatIntensity:      0.8,
      energySensitivity:  0.7,
      transitionDuration: 0.5,
      paletteMode:        'mood',
      fixedPalette:       'rainbow',
    },
  },
  {
    // The SD card + audio-output module. Holds only the SD/I2S pin config (the
    // LED matrix config comes from the MatrixOutput node it connects to); its
    // `sdcard` output plugs into MatrixOutput's `sdcard` input to enable the
    // write-songs-to-SD-then-flash upload flow.
    type: 'SDCard',
    label: 'SD Card',
    category: 'hardware',
    inputs: [{ id: 'shows', label: 'Shows', dataType: 'shows' }],
    outputs: [{ id: 'sdcard', label: 'SD Card', dataType: 'sdcard' }],
    defaultProperties: {
      sdCsPin:     5,
      i2sBclk:     26,
      i2sLrc:      25,
      i2sDout:     22,
      maxVolume:   18,
    },
  },
]

// One-line descriptions shown as tooltips in the node shelf. Keyed by node
// `type`; a test enforces that every NODE_LIBRARY entry has one.
export const NODE_DESCRIPTIONS: Record<string, string> = {
  // audio
  FFTAnalyzer: 'Splits mic audio into bass / mids / treble levels.',
  BeatDetect: 'Emits a beat pulse and estimated BPM from audio.',
  MicInput: 'Microphone — optional AGC, preview gate, and INMP441 I2S firmware.',
  AudioHue: 'Maps bass/mids/treble to a hue value.',
  // hardware
  ButtonInput: 'Reads a hardware button as a boolean.',
  PotInput: 'Reads a potentiometer as a 0–1 value.',
  MusicLibrary: 'MP3 song source — double-click to drop tracks, analyse and export.',
  PerformanceGenerator: 'Converts song analysis into a timed LED show file.',
  SDCard: 'SD + audio pins; connect to Matrix Output to load songs/shows on upload.',
  // math
  Math: 'Binary math — add, subtract, multiply, divide, min or max (a op b).',
  Clamp: 'Constrains a value between min and max.',
  MapRange: 'Remaps a value from one range to another.',
  Sin: 'Sine of the input (×2π).',
  Cos: 'Cosine of the input (×2π).',
  Wave: 'Oscillator — sine, triangle, square or sawtooth over time.',
  ComplexWave: 'Combines two waves (add, multiply, average, min/max, difference).',
  Lerp: 'Linear interpolation between a and b by t.',
  TimeNode: 'Elapsed time in seconds, plus a frame delta.',
  Abs: 'Absolute value.',
  Mod: 'Modulo — x wrapped into [0, m).',
  Random: 'Random value in a range.',
  Counter: 'Ramps 0→1 over time at a set speed.',
  Gate: 'Passes a value when a boolean is true, else a fallback.',
  Not: 'Logical NOT of a boolean.',
  Compare: 'True when a > b.',
  BeatSin: 'FastLED beatsin8 — oscillates low↔high at a BPM.',
  XYMapper: 'Converts (x, y) to a strip index.',
  // color
  GradientSampler: 'Samples a two-color gradient at t.',
  PaletteSampler: 'Samples a palette at t to a color.',
  HSVToRGB: 'Converts hue/sat/val to an RGB color.',
  BlendColors: 'Blends two colors by an amount.',
  CHSV: 'FastLED CHSV color (0–255 hue/sat/val).',
  Temperature: 'White point from a colour temperature in Kelvin (warm→cool).',
  PaletteSelector: 'Outputs a named preset palette.',
  CustomPalette: 'Builds a palette from up to four colors.',
  Poline: 'Smooth poline palette between two anchor colours.',
  PaletteBlend: 'Interpolates between two palettes.',
  // pattern
  SolidColor: 'Fills the matrix with one color.',
  Span: 'Lights a horizontal run on one row.',
  Rect: 'Draws a filled rectangle.',
  Circle: 'Draws a circle — ring or filled disc.',
  Line: 'Draws a line between two points.',
  Text: 'Renders scrolling text in a bitmap font.',
  Noise: 'Noise generator — pick the algorithm with the type dropdown.',
  Fire: 'Classic rising fire effect.',
  Fire2012: 'FastLED Fire2012 heat simulation.',
  Plasma: 'Animated plasma interference pattern.',
  SpectrumBars: 'Audio spectrum bars (bass/mids/treble).',
  BassPulse: 'Pulses a color with bass energy.',
  BassRings: 'Concentric rings that swell and brighten with bass.',
  MidrangeWaves: 'Waves driven by midrange audio.',
  TrebleSparks: 'Glittering treble sparks with a tintable color input.',
  BeatFlash: 'Flashes the frame white on each beat.',
  Noise2D: 'Layered 2D sine noise.',
  RadialBurst: 'Rings bursting from the center.',
  Spiral: 'Rotating spiral arms.',
  Kaleidoscope: 'Mirrors a frame into kaleidoscope symmetry.',
  Particles: 'Particle FX: fountain, gravity, fireworks, sparkle, comet, snow, swarm.',
  GradientFrame: 'Two-color linear gradient fill.',
  FractalNoise: 'Fractal (fBm) noise — summed octaves, cloud-like.',
  Blobs: 'Metaballs — merging lava-lamp blobs.',
  GaborNoise: 'Gabor noise — oriented bands via sparse convolution.',
  PaletteGradient: 'Palette gradient across the matrix at any angle.',
  Image: 'Uploaded image, downscaled to the matrix.',
  FlowField: 'Particles drifting along a noise flow field, with trails.',
  Starfield: 'Warp starfield — stars streak outward from the centre.',
  AudioFlow: 'Audio-reactive flowing noise field.',
  ReactionDiffusion: 'Gray-Scott reaction-diffusion — organic spots & stripes.',
  GameOfLife: 'Conway’s Game of Life with fading trails.',
  PatternMaster: 'Random pattern/transition show from a Pattern Collection.',
  CustomFormula: 'Per-pixel JS expression f(x, y, t) — with cx/cy/r/angle and FastLED shims.',
  Code: 'Paste raw FastLED C++ that writes into leds[].',
  FieldFormula: 'Per-pixel scalar field from an expression (cx/cy/r/angle, sin8/beatsin8…).',
  FieldToFrame: 'Maps a scalar field through a palette to a frame.',
  DistanceField: 'Scalar field of distance from each pixel to a movable point.',
  FieldMath: 'Combines two scalar fields (add, subtract, multiply, mix, min, max, difference).',
  FieldWarp: 'Samples a field at coordinates pushed by two offset fields.',
  FieldRotate: 'Rotates a field around its centre (angle + spin over time).',
  FieldTile: 'Tiles/repeats a field across the matrix.',
  // composite
  Blur2D: 'Box-blurs the frame.',
  Blend: 'Blends B over A — normal, multiply, screen, overlay, add or difference.',
  Mask: 'Masks a frame by another frame’s brightness.',
  BrightnessMod: 'Scales frame brightness.',
  Fade: 'Fades the frame toward black (fadeToBlackBy).',
  HueShift: 'Rotates all hues.',
  Transform: 'Animated rotate, scale or translate of a frame.',
  Invert: 'Inverts colors.',
  Transition: 'Transitions A→B — 16 styles: wipe, iris, push, blinds, spiral, zoom + more.',
  Sequencer: 'Crossfades through its inputs on a timer.',
  PatternCollection: 'Absorbs pattern groups into a set for the Pattern Master.',
  // output
  MatrixOutput: 'The LED matrix output — board, pin, and size.',
}

// Single source of truth for category display order, labels, and accent colors.
// `color` is the literal hex used in canvas/SVG contexts (minimap, edges); the
// CSS var is used wherever theming should apply.
// Order here drives the sidebar grouping order, following the authoring
// pipeline: sources → value transforms → color → frames → compositing → output.
export const CATEGORIES = [
  { id: 'input',     label: 'Input',      accentVar: '--accent-input',     color: '#b388ff' },
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

// Port (handle) colour by data type, so ports that can connect share a colour.
// `float` and `bool` share one — they interconnect (see portsCompatible).
const PORT_COLORS: Record<string, string> = {
  float: '#9aa0a6',
  bool:  '#9aa0a6',
  color: '#ffd24a',
  palette: '#ff5cf0',
  frame: '#5ad1ff',
  field: '#f5c542',
  audio: '#00e0a4',
  songs: '#ffb74d',
  shows: '#ffa726',
  sdcard: '#ffa500',
  patternset: '#00e0a4',
}

/** Colour for a port's data type (used to tint node handles). */
export function portColor(dataType: string): string {
  return PORT_COLORS[dataType] ?? '#9aa0a6'
}

/**
 * Whether an output of `srcType` may connect to an input of `dstType`.
 * `float`/`bool` interconvert; every other type must match exactly.
 */
export function portsCompatible(srcType: string, dstType: string): boolean {
  if (srcType === dstType) return true
  if ((srcType === 'bool' || srcType === 'float') && (dstType === 'bool' || dstType === 'float')) return true
  return false
}

/** Built-in FastLED preset palettes a `palette` property can select. */
export const PALETTES = ['rainbow', 'heat', 'ocean', 'lava', 'forest', 'party'] as const

/**
 * Control hints for inline node property editors (StudioNode), keyed by
 * property name. `select` → dropdown of fixed options; `slider` → range input
 * with the given bounds. Properties not listed fall back to type-based editors
 * (checkbox for booleans, number/text input otherwise).
 */
export type PropertyControl =
  | { control: 'select'; options: readonly string[] }
  | { control: 'slider'; min: number; max: number; step: number }

export const PROPERTY_META: Record<string, PropertyControl> = {
  // Enumerated options → dropdown
  palette:    { control: 'select', options: PALETTES },
  paletteA:   { control: 'select', options: PALETTES },
  paletteB:   { control: 'select', options: PALETTES },
  direction:  { control: 'select', options: ['right', 'left', 'up', 'down'] },
  axis:       { control: 'select', options: ['horizontal', 'vertical'] },
  tileSize:   { control: 'slider', min: 1, max: 16, step: 1 },
  turns:      { control: 'slider', min: 1, max: 6, step: 1 },
  mode:       { control: 'select', options: ['cycle', 'beat'] },
  waveform:   { control: 'select', options: ['sine', 'triangle', 'square', 'sawtooth'] },
  operation:  { control: 'select', options: ['add', 'multiply', 'average', 'min', 'max', 'difference'] },
  transform:  { control: 'select', options: ['rotate', 'scale', 'translate'] },
  // Bundled-node selectors — each picks a variant; keep in sync with the
  // matching case in graphEvaluator.ts and cppGenerator.ts.
  noiseType:      { control: 'select', options: ['field', 'simplex', 'noise3d', 'worley', 'plasma'] },
  mathOp:         { control: 'select', options: ['add', 'subtract', 'multiply', 'divide', 'min', 'max'] },
  transitionType: { control: 'select', options: [
    'crossfade', 'wipe', 'dissolve', 'iris', 'clockwipe', 'push', 'checkerboard',
    'diagonal', 'fadeblack', 'fadewhite', 'blinds', 'ripple', 'spiral', 'curtain',
    'scanlines', 'zoom',
  ] },
  blendMode:      { control: 'select', options: ['normal', 'multiply', 'screen', 'overlay', 'add', 'difference'] },
  fieldOp:        { control: 'select', options: ['add', 'subtract', 'multiply', 'mix', 'min', 'max', 'difference'] },
  particleType:   { control: 'select', options: ['fountain', 'gravity', 'fireworks', 'sparkle', 'comet', 'snow', 'swarm'] },
  channel:        { control: 'select', options: ['Left', 'Right'] },
  // Poline position functions — keep in sync with polinePalette.ts POSITION_FNS.
  position:   { control: 'select', options: ['linear', 'sinusoidal', 'quadratic', 'cubic', 'arc', 'smoothStep', 'exponential'] },
  points:     { control: 'slider', min: 1, max: 12, step: 1 },
  chipset:    { control: 'select', options: ['WS2812B', 'WS2811', 'SK6812', 'APA102', 'WS2801', 'NEOPIXEL'] },
  colorOrder: { control: 'select', options: ['GRB', 'RGB', 'BGR', 'BRG', 'GBR', 'RBG'] },

  // Bounded numeric ranges → slider
  speed:    { control: 'slider', min: 0, max: 5, step: 0.1 },
  scale:    { control: 'slider', min: 0, max: 2, step: 0.01 },
  fade:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  // Opacity / mix amount, normalised 0–1 (scaled to FastLED's 0–255 in the
  // evaluator + codegen). Shared by Blend / Blur2D / PaletteBlend.
  amount:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  t:        { control: 'slider', min: 0, max: 1, step: 0.01 },
  mix:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  bass:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  mids:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  treble:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  octaves:  { control: 'slider', min: 1, max: 6, step: 1 },
  px:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  py:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  strength: { control: 'slider', min: 0, max: 4, step: 0.1 },
  spin:     { control: 'slider', min: -360, max: 360, step: 5 },
  tilesX:   { control: 'slider', min: 1, max: 8, step: 1 },
  tilesY:   { control: 'slider', min: 1, max: 8, step: 1 },
  count:    { control: 'slider', min: 1, max: 200, step: 1 },
  frequency:   { control: 'slider', min: 0, max: 4, step: 0.1 },
  orientation: { control: 'slider', min: 0, max: 360, step: 1 },
  angle:       { control: 'slider', min: 0, max: 360, step: 1 },
  repeat:      { control: 'slider', min: 1, max: 8, step: 1 },
  amplitude:   { control: 'slider', min: 0, max: 5, step: 0.1 },
  phase:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  feed:     { control: 'slider', min: 0, max: 0.1, step: 0.001 },
  kill:     { control: 'slider', min: 0, max: 0.1, step: 0.001 },
  interval: { control: 'slider', min: 0.1, max: 20, step: 0.1 },
  kelvin:   { control: 'slider', min: 1000, max: 12000, step: 100 },
  // Pattern Master show timing.
  minTime:       { control: 'slider', min: 0, max: 30, step: 0.5 },
  maxTime:       { control: 'slider', min: 0, max: 60, step: 0.5 },
  transitionSec: { control: 'slider', min: 0.1, max: 5, step: 0.1 },

  // Normalised 0–1 control values that were previously free-entry numbers
  // (beat sensitivities, emission/decay rates, HSV sat/val). Bounding them makes
  // editing predictable and lets the `clampInputs` toggle clamp wired signals.
  // Names that mean something different on another node are handled in
  // PROPERTY_META_OVERRIDES below.
  threshold:  { control: 'slider', min: 0, max: 1, step: 0.01 },
  attack:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  decay:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  density:    { control: 'slider', min: 0, max: 1, step: 0.01 },
  brightness: { control: 'slider', min: 0, max: 1, step: 0.01 },
  s:          { control: 'slider', min: 0, max: 1, step: 0.01 },
  v:          { control: 'slider', min: 0, max: 1, step: 0.01 },
  // 0–255 byte ranges (FastLED heat sim + CHSV channels).
  cooling:    { control: 'slider', min: 0, max: 255, step: 1 },
  sparking:   { control: 'slider', min: 0, max: 255, step: 1 },
  hue:        { control: 'slider', min: 0, max: 255, step: 1 },
  sat:        { control: 'slider', min: 0, max: 255, step: 1 },
  val:        { control: 'slider', min: 0, max: 255, step: 1 },
}

// Per-node overrides for property names that collide across nodes with a
// different meaning or range. `speed` is a 0–5 animation speed for most nodes
// but a steps-per-second rate for the simulation patterns; `rate` is a 0–1
// emission rate for Particles but a degrees/sec spin for Transform.
export const PROPERTY_META_OVERRIDES: Record<string, Record<string, PropertyControl>> = {
  FFTAnalyzer:       {
    bands:     { control: 'slider', min: 8, max: 32, step: 1 },
    gain:      { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    smoothing: { control: 'slider', min: 0, max: 0.95, step: 0.01 },
  },
  PerformanceGenerator: {
    beatIntensity:      { control: 'slider', min: 0, max: 1, step: 0.05 },
    energySensitivity:  { control: 'slider', min: 0, max: 1, step: 0.05 },
    transitionDuration: { control: 'slider', min: 0.1, max: 3, step: 0.1 },
    paletteMode:        { control: 'select', options: ['mood', 'cycle', 'fixed'] },
    fixedPalette:       { control: 'select', options: ['rainbow', 'ocean', 'fire', 'forest', 'lava', 'party', 'ice', 'purple'] },
  },
  BeatDetect: {
    threshold: { control: 'slider', min: 0, max: 1, step: 0.01 },
    attack:    { control: 'slider', min: 0, max: 1, step: 0.01 },
    decay:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  AudioFlow: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
    scale: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  MidrangeWaves: {
    intensity: { control: 'slider', min: 0, max: 1, step: 0.01 },
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  Particles:         { rate:  { control: 'slider', min: 0, max: 1,   step: 0.01 } },
  Transform:         { rate:  { control: 'slider', min: 0, max: 360, step: 1 } },
  GameOfLife:        { speed: { control: 'slider', min: 1, max: 30,  step: 1 } },
  ReactionDiffusion: { speed: { control: 'slider', min: 1, max: 30,  step: 1 } },
  // DistanceField stretches the distance ramp 1×–4× (the shared `scale` is 0–2).
  DistanceField:     { scale: { control: 'slider', min: 1, max: 4,   step: 0.1 } },
}

/** Inline-editor control hint for a node's property, honouring per-node overrides. */
export function propertyMeta(nodeType: string, key: string): PropertyControl | undefined {
  return PROPERTY_META_OVERRIDES[nodeType]?.[key] ?? PROPERTY_META[key]
}

/**
 * The [min, max] a wired float input is clamped to when a node's `clampInputs`
 * toggle is on — taken from the property's slider bounds (per-node aware).
 * `null` when the property has no bounded slider, in which case the wired value
 * passes through unclamped.
 */
export function inputClampRange(nodeType: string, key: string): { min: number; max: number } | null {
  const m = propertyMeta(nodeType, key)
  return m?.control === 'slider' ? { min: m.min, max: m.max } : null
}

/** Whether a node has any float input whose value can be clamped — i.e. whether
 *  the "clamp inputs" toggle would do anything, so it's worth showing. */
export function hasClampableInputs(nodeType: string, inputs: { id: string; dataType?: string }[]): boolean {
  return inputs.some((p) => p.dataType === 'float' && inputClampRange(nodeType, p.id) != null)
}

/**
 * Bundled nodes (Noise / Math / Transition) collapse several former node types
 * behind one entry, selected by a variant property. This maps each to that
 * property plus the human-readable header shown per variant, so the node title
 * reflects the current selection. Keep the variant keys in sync with the
 * matching `PROPERTY_META` options and the evaluator/codegen cases.
 */
const BUNDLED_TITLES: Record<string, { prop: string; labels: Record<string, string> }> = {
  Noise: {
    prop: 'noiseType',
    labels: { field: 'Noise Field', simplex: 'Simplex', noise3d: 'Noise 3D', worley: 'Worley', plasma: 'Plasma Fractal' },
  },
  Math: {
    prop: 'mathOp',
    labels: { add: 'Add', subtract: 'Subtract', multiply: 'Multiply', divide: 'Divide', min: 'Min', max: 'Max' },
  },
  Transition: {
    prop: 'transitionType',
    labels: {
      crossfade: 'Crossfade', wipe: 'Wipe', dissolve: 'Dissolve',
      iris: 'Iris', clockwipe: 'Clock Wipe', push: 'Push', checkerboard: 'Checkerboard',
      diagonal: 'Diagonal Wipe', fadeblack: 'Fade · Black', fadewhite: 'Fade · White',
      blinds: 'Blinds', ripple: 'Ripple Wipe', spiral: 'Spiral Wipe', curtain: 'Curtain',
      scanlines: 'Scan Lines', zoom: 'Zoom',
    },
  },
  Blend: {
    prop: 'blendMode',
    labels: { normal: 'Blend', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', add: 'Add', difference: 'Difference' },
  },
  FieldMath: {
    prop: 'fieldOp',
    labels: { add: 'Field Add', subtract: 'Field Subtract', multiply: 'Field Multiply', mix: 'Field Mix', min: 'Field Min', max: 'Field Max', difference: 'Field Difference' },
  },
  Particles: {
    prop: 'particleType',
    labels: { fountain: 'Fountain', gravity: 'Gravity', fireworks: 'Fireworks', sparkle: 'Sparkle Rain', comet: 'Comet', snow: 'Snow', swarm: 'Swarm' },
  },
}

/** Header label for a node — for bundled nodes this reflects the selected
 *  variant (e.g. a `Math` node with `mathOp: 'multiply'` reads "Multiply"). */
export function nodeDisplayLabel(nodeType: string, properties: Record<string, unknown>, fallback: string): string {
  const cfg = BUNDLED_TITLES[nodeType]
  if (!cfg) return fallback
  return cfg.labels[String(properties[cfg.prop] ?? '')] ?? fallback
}

/** Whether a node's inline property editor should be enabled. A property may be
 *  inapplicable to the current variant (e.g. Transition `direction` only applies
 *  to a wipe), in which case the editor is shown disabled but keeps its value. */
export function isPropertyEnabled(nodeType: string, key: string, properties: Record<string, unknown>): boolean {
  if (nodeType === 'PerformanceGenerator' && key === 'fixedPalette') {
    return String(properties.paletteMode ?? 'mood') === 'fixed'
  }
  if (nodeType === 'Transition') {
    const tt = String(properties.transitionType ?? 'crossfade')
    switch (key) {
      case 'direction': return tt === 'wipe' || tt === 'push'
      case 'axis':      return tt === 'blinds' || tt === 'curtain'
      case 'tileSize':  return tt === 'checkerboard'
      case 'count':     return tt === 'blinds'
      case 'turns':     return tt === 'spiral'
    }
  }
  return true
}
