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
    category: 'pattern',
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
    category: 'pattern',
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
    category: 'pattern',
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

  // ── Color ──────────────────────────────────────────────────────────────
  {
    type: 'HSVToRGB',
    label: 'HSV → RGB',
    category: 'math',
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
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'color' },
      { id: 'b', label: 'B', dataType: 'color' },
      { id: 't', label: 'Mix', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { t: 0.5 },
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

export const CATEGORIES = [
  { id: 'audio', label: 'Audio', accentVar: '--accent-audio' },
  { id: 'pattern', label: 'Pattern', accentVar: '--accent-pattern' },
  { id: 'math', label: 'Math', accentVar: '--accent-math' },
  { id: 'output', label: 'Output', accentVar: '--accent-output' },
  { id: 'hardware', label: 'Hardware', accentVar: '--accent-hardware' },
] as const
