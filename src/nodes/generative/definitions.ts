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
    // output. See NOISE_TYPES (noiseTypes.ts). `octaves` belongs to fbm and
    // `frequency`/`orientation` to gabor (isPropertyEnabled gates them);
    // `contrast` spreads every type's field about its middle.
    type: 'Noise',
    label: 'Noise',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'octaves', label: 'Octaves', dataType: 'float' },
      { id: 'frequency', label: 'Frequency', dataType: 'float' },
      { id: 'orientation', label: 'Orientation', dataType: 'float' },
    ],
    propertyInputs: {
      speed: 'speed', scale: 'scale', palette: 'paletteIn',
      octaves: 'octaves', frequency: 'frequency', orientation: 'orientation',
    },
    outputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'field', label: 'Field', dataType: 'field' },
    ],
    defaultProperties: {
      noiseType: 'fbm', speed: 0.5, scale: 0.5, palette: 'rainbow', seed: 0, wrapX: false, noiseShape: 'plain', worleyMode: 'f1',
      octaves: 4, frequency: 1.2, orientation: 45, contrast: 1,
    },
  },
  {
    // The classic plasma, or Sine Grid and Sine 2D, the sine styles that were
    // Noise types (PLASMA_STYLES in noiseTypes.ts).
    type: 'Plasma',
    label: 'Plasma',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', scale: 'scale', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { plasmaStyle: 'classic', speed: 0.5, scale: 0.5, palette: 'rainbow' },
  },
  {
    // FastLED fill_rainbow — a scrolling hue sweep; `deltaHue` sets the spread
    // per LED. `axis` runs it along the string's own order (fill_rainbow
    // itself), or across the columns or rows of a matrix.
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
    defaultProperties: { speed: 0.3, deltaHue: 6, axis: 'string' },
  },
  {
    // Homage to Mark Kriegsman's Pride2015 — a shifting full-spectrum rainbow
    // with a breathing brightness wave along the strip. Same evocative-formula
    // approach as Plasma (identical trig on both the preview and firmware
    // side), not a literal port of the original's 16-bit fixed-point math.
    // `palette` 'none' is the rainbow; a palette, set or wired, makes it
    // Kriegsman's colorwaves.
    type: 'Pride2015',
    label: 'Pride 2015',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', scale: 'scale', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.4, scale: 0.4, palette: 'none' },
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
    // forth across one axis, leaving a tail behind it whose length is `trail`.
    type: 'Scanner',
    label: 'Scanner',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'width', label: 'Width', dataType: 'float' },
      { id: 'trail', label: 'Trail', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', palette: 'paletteIn', width: 'width', trail: 'trail' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.45, width: 2, trail: 0.55, axis: 'horizontal', palette: 'lava' },
  },
  {
    // Theater chase / marquee — every `spacing`th LED lit along `axis`, the
    // lit set stepping one place per tick; the palette runs along the strip
    // and drifts slowly with the chase.
    type: 'TheaterChase',
    label: 'Theater Chase',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'spacing', label: 'Spacing', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', palette: 'paletteIn', spacing: 'spacing' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, spacing: 3, axis: 'horizontal', direction: 'forward', palette: 'party' },
  },
  {
    // Colour wipe — the next palette colour sweeps in from one end along
    // `axis`, one wipe per cycle, each wipe painting over the previous one;
    // `bounce` alternates the end it starts from.
    type: 'ColorWipe',
    label: 'Color Wipe',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.4, axis: 'horizontal', direction: 'forward', palette: 'rainbow' },
  },
  {
    // Breathe — one colour swelling and fading at a breaths-per-minute rate,
    // on a natural (exponential), sine, triangle or heartbeat (lub-dub)
    // curve, never below `minLevel`.
    type: 'Breathe',
    label: 'Breathe',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'bpm', label: 'BPM', dataType: 'float' },
      { id: 'minLevel', label: 'Min Level', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { bpm: 'bpm', minLevel: 'minLevel', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { bpm: 12, minLevel: 0.05, curve: 'natural', palette: 'ocean' },
  },
  {
    // FastLED DemoReel-style confetti — random palette speckles sprinkled onto
    // a persistent buffer that fades toward black each frame. Density sets how
    // many; `speed` is the colour drift through the palette.
    type: 'Confetti',
    label: 'Confetti',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Color Drift', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'density', label: 'Density', dataType: 'float' },
      { id: 'trail', label: 'Trail', dataType: 'float' },
    ],
    propertyInputs: { density: 'density', trail: 'trail', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.45, density: 0.25, trail: 0.35, palette: 'party', seed: 0 },
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
    // Sunrise — night blue to warm white, on a timer or from a 0–1 progress
    // input. A rising `trigger` restarts the timer, so a schedule wires in.
    type: 'Sunrise',
    label: 'Sunrise',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'progress', label: 'Progress', dataType: 'float' },
      { id: 'duration', label: 'Duration', dataType: 'float' },
      { id: 'start', label: 'Start', dataType: 'float' },
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
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
    defaultProperties: { direction: 'auto', density: 0.5, speed: 0.5, tailLength: 8, flicker: 0.3, palette: 'forest', seed: 0 },
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
    // DemoReel-style juggling dots — multiple sine-driven palette dots, drawn
    // fresh each frame. `count = 1` gives the Sinelon-style case. Tails come
    // from splicing a Trails node after it, not from Juggle itself.
    type: 'Juggle',
    label: 'Juggle',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'count', label: 'Count', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', count: 'count', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, count: JUGGLE_COUNT.default, palette: 'rainbow', seed: 0 },
  },

  // ── More pattern nodes ─────────────────────────────────────────────────
  {
    type: 'RadialBurst',
    label: 'Radial Burst',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'rings', label: 'Rings', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', rings: 'rings', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, rings: 8, palette: 'ocean' },
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
    // Metaballs — merging lava-lamp blobs from summed inverse-square fields.
    type: 'Blobs',
    label: 'Blobs',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'size', label: 'Size', dataType: 'float' },
      { id: 'count', label: 'Count', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { speed: 'speed', size: 'size', count: 'count', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.3, size: 0.44, count: 3, palette: 'lava' },
  },
]

export const GENERATIVE_DESCRIPTIONS: Record<string, string> = {
  Noise: 'Noise from fBm clouds to Worley cells and Gabor bands, as frame and field.',
  Plasma: 'Plasma interference, a sine grid or layered sine waves, through a palette.',
  Rainbow: 'FastLED fill_rainbow — a scrolling hue sweep across the matrix.',
  Pride2015: 'Shifting rainbow with a breathing brightness wave.',
  Pacifica: 'Layered ocean waves through a palette, with whitecap sparkle.',
  TwinkleFox: 'Palette-driven lights that twinkle on independent schedules.',
  Scanner: 'Larson scanner / Cylon eye — a palette beam sweeping back and forth with a tail.',
  TheaterChase: 'Marquee chase — every Nth LED lit, stepping along the strip in palette colours.',
  ColorWipe: 'The next palette colour sweeps in from one end, wipe after wipe.',
  Breathe: 'One colour swelling and fading at a set rate: a breath, or a heart\'s lub-dub.',
  Confetti: 'Random fading palette speckles on a persistent frame buffer.',
  Candle: 'Warm flame flicker, one flame or one per pixel.',
  Lightning: 'Storm flashes: random strikes of two to five flickers, or one on each trigger.',
  Sunrise: 'A dawn ramp from night blue to warm white, on a timer or a progress input.',
  DigitalRain: 'Falling streams of light with bright heads and fading tails, in any direction.',
  TVSimulator: 'Flickering television light: quick scene cuts between coloured blocks.',
  Juggle: 'N sine-driven dots; count 1 gives the Sinelon case. Splice in Trails for tails.',
  RadialBurst: 'Rings bursting from the center.',
  Spiral: 'Rotating spiral arms.',
  Blobs: 'Metaballs — merging lava-lamp blobs.',
}
