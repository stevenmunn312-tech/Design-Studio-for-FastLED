// Generative pattern node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'
import { JUGGLE_COUNT } from './juggle'

export const GENERATIVE_DEFINITIONS: NodeDefinition[] = [
  {
    // Bundled noise generators — `noiseType` selects the algorithm. The
    // variants share the same speed/scale/palette controls, expose a raw scalar
    // `field`, and also map that field through a palette to the normal `frame`
    // output. See PROPERTY_META.noiseType.
    type: 'Noise',
    label: 'Noise',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', scale: 'scale', palette: 'paletteIn' },
    outputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'field', label: 'Field', dataType: 'field' },
    ],
    defaultProperties: { noiseType: 'field', speed: 0.5, scale: 0.5, palette: 'rainbow', seed: 0, wrapX: false, noiseShape: 'plain', worleyMode: 'f1' },
  },
  {
    type: 'Plasma',
    label: 'Plasma',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, palette: 'rainbow' },
  },
  {
    // FastLED fill_rainbow — a scrolling hue sweep; `deltaHue` sets the spread per LED.
    type: 'Rainbow',
    label: 'Rainbow',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'deltaHue', label: 'Delta Hue', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', deltaHue: 'deltaHue' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.3, deltaHue: 6 },
  },
  {
    // Homage to Mark Kriegsman's Pride2015 — a shifting full-spectrum rainbow
    // with a breathing brightness wave along the strip. Same evocative-formula
    // approach as Plasma (identical trig on both the preview and firmware
    // side), not a literal port of the original's 16-bit fixed-point math.
    type: 'Pride2015',
    label: 'Pride 2015',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', scale: 'scale' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.4, scale: 0.4 },
  },
  {
    // Homage to the FastLED "Pacifica" ocean-wave demo — layered scrolling
    // waves through an ocean palette plus a whitecap sparkle at wave crests.
    type: 'Pacifica',
    label: 'Pacifica',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', scale: 'scale', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.35, scale: 0.5, palette: 'ocean' },
  },
  {
    // Homage to Mark Kriegsman's TwinkleFox — palette-driven lights that each
    // twinkle on their own deterministic schedule. Same evocative-formula
    // approach as Pride2015/Pacifica (a per-pixel hash driving an independent
    // brightness cycle, identical on preview and firmware), not a literal port
    // of the original's PRNG16 walk.
    type: 'TwinkleFox',
    label: 'TwinkleFox',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'density', label: 'Density', dataType: 'float' },
    ],
    propertyInputs: { density: 'density', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, density: 0.5, palette: 'party', seed: 0 },
  },
  {
    // Palette-driven Larson scanner / Cylon eye — a bar that sweeps back and
    // forth across one axis, with a soft trail controlled by `fade`.
    type: 'Scanner',
    label: 'Scanner',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'width', label: 'Width', dataType: 'float' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', palette: 'paletteIn', width: 'width', fade: 'fade' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.45, width: 2, fade: 0.6, axis: 'horizontal', palette: 'lava' },
  },
  {
    // FastLED DemoReel-style confetti — random palette speckles sprinkled onto
    // a persistent buffer that fades toward black each frame.
    type: 'Confetti',
    label: 'Confetti',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'density', label: 'Density', dataType: 'float' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
    ],
    propertyInputs: { density: 'density', fade: 'fade', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.45, density: 0.45, fade: 0.28, palette: 'party', seed: 0 },
  },
  {
    // Candle — warm flame flicker on one shared value or on every pixel.
    type: 'Candle',
    label: 'Candle',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'flicker', label: 'Flicker', dataType: 'float' },
      { id: 'warmth', label: 'Warmth', dataType: 'float' },
    ],
    propertyInputs: { flicker: 'flicker', warmth: 'warmth' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { mode: 'single', flicker: 0.6, warmth: 0.5 },
  },
  {
    // Lightning — random strikes of two to five flashes, or one on each trigger.
    type: 'Lightning',
    label: 'Lightning',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'rate', label: 'Rate', dataType: 'float' },
      { id: 'intensity', label: 'Intensity', dataType: 'float' },
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
    ],
    propertyInputs: { rate: 'rate', intensity: 'intensity' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { rate: 6, intensity: 1, color: '#cfe0ff' },
  },
  {
    // Heartbeat — the lub-dub double pulse as a brightness and palette envelope.
    type: 'Heartbeat',
    label: 'Heartbeat',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'bpm', label: 'BPM', dataType: 'float' },
      { id: 'strength', label: 'Strength', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { bpm: 'bpm', strength: 'strength', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { bpm: 72, strength: 0.8, palette: 'lava' },
  },
  {
    // Sunrise — night blue to warm white, on a timer or from a 0–1 progress input.
    type: 'Sunrise',
    label: 'Sunrise',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'progress', label: 'Progress', dataType: 'float' },
      { id: 'duration', label: 'Duration', dataType: 'float' },
      { id: 'start', label: 'Start', dataType: 'float' },
    ],
    propertyInputs: { progress: 'progress', duration: 'duration', start: 'start' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { mode: 'timed', duration: 30, start: 0, progress: 0 },
  },
  {
    // Digital Rain — falling streams with bright heads and fading tails.
    type: 'DigitalRain',
    label: 'Digital Rain',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'density', label: 'Density', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'tailLength', label: 'Tail Length', dataType: 'float' },
      { id: 'flicker', label: 'Flicker', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { density: 'density', speed: 'speed', tailLength: 'tailLength', flicker: 'flicker', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { direction: 'down', density: 0.5, speed: 0.5, tailLength: 8, flicker: 0.3, palette: 'forest', seed: 0 },
  },
  {
    // TV Simulator — seeded scene cuts between coloured blocks, with a slow drift.
    type: 'TVSimulator',
    label: 'TV Simulator',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'cutRate', label: 'Cut Rate', dataType: 'float' },
      { id: 'brightness', label: 'Brightness', dataType: 'float' },
    ],
    propertyInputs: { cutRate: 'cutRate', brightness: 'brightness' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { cutRate: 0.5, brightness: 0.8 },
  },
  {
    // DemoReel-style juggling dots — multiple sine-driven palette dots on a
    // fading persistent buffer. `count = 1` gives the Sinelon-style case.
    type: 'Juggle',
    label: 'Juggle',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'count', label: 'Count', dataType: 'float' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', count: 'count', fade: 'fade', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, count: JUGGLE_COUNT.default, fade: 0.22, palette: 'rainbow', seed: 0 },
  },

  // ── More pattern nodes ─────────────────────────────────────────────────
  {
    type: 'RadialBurst',
    label: 'Radial Burst',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      // Keep the persisted `arms` port id for saved-graph compatibility; the
      // pattern is radial rings, so the user-facing name describes its effect.
      { id: 'arms', label: 'Rings', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', arms: 'arms', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, arms: 8, palette: 'ocean' },
  },
  {
    type: 'Spiral',
    label: 'Spiral',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'arms', label: 'Arms', dataType: 'float' },
    ],
    propertyInputs: { arms: 'arms', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, arms: 2, palette: 'rainbow' },
  },
  {
    type: 'Kaleidoscope',
    label: 'Kaleidoscope',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'segments', label: 'Segments', dataType: 'float' },
    ],
    propertyInputs: { segments: 'segments' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { segments: 6 },
  },

  // ── Proper noise (Simplex2D / Noise3D / Worley / PlasmaFractal folded into
  //    the bundled `Noise` node above) ───────────────────────────────────────
  {
    // Fractal (fBm) noise — summed octaves for detailed, cloud-like motion.
    type: 'FractalNoise',
    label: 'Fractal Noise',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'octaves', label: 'Octaves', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', scale: 'scale', palette: 'paletteIn', octaves: 'octaves' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.25, scale: 0.3, octaves: 4, palette: 'forest', seed: 0, noiseShape: 'plain' },
  },
  {
    // Gabor noise — sparse-convolution oriented bands through a palette.
    type: 'GaborNoise',
    label: 'Gabor Noise',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'frequency', label: 'Frequency', dataType: 'float' },
      { id: 'orientation', label: 'Orientation', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: {
      speed: 'speed', scale: 'scale', frequency: 'frequency',
      orientation: 'orientation', palette: 'paletteIn',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.33, scale: 0.7, frequency: 1.2, orientation: 45, palette: 'ocean', seed: 0 },
  },
  {
    // Metaballs — merging lava-lamp blobs from summed inverse-square fields.
    type: 'Blobs',
    label: 'Blobs',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Size', dataType: 'float' },
      { id: 'count', label: 'Count', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', scale: 'scale', count: 'count', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.3, scale: 0.44, count: 3, palette: 'lava' },
  },
]

export const GENERATIVE_DESCRIPTIONS: Record<string, string> = {
  Noise: 'Bundled noise variants with frame and raw field outputs.',
  Plasma: 'Animated plasma interference pattern through a palette.',
  Rainbow: 'FastLED fill_rainbow — a scrolling hue sweep across the matrix.',
  Pride2015: 'Shifting rainbow with a breathing brightness wave.',
  Pacifica: 'Layered ocean waves through a palette, with whitecap sparkle.',
  TwinkleFox: 'Palette-driven lights that twinkle on independent schedules.',
  Scanner: 'Larson scanner / Cylon eye — a palette beam with adjustable width and fade.',
  Confetti: 'Random fading palette speckles on a persistent frame buffer.',
  Candle: 'Warm flame flicker, one flame or one per pixel.',
  Lightning: 'Storm flashes: random strikes of two to five flickers, or one on each trigger.',
  Heartbeat: 'A lub-dub double pulse at a set heart rate.',
  Sunrise: 'A dawn ramp from night blue to warm white, on a timer or a progress input.',
  DigitalRain: 'Falling streams of light with bright heads and fading tails, in any direction.',
  TVSimulator: 'Flickering television light: quick scene cuts between coloured blocks.',
  Juggle: 'N sine-driven dots with trails; count 1 gives the Sinelon case.',
  RadialBurst: 'Rings bursting from the center.',
  Spiral: 'Rotating spiral arms.',
  Kaleidoscope: 'Mirrors a frame into kaleidoscope symmetry.',
  FractalNoise: 'Fractal (fBm) noise — summed octaves, cloud-like.',
  GaborNoise: 'Gabor noise — oriented bands via sparse convolution.',
  Blobs: 'Metaballs — merging lava-lamp blobs.',
}
