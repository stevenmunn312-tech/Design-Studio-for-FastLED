import type { NodeDefinition } from '../types'
import { STUDIO_PALETTES } from './paletteCatalog'

export const NODE_LIBRARY: NodeDefinition[] = [
  // ── Inputs ─────────────────────────────────────────────────────────────
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
      threshold: 0.10,
      attack: 0.30,
      decay: 0.08,
      sampleRate: 44100,
      i2sWs: 39,
      i2sSck: 40,
      i2sSd: 41,
      channel: 'Left',
      // Firmware-only: print _audioBass/_audioMids/_audioTreble (+beat/bpm) to
      // the serial monitor ~10×/sec, for checking the mic wiring on-device.
      serialDebug: false,
    },
  },
  // ── Show pipeline source ───────────────────────────────────────────────
  {
    // Music source for the pre-planned show pipeline. Double-click on the canvas
    // opens the Music Library panel (drop MP3s, analyse, export).
    type: 'MusicLibrary',
    label: 'Music Library',
    category: 'show',
    inputs: [],
    outputs: [{ id: 'music', label: 'Music', dataType: 'music' }],
    defaultProperties: {},
  },
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
    defaultProperties: { bands: 24, gain: 1, smoothing: 0.72, tilt: 0 },
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
  {
    type: 'PercussionDetect',
    label: 'Percussion Detect',
    category: 'audio',
    inputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    outputs: [
      { id: 'kick', label: 'Kick', dataType: 'float' },
      { id: 'snare', label: 'Snare', dataType: 'float' },
      { id: 'hihat', label: 'Hi-Hat', dataType: 'float' },
    ],
    defaultProperties: { sensitivity: 0.55, decay: 0.72, separation: 0.4 },
  },
  {
    type: 'AudioFeatures',
    label: 'Audio Features',
    category: 'audio',
    inputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    outputs: [
      { id: 'vocals', label: 'Vocals', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'silence', label: 'Silence', dataType: 'bool' },
    ],
    defaultProperties: { sensitivity: 0.5, gate: 0.12, smoothing: 0.8 },
  },

  // ── Pattern ────────────────────────────────────────────────────────────
  {
    type: 'SolidColor',
    label: 'Solid Color',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { r: 255, g: 0, b: 128 },
  },
  {
    // Paints a horizontal run on one row over an optional base frame.
    type: 'Span',
    label: 'Bar',
    category: 'pattern',
    subcategory: 'Shapes & Text',
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
    subcategory: 'Shapes & Text',
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
    subcategory: 'Shapes & Text',
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
    subcategory: 'Shapes & Text',
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
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'base',  label: 'Base',  dataType: 'frame' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { x1: 0, y1: 0, x2: 15, y2: 15, r: 0, g: 200, b: 255 },
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
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { pathShape: 'circle', t: 0, scale: 0.8, thickness: 1.25, r: 255, g: 220, b: 80 },
  },
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
    outputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'field', label: 'Field', dataType: 'field' },
    ],
    defaultProperties: { noiseType: 'field', speed: 0.5, scale: 0.5, palette: 'rainbow' },
  },
  {
    type: 'Fire',
    label: 'Fire',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [{ id: 'intensity', label: 'Intensity', dataType: 'float' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { cooling: 55, sparking: 120 },
  },
  {
    type: 'Fire2012',
    label: 'Fire 2012',
    category: 'pattern',
    subcategory: 'Simulations',
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
  {
    type: 'Plasma',
    label: 'Plasma',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [{ id: 'speed', label: 'Speed', dataType: 'float' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5 },
  },
  {
    // FastLED fill_rainbow — a scrolling hue sweep; `deltaHue` sets the spread per LED.
    type: 'Rainbow',
    label: 'Rainbow',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [{ id: 'speed', label: 'Speed', dataType: 'float' }],
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
    ],
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
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, density: 0.5, palette: 'party' },
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
    ],
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
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.45, density: 0.45, fade: 0.28, palette: 'party' },
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
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, count: 4, fade: 0.22, palette: 'rainbow' },
  },
  {
    type: 'SpectrumBars',
    label: 'Spectrum Bars',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 0.6, palette: 'rainbow', mirror: true },
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
    // Perceptual gamma correction (FastLED napplyGamma_video) so gradients and
    // fades look right on the LEDs. gamma ≈ 2.2–2.8 for typical WS2812B strips.
    type: 'Gamma',
    label: 'Gamma',
    category: 'composite',
    inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
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
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { transform: 'rotate', rate: 90, angle: 0 },
  },

  // ── Audio-reactive patterns ─────────────────────────────────────────────
  {
    type: 'BassPulse',
    label: 'Bass Pulse',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
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
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, r: 255, g: 120, b: 32 },
  },
  {
    type: 'MidrangeWaves',
    label: 'Midrange Waves',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'ocean' },
  },
  {
    type: 'MidrangeBloom',
    label: 'Midrange Bloom',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'party' },
  },
  {
    type: 'TrebleSparks',
    label: 'Treble Sparks',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'density', label: 'Density', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { density: 0.5, r: 180, g: 220, b: 255 },
  },
  {
    type: 'TreblePrism',
    label: 'Treble Prism',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, r: 200, g: 120, b: 255 },
  },
  {
    type: 'AudioCascade',
    label: 'Audio Cascade',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'rainbow' },
  },
  {
    type: 'BeatFlash',
    label: 'Beat Flash',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'frame', label: 'Base', dataType: 'frame' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { decay: 0.85 },
  },
  {
    // Expanding shockwave rings spawned by kick/snare, textured with hihat grain.
    type: 'KickShock',
    label: 'Kick Shock',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'kick', label: 'Kick', dataType: 'float' },
      { id: 'snare', label: 'Snare', dataType: 'float' },
      { id: 'hihat', label: 'Hi-Hat', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'volcano' },
  },
  {
    // Vertical aurora-borealis curtains shaped by vocal presence; dims on silence.
    type: 'VocalAurora',
    label: 'Vocal Aurora',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'vocals', label: 'Vocals', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'silence', label: 'Silence', dataType: 'bool' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'aurora' },
  },
  {
    // Wedge-mirrored plasma that punches wider/spins harder on each beat.
    type: 'BeatKaleidoscope',
    label: 'Beat Kaleidoscope',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'hue', label: 'Hue', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { hue: 0, energy: 0.7, speed: 1.0, palette: 'ultraviolet' },
  },
  {
    // Tiled VU mosaic — bass/mids/treble sweep diagonally across the grid cells.
    type: 'SpectraMosaic',
    label: 'Spectra Mosaic',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'peacock', tiles: 4 },
  },
  {
    // Three-tier metaball blobs — kick/snare/hihat each spawn their own tier.
    type: 'PercussionBlobs',
    label: 'Percussion Blobs',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'kick', label: 'Kick', dataType: 'float' },
      { id: 'snare', label: 'Snare', dataType: 'float' },
      { id: 'hihat', label: 'Hi-Hat', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { palette: 'party' },
  },
  {
    // Bottom-up column fire (HeatColor ramp) — bass/mids/treble shape the columns.
    type: 'EmberPulse',
    label: 'Ember Pulse',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0 },
  },
  {
    // Radial bloom whose sample coordinates are pushed through noise turbulence.
    type: 'TurbulentBloom',
    label: 'Turbulent Bloom',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'deepsea' },
  },
  {
    // Gravitational-lensing rings — bass drives density, rings bunch near the well.
    type: 'GravityWell',
    label: 'Gravity Well',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, r: 80, g: 160, b: 255 },
  },
  {
    // A pool of expanding, fading ripples — one born on each trigger pulse.
    type: 'RainRipples',
    label: 'Rain Ripples',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'laguna' },
  },
  {
    // Oriented Gabor-noise shards that snap to a new angle on each hihat hit.
    type: 'PrismStorm',
    label: 'Prism Storm',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'hihat', label: 'Hi-Hat', dataType: 'float' },
      { id: 'energy', label: 'Energy', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 1.0, palette: 'amethyst' },
  },

  // ── More pattern nodes ─────────────────────────────────────────────────
  {
    type: 'Noise2D',
    label: 'Noise 2D',
    category: 'pattern',
    subcategory: 'Generative',
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
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'color', label: 'Color', dataType: 'color' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, r: 0, g: 200, b: 255 },
  },
  {
    type: 'Spiral',
    label: 'Spiral',
    category: 'pattern',
    subcategory: 'Generative',
    inputs: [{ id: 'speed', label: 'Speed', dataType: 'float' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, arms: 2 },
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
    subcategory: 'Simulations',
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
    // Feedback/trails buffer — persists its own output across frames, fading
    // by `decay` each tick and re-lightening wherever the incoming frame is
    // brighter (per-channel max). The canonical fadeToBlackBy()-and-accumulate
    // idiom, generalised to any upstream pattern (Circle, Blobs, Text, …).
    type: 'Trails',
    label: 'Trails',
    category: 'composite',
    inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { decay: 0.15 },
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
    type: 'GradientFrame',
    label: 'Gradient Frame',
    category: 'pattern',
    subcategory: 'Shapes & Text',
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
    subcategory: 'Palettes',
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
    subcategory: 'Palettes',
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
    category: 'signal',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    type: 'Cos',
    label: 'Cos',
    category: 'signal',
    inputs: [{ id: 'x', label: 'X', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    // Waveform oscillator over time: amplitude · wave(frequency·t + phase).
    type: 'Wave',
    label: 'Wave',
    category: 'signal',
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
    category: 'signal',
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
    // Easing curve on a 0–1 value — FastLED lib8tion (ease8/*wave8). `easeType`
    // selects the curve; the header reflects it. See PROPERTY_META.easeType.
    type: 'Ease',
    label: 'Ease',
    category: 'math',
    inputs: [{ id: 't', label: 'T (0–1)', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { easeType: 'inOutCubic' },
  },
  {
    // Metronome — emits a boolean pulse once every `interval` seconds (a non-audio
    // rhythmic trigger; the software analogue of FastLED's EVERY_N_MILLISECONDS).
    type: 'Interval',
    label: 'Interval',
    category: 'signal',
    inputs: [],
    outputs: [{ id: 'pulse', label: 'Pulse', dataType: 'bool' }],
    defaultProperties: { interval: 0.5 },
  },
  {
    // Trigger envelope — jumps to 1 on a rising edge of `trigger`, then decays
    // linearly to 0 over `decay` seconds (pipe through Ease for a curve). The
    // generic float analogue of BeatFlash: drive any knob from a beat/button.
    type: 'Envelope',
    label: 'Envelope',
    category: 'signal',
    inputs: [{ id: 'trigger', label: 'Trigger', dataType: 'bool' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { decay: 0.5 },
  },
  {
    type: 'TimeNode',
    label: 'Time',
    category: 'signal',
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
    category: 'signal',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    defaultProperties: { min: 0, max: 1 },
  },
  {
    type: 'Counter',
    label: 'Counter',
    category: 'signal',
    inputs: [{ id: 'rate', label: 'Rate', dataType: 'float' }],
    outputs: [{ id: 'value', label: 'Value 0–1', dataType: 'float' }],
    defaultProperties: { rate: 0.5 },
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
    // Low-pass smoothing — eases a jittery value (FFT bands, PotInput) toward
    // the input over a `response` time constant (seconds to ~63% of a step).
    // Fills the gap left by Lerp, which can't self-feed (the cycle guard
    // breaks feedback loops by design).
    type: 'Smooth',
    label: 'Smooth',
    category: 'math',
    inputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { response: 0.25 },
  },
  {
    // Sample & hold — latches `value` on each rising edge of `trigger`
    // (initialised to the first value seen). Random → SampleHold ← BeatDetect
    // is the "new random value every beat" idiom.
    type: 'SampleHold',
    label: 'Sample & Hold',
    category: 'math',
    inputs: [
      { id: 'value', label: 'Value', dataType: 'float' },
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: {},
  },
  {
    // A/B selector — outputs A when `sel` is false, B when true (unlike Gate,
    // both branches are live signals). FrameSwitch is the frame counterpart.
    type: 'Switch',
    label: 'Switch',
    category: 'math',
    inputs: [
      { id: 'a', label: 'A', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
      { id: 'sel', label: 'Select', dataType: 'bool' },
    ],
    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
    defaultProperties: { a: 0, b: 1 },
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
    label: 'Compare',
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
    subcategory: 'Colors',
    inputs: [
      { id: 'h', label: 'H (0–360)', dataType: 'float' },
      { id: 's', label: 'S (0–1)', dataType: 'float' },
      { id: 'v', label: 'V (0–1)', dataType: 'float' },
    ],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { h: 0, s: 1, v: 1 },
  },
  {
    // The inverse of HSV → RGB — extracts hue/sat/val from a connected color
    // (e.g. to read the hue out of a sampled palette color or a PaletteSampler).
    type: 'RGBToHSV',
    label: 'RGB → HSV',
    category: 'color',
    subcategory: 'Colors',
    inputs: [{ id: 'rgb', label: 'Color', dataType: 'color' }],
    outputs: [
      { id: 'h', label: 'H (0–360)', dataType: 'float' },
      { id: 's', label: 'S (0–1)', dataType: 'float' },
      { id: 'v', label: 'V (0–1)', dataType: 'float' },
    ],
    defaultProperties: {},
  },
  {
    // Black-body white point from a colour temperature in Kelvin.
    type: 'Temperature',
    label: 'Color Temperature',
    category: 'color',
    subcategory: 'Colors',
    inputs: [{ id: 'kelvin', label: 'Kelvin', dataType: 'float' }],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { kelvin: 4000 },
  },
  {
    // FastLED HeatColor — a 0–1 heat value → black-body ramp (black→red→yellow→white).
    type: 'HeatColor',
    label: 'Heat Color',
    category: 'color',
    subcategory: 'Colors',
    inputs: [{ id: 'heat', label: 'Heat', dataType: 'float' }],
    outputs: [{ id: 'color', label: 'Color', dataType: 'color' }],
    defaultProperties: { heat: 0.5 },
  },
  {
    type: 'BlendColors',
    label: 'Blend Colors',
    category: 'color',
    subcategory: 'Colors',
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
    subcategory: 'Colors',
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
    subcategory: 'Palettes',
    inputs: [],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { palette: 'rainbow' },
  },
  {
    // Builds a palette from up to four connected colors (in order).
    type: 'CustomPalette',
    label: 'Custom Palette',
    category: 'color',
    subcategory: 'Palettes',
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
    // Polar-interpolated palette between two or three anchor colours (poline).
    type: 'Poline',
    label: 'Poline Palette',
    category: 'color',
    subcategory: 'Palettes',
    inputs: [
      { id: 'colorA', label: 'Anchor A', dataType: 'color' },
      { id: 'colorB', label: 'Anchor B', dataType: 'color' },
      { id: 'colorC', label: 'Anchor C', dataType: 'color' },
    ],
    outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
    defaultProperties: { anchorA: '#1020ff', anchorB: '#ff20a0', anchorC: '#20ffd0', points: 4, position: 'sinusoidal' },
  },
  {
    type: 'PaletteBlend',
    label: 'Blend Palettes',
    category: 'color',
    subcategory: 'Palettes',
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
    category: 'signal',
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
    subcategory: 'Generative',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.25, scale: 0.3, octaves: 4, palette: 'forest' },
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
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.33, scale: 0.7, frequency: 1.2, orientation: 45, palette: 'ocean' },
  },
  {
    // Angled palette gradient across the matrix.
    type: 'PaletteGradient',
    label: 'Palette Gradient',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [
      { id: 'speed', label: 'Scroll', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { angle: 45, repeat: 1, speed: 0, palette: 'rainbow' },
  },
  {
    // Uploaded image with placement, sampling, alpha, and crop controls.
    type: 'Image',
    label: 'Image',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
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
    },
  },
  {
    // Multi-frame GIF/APNG/WebP baked into firmware with source timing.
    type: 'AnimatedImage',
    label: 'Animated Image',
    category: 'pattern',
    subcategory: 'Shapes & Text',
    inputs: [],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      fit: 'stretch', positionX: 0.5, positionY: 0.5, rotation: '0', flipX: false, flipY: false,
      sampling: 'nearest', brightness: 1, background: '#000000', zoom: 1, cropX: 0.5, cropY: 0.5,
      saturation: 1, contrast: 1, hueShift: 0, monochrome: false, gamma: 1,
      paletteLevels: 'full', dithering: 'none', playbackRate: 1, loop: true,
    },
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
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.3, scale: 0.44, count: 3, palette: 'lava' },
  },
  {
    // Flow field — particles drift along a noise direction field, leaving trails.
    type: 'FlowField',
    label: 'Flow Field',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'scale', label: 'Scale', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.67, scale: 0.08, count: 80, fade: 0.9, palette: 'ocean' },
  },
  {
    // Warp starfield — stars streak outward from the centre.
    type: 'Starfield',
    label: 'Starfield',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.33, count: 60, r: 255, g: 255, b: 255 },
  },
  {
    // Audio-reactive flowing noise field (bass/mids/treble drive it).
    type: 'AudioFlow',
    label: 'Audio Flow',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
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
    subcategory: 'Simulations',
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
    subcategory: 'Simulations',
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
    category: 'show',
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

  // ── Show Engine — the generative show engine (Phase 3) ─────────────────
  {
    // Runs a random show from a Pattern Collection: holds a random pattern for
    // a random dwell (minTime…maxTime), then transitions (a random style from
    // the chosen pool) into another. A wired `beat` advances early (after
    // minTime). See docs/development/design/generative-pattern-show.md.
    type: 'PatternMaster',
    label: 'Show Engine',
    category: 'show',
    inputs: [
      { id: 'patternset',  label: 'Patterns',    dataType: 'patternset' },
      { id: 'audio',       label: 'Audio',       dataType: 'audio' },
      { id: 'transitions', label: 'Transitions', dataType: 'transitionset' },
      { id: 'beat',        label: 'Beat',        dataType: 'bool' },
    ],
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      minTime: 4, maxTime: 12, transitionSec: 1,
      // Transition styles come from a wired TransitionSet; unwired ⇒ crossfade.
      // Beat-triggered particle overlay (needs a wired beat). Off by default.
      particles: false, particleStyle: 0, particleHue: 24, particleIntensity: 0.8,
    },
  },
  {
    // Timeline-as-a-node: cycles its inputs with a timed crossfade.
    type: 'Sequencer',
    label: 'Sequencer',
    category: 'show',
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
    // (it leaves the canvas). Outputs a `patternset` for the Show Engine.
    // See docs/development/design/generative-pattern-show.md.
    type: 'PatternCollection',
    label: 'Pattern Collection',
    category: 'show',
    inputs: [{ id: 'pattern', label: 'Pattern', dataType: 'frame' }],
    outputs: [{ id: 'patternset', label: 'Patterns', dataType: 'patternset' }],
    defaultProperties: { patternIds: [], patternSections: {} },
  },
  {
    // A pool of extra transition styles (toggled via the chip grid, same
    // catalogue as the Transition node) for a Performance Generator's
    // `transitions` input — when wired, generateShow mixes these into its
    // rule-based crossfade/wipe/dissolve picks instead of only ever using those three.
    type: 'TransitionSet',
    label: 'Transitions',
    category: 'show',
    inputs: [],
    outputs: [{ id: 'transitions', label: 'Transitions', dataType: 'transitionset' }],
    defaultProperties: { transitions: [] },
  },

  // ── Custom Formula ────────────────────────────────────────────────────
  {
    type: 'CustomFormula',
    label: 'Custom Formula',
    category: 'pattern',
    subcategory: 'Code',
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
    subcategory: 'Code',
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
    ],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { speed: 0.25, scale: 0.3, octaves: 4 },
  },
  {
    // Damped ripple simulation on a scalar field. A rising-edge trigger injects
    // a new splash, so BeatDetect or a button can kick the water.
    type: 'WaveSim',
    label: 'Wave Sim',
    category: 'field',
    inputs: [{ id: 'trigger', label: 'Trigger', dataType: 'bool' }],
    outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
    defaultProperties: { speed: 4, damping: 0.985, impulse: 1 },
  },
  {
    type: 'FieldToFrame',
    label: 'Field → Frame',
    category: 'field',
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
    category: 'field',
    inputs: [
      { id: 'px', label: 'X', dataType: 'float' },
      { id: 'py', label: 'Y', dataType: 'float' },
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
    type: 'FieldWarp',
    label: 'Field Warp',
    category: 'field',
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
    category: 'field',
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
    category: 'field',
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
      // Optional: wire an SD Card node here to bundle music/show files onto the card
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
      // Clock pin for SPI (clocked) chipsets — APA102/APA102HD/WS2801/HD108.
      // Ignored (editor disabled) for clockless chipsets.
      clockPin: 6,
      serpentine: false,
      // Render the graph at 2× the matrix resolution and average each 2×2 block
      // down to one physical LED (FastLED-style downscale) — antialiases moving
      // shapes on small panels at ~4× the render cost. Preview + normal sketch.
      supersample: false,
      // FastLED.setBrightness — the global master dim (0–255; also applied to
      // the live preview so preview matches firmware).
      brightness: 200,
      // FastLED.setCorrection colour-correction profile ('none' = uncorrected).
      correction: 'none',
      // FastLED temporal dithering (recovers colour depth at low brightness);
      // on is FastLED's own default, off emits setDither(DISABLE_DITHER).
      dither: true,
      // Clockless-chipset overclock multiplier; >1 emits
      // `#define FASTLED_OVERCLOCK <x>` (WS2812 tolerates up to ~1.25 typically).
      overclock: 1,
      // Optional PSU power cap (FastLED.setMaxPowerInVoltsAndMilliamps) — when on,
      // FastLED auto-dims to keep total draw under volts × milliamps.
      powerLimit: false,
      volts: 5,
      milliamps: 2000,
      // Place per-node render buffers in external PSRAM (ESP32 family). These
      // are rendered by MatrixOutputUpload (not the generic property list)
      // because visibility depends on the *selected board* supporting PSRAM;
      // `psramMode` holds the board's PsramOption id (OPI vs QSPI on the S3).
      usePsram: false,
      psramMode: 'opi',
    },
  },

  // ── Inputs ─────────────────────────────────────────────────────────────
  {
    type: 'ButtonInput',
    label: 'Button',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'pressed', label: 'Pressed', dataType: 'bool' }],
    defaultProperties: { pin: 0, pullup: true },
  },
  {
    type: 'PotInput',
    label: 'Potentiometer',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    defaultProperties: { pin: 34 },
  },
  {
    // Rotary encoder (e.g. KY-040) — polling quadrature decode (no interrupts,
    // matching ButtonInput/PotInput's plain digitalRead/analogRead approach).
    // `position` is an unbounded running count; wire through MapRange/Mod to
    // normalise or wrap it.
    type: 'EncoderInput',
    label: 'Encoder',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'position', label: 'Position', dataType: 'float' },
      { id: 'pressed', label: 'Pressed', dataType: 'bool' },
    ],
    defaultProperties: { pinA: 32, pinB: 33, pinSW: 25, pullup: true },
  },

  // ── Music-sync pipeline (the Music Library source lives in Show) ───────
  {
    type: 'PerformanceGenerator',
    label: 'Performance Generator',
    category: 'show',
    inputs: [
      { id: 'music', label: 'Music', dataType: 'music' },
      { id: 'transitions', label: 'Transitions', dataType: 'transitionset' },
      { id: 'patternset', label: 'Patterns', dataType: 'patternset' },
    ],
    outputs: [
      { id: 'shows', label: 'Shows', dataType: 'shows' },
      { id: 'frame', label: 'Frame', dataType: 'frame' },
    ],
    defaultProperties: {
      beatIntensity:      0.8,
      energySensitivity:  0.7,
      transitionDuration: 0.5,
      patternHold:        10,
      paletteMode:        'mood',
      fixedPalette:       'rainbow',
      useGroupInputs:     false,
    },
  },
  {
    // The SD card + audio-output module. Holds only the SD/I2S pin config (the
    // LED matrix config comes from the MatrixOutput node it connects to); its
    // `sdcard` output plugs into MatrixOutput's `sdcard` input to enable the
    // write-music-to-SD-then-flash upload flow.
    type: 'SDCard',
    label: 'SD Card',
    category: 'show',
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
// Library defaults by node type (empty for programmatically minted types like
// Group/GroupInput). Lets the node renderer backfill properties that were
// added to the library *after* a node was saved, so old graphs surface new
// controls instead of hiding them until the node is recreated.
const DEFAULTS_BY_TYPE = new Map(NODE_LIBRARY.map((n) => [n.type, n.defaultProperties ?? {}]))
export function libraryDefaults(nodeType: string): Record<string, unknown> {
  return DEFAULTS_BY_TYPE.get(nodeType) ?? {}
}

export const NODE_DESCRIPTIONS: Record<string, string> = {
  // audio
  FFTAnalyzer: 'Splits mic audio into bass/mids/treble; tilt boosts weak treble.',
  BeatDetect: 'Emits a beat pulse and estimated BPM from audio.',
  PercussionDetect: 'Heuristic kick, snare, and hi-hat envelopes from audio.',
  AudioFeatures: 'Heuristic vocals, energy, and silence features from audio.',
  MicInput: 'Microphone — optional AGC, preview gate, and INMP441 I2S firmware.',
  AudioHue: 'Maps bass/mids/treble to a hue value.',
  // hardware
  ButtonInput: 'Reads a hardware button as a boolean.',
  PotInput: 'Reads a potentiometer as a 0–1 value.',
  EncoderInput: 'Reads a rotary encoder — running position plus its push-button.',
  MusicLibrary: 'Music source — double-click to drop tracks, analyse and export.',
  PerformanceGenerator: 'Converts analysed music into timed LED show files.',
  SDCard: 'SD + audio pins; connect to Matrix Output to load music/show files on upload.',
  // math
  Math: 'Binary math — add, subtract, multiply, divide, min or max (a op b).',
  Clamp: 'Constrains a value between min and max.',
  MapRange: 'Remaps a value from one range to another.',
  Sin: 'Sine of the input (×2π).',
  Cos: 'Cosine of the input (×2π).',
  Wave: 'Oscillator — sine, triangle, square or sawtooth over time.',
  ComplexWave: 'Combines two waves (add, multiply, average, min/max, difference).',
  Lerp: 'Linear interpolation between a and b by t.',
  Ease: 'Easing curve on a 0–1 value — cubic, quad, or tri/quad/cubic waves.',
  Interval: 'Metronome — pulses true every N seconds (EVERY_N_MILLISECONDS).',
  TimeNode: 'Elapsed time in seconds, plus a frame delta.',
  Abs: 'Absolute value.',
  Mod: 'Modulo — x wrapped into [0, m).',
  Random: 'Random value in a range.',
  Counter: 'Ramps 0→1 over time at a set rate.',
  Gate: 'Passes a value when a boolean is true, else a fallback.',
  Smooth: 'Low-pass — eases a jittery value in over a response time.',
  SampleHold: 'Latches the value each time the trigger pulses true.',
  Switch: 'Outputs A or B, selected by a boolean.',
  Envelope: 'Jumps to 1 on a trigger, then decays to 0 over the decay time.',
  Not: 'Logical NOT of a boolean.',
  Compare: 'True when a > b.',
  BeatSin: 'FastLED beatsin8 — oscillates low↔high at a BPM.',
  XYMapper: 'Converts (x, y) to a strip index.',
  // color
  GradientSampler: 'Samples a two-color gradient at t.',
  PaletteSampler: 'Samples a palette at t to a color.',
  HSVToRGB: 'Converts hue/sat/val to an RGB color.',
  RGBToHSV: 'Converts an RGB color to hue/sat/val.',
  BlendColors: 'Blends two colors by an amount.',
  CHSV: 'FastLED CHSV color (0–255 hue/sat/val).',
  Temperature: 'White point from a colour temperature in Kelvin (warm→cool).',
  HeatColor: 'FastLED HeatColor — a 0–1 heat value to a fire-ramp colour.',
  PaletteSelector: 'Outputs a named preset palette.',
  CustomPalette: 'Builds a palette from up to four colors.',
  Poline: 'Smooth poline palette between up to three anchor colours.',
  PaletteBlend: 'Interpolates between two palettes.',
  // pattern
  SolidColor: 'Fills the matrix with one color.',
  Span: 'Lights a horizontal run on one row.',
  Rect: 'Draws a filled rectangle.',
  Circle: 'Draws a circle — ring or filled disc.',
  Line: 'Draws a line between two points.',
  Path: 'Traces a parametric curve point with subpixel splatting.',
  Text: 'Renders scrolling text in a bitmap font.',
  Noise: 'Bundled noise variants with frame and raw field outputs.',
  Fire: 'Classic rising fire effect.',
  Fire2012: 'FastLED Fire2012 heat simulation.',
  Plasma: 'Animated plasma interference pattern.',
  Rainbow: 'FastLED fill_rainbow — a scrolling hue sweep across the matrix.',
  Pride2015: 'Shifting rainbow with a breathing brightness wave.',
  Pacifica: 'Layered ocean waves through a palette, with whitecap sparkle.',
  TwinkleFox: 'Palette-driven lights that twinkle on independent schedules.',
  Scanner: 'Larson scanner / Cylon eye — a palette beam with adjustable width and fade.',
  Confetti: 'Random fading palette speckles on a persistent frame buffer.',
  Juggle: 'N sine-driven dots with trails; count 1 gives the Sinelon case.',
  SpectrumBars: 'Palette-driven equalizer bars with audio-reactive motion.',
  BassPulse: 'Pulses a color with bass energy.',
  BassRings: 'Concentric rings that swell and brighten with bass.',
  MidrangeWaves: 'Waves driven by midrange audio.',
  MidrangeBloom: 'Blooming palette contours driven by midrange energy.',
  TrebleSparks: 'Glittering treble sparks with a tintable color input.',
  TreblePrism: 'Sharp diagonal prisms that shimmer with treble energy.',
  AudioCascade: 'Full-spectrum ribbons with bass glow, mids flow, and treble shimmer.',
  BeatFlash: 'Flashes the frame white on each beat.',
  KickShock: 'Expanding shockwave rings triggered by kick and snare, with hi-hat grain.',
  VocalAurora: 'Vertical aurora curtains shaped by vocals; dims to black on silence.',
  BeatKaleidoscope: 'Wedge-mirrored plasma that snaps wider and spins on every beat.',
  SpectraMosaic: 'Tiled mosaic grid — bass, mids, and treble sweep diagonally across it.',
  PercussionBlobs: 'Three-tier metaball blobs — kick, snare, and hi-hat each spawn their own.',
  EmberPulse: 'Bottom-up column fire — bass, mids, and treble drive heat by column.',
  TurbulentBloom: 'Radial bloom warped by noise turbulence — treble adds fine jitter.',
  GravityWell: 'Gravitational-lensing rings that bunch up as they near the drifting well.',
  RainRipples: 'A pool of expanding, fading ripples — one born on each trigger pulse.',
  PrismStorm: 'Oriented shard noise that snaps to a new angle on every hi-hat hit.',
  Noise2D: 'Layered 2D sine noise.',
  RadialBurst: 'Rings bursting from the center.',
  Spiral: 'Rotating spiral arms.',
  Kaleidoscope: 'Mirrors a frame into kaleidoscope symmetry.',
  Particles: 'Twenty particle displays: weather, trails, flocking, orbits, and more.',
  GradientFrame: 'Two-color linear gradient fill.',
  FractalNoise: 'Fractal (fBm) noise — summed octaves, cloud-like.',
  Blobs: 'Metaballs — merging lava-lamp blobs.',
  GaborNoise: 'Gabor noise — oriented bands via sparse convolution.',
  PaletteGradient: 'Palette gradient across the matrix at any angle.',
  Image: 'Uploaded image with fit, crop, colour, dithering and alpha controls.',
  AnimatedImage: 'GIF, APNG or WebP animation with source timing and Image controls.',
  FlowField: 'Particles drifting along a noise flow field, with trails.',
  Starfield: 'Warp starfield — stars streak outward from the centre.',
  AudioFlow: 'Audio-reactive flowing noise field.',
  ReactionDiffusion: 'Gray-Scott reaction-diffusion — organic spots & stripes.',
  GameOfLife: 'Conway’s Game of Life with fading trails.',
  PatternMaster: 'Random pattern/transition show from a Pattern Collection.',
  CustomFormula: 'Per-pixel JS expression f(x, y, t) — with cx/cy/r/angle and FastLED shims.',
  Code: 'Paste raw FastLED C++ that writes into leds[].',
  FieldFormula: 'Per-pixel scalar field from an expression (cx/cy/r/angle, sin8/beatsin8…).',
  FieldNoise: 'Organic fBm noise as a scalar field (same construction as Fractal Noise).',
  WaveSim: 'Damped 2D ripple simulation as a scalar field, with triggerable splashes.',
  FieldToFrame: 'Maps a scalar field through a palette to a frame.',
  DistanceField: 'Scalar field of distance from each pixel to a movable point.',
  FrameToField: 'Extracts a brightness field from a rendered frame.',
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
  Gamma: 'Perceptual gamma correction so gradients look right on the LEDs.',
  Transform: 'Animated rotate, scale or translate of a frame.',
  Invert: 'Inverts colors.',
  Saturation: 'Scales color saturation (0 = greyscale, 1 = unchanged).',
  ColorBoost: 'Boosts saturation while approximately preserving luminance.',
  FrameSwitch: 'Shows frame A or B, selected by a boolean.',
  Trails: 'Fades the previous frame and re-lightens where the input is brighter.',
  Transition: 'Transitions A→B — 16 styles: wipe, iris, push, blinds, spiral, zoom + more.',
  Sequencer: 'Crossfades through its inputs on a timer.',
  PatternCollection: 'Absorbs pattern groups into a set for the Show Engine.',
  TransitionSet: 'A pool of transition styles for the Show Engine / Performance Generator.',
  // output
  MatrixOutput: 'The LED matrix output — board, pin, and size.',
}

// Single source of truth for category display order, labels, and accent colors.
// `color` is the literal hex used in canvas/SVG contexts (minimap, edges); the
// CSS var is used wherever theming should apply.
// Order here drives the sidebar grouping order, following the authoring
// pipeline: live inputs → audio analysis → control signals → value transforms
// → color → frame generators → fields → frame effects → the show pipeline →
// output. (`composite` keeps its historical id but displays as "Effects".)
// Accent hues sweep the wheel in display order — 36° per category starting at
// red, all hsl(h, 100%, 60%) — so the sidebar reads as a rainbow ramp.
export const CATEGORIES = [
  { id: 'input',     label: 'Inputs',       accentVar: '--accent-input',     color: '#ff3333' },
  { id: 'audio',     label: 'Audio',        accentVar: '--accent-audio',     color: '#ff9933' },
  { id: 'signal',    label: 'Signals',      accentVar: '--accent-signal',    color: '#ccff33' },
  { id: 'math',      label: 'Math & Logic', accentVar: '--accent-math',      color: '#66ff33' },
  { id: 'color',     label: 'Color',        accentVar: '--accent-color',     color: '#33ff99' },
  { id: 'pattern',   label: 'Patterns',     accentVar: '--accent-pattern',   color: '#33ffff' },
  { id: 'field',     label: 'Fields',       accentVar: '--accent-field',     color: '#3385ff' },
  { id: 'composite', label: 'Effects',      accentVar: '--accent-composite', color: '#5c33ff' },
  { id: 'show',      label: 'Show',         accentVar: '--accent-show',      color: '#d633ff' },
  { id: 'output',    label: 'Output',       accentVar: '--accent-output',    color: '#ff33ad' },
] as const

// Ordered sub-headings shown inside a category's sidebar section. A category
// without an entry renders flat. Every node in a listed category should carry
// a `subcategory` matching one of these labels.
export const SUBCATEGORY_ORDER: Record<string, readonly string[]> = {
  color:   ['Colors', 'Palettes'],
  pattern: ['Shapes & Text', 'Generative', 'Simulations', 'Audio-Reactive', 'Code'],
}

// Explicit workflow ordering for categories where the pipeline sequence
// matters more than the library's declaration order (fields compose toward
// Field → Frame; the show category reads top-to-bottom like the show flow).
const CATEGORY_NODE_ORDER: Record<string, readonly string[]> = {
  signal: ['TimeNode', 'Interval', 'Counter', 'Random', 'Envelope', 'Sin', 'Cos', 'Wave', 'ComplexWave', 'BeatSin'],
  field:  ['FieldFormula', 'FieldNoise', 'WaveSim', 'DistanceField', 'FrameToField', 'FieldMath', 'FieldWarp', 'FieldRotate', 'FieldTile', 'FieldToFrame'],
  show:   ['MusicLibrary', 'PatternCollection', 'TransitionSet', 'PatternMaster', 'Sequencer', 'Transition', 'PerformanceGenerator', 'SDCard'],
}

/**
 * The nodes of one category in sidebar display order: grouped by subcategory
 * (per SUBCATEGORY_ORDER), then by CATEGORY_NODE_ORDER where defined, else by
 * library declaration order.
 */
export function categoryNodes(categoryId: string): NodeDefinition[] {
  const nodes = NODE_LIBRARY.filter((n) => n.category === categoryId)
  const subs = SUBCATEGORY_ORDER[categoryId]
  const explicit = CATEGORY_NODE_ORDER[categoryId]
  if (!subs && !explicit) return nodes
  const subIndex = (n: NodeDefinition) => {
    const i = subs?.indexOf(n.subcategory ?? '') ?? -1
    return i === -1 ? subs?.length ?? 0 : i
  }
  const nodeIndex = (n: NodeDefinition) => {
    const i = explicit?.indexOf(n.type) ?? -1
    return i === -1 ? explicit?.length ?? 0 : i
  }
  // Array.sort is stable, so untouched ties keep library order.
  return [...nodes].sort((a, b) => subIndex(a) - subIndex(b) || nodeIndex(a) - nodeIndex(b))
}

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
  music: '#ffb74d',
  shows: '#ffa726',
  sdcard: '#ffa500',
  patternset: '#00e0a4',
  transitionset: '#b388ff',
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

/** Named palettes a `palette` property can select. */
export const PALETTES = STUDIO_PALETTES

// ── MatrixOutput hardware options ────────────────────────────────────────────
// Single source for the chipset/correction dropdowns AND the codegen's
// sanitisation (chipset strings are interpolated into C++ template args, so
// cppGenerator only emits values from these lists). 'SK6812-RGBW' is the one
// non-literal entry: codegen maps it to `SK6812` + `.setRgbw(RgbwDefault())`.
export const CHIPSET_OPTIONS = [
  'WS2812B', 'WS2811', 'WS2815', 'SK6812', 'SK6812-RGBW', 'WS2816', 'SM16824E',
  'NEOPIXEL', 'APA102', 'APA102HD', 'WS2801', 'HD108',
] as const

/** SPI (clocked) chipsets — need a `clockPin` alongside the data pin, and the
 *  FASTLED_OVERCLOCK define doesn't apply to them. */
export const SPI_CHIPSETS: ReadonlySet<string> = new Set(['APA102', 'APA102HD', 'WS2801', 'HD108'])

export const COLOR_ORDER_OPTIONS = ['GRB', 'RGB', 'BGR', 'BRG', 'GBR', 'RBG'] as const

/** FastLED.setCorrection profiles ('none' = leave colours uncorrected). */
export const CORRECTION_OPTIONS = ['none', 'TypicalLEDStrip', 'TypicalPixelString'] as const

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
  pathShape:  { control: 'select', options: ['circle', 'heart', 'lissajous', 'rose'] },
  operation:  { control: 'select', options: ['add', 'multiply', 'average', 'min', 'max', 'difference'] },
  transform:  { control: 'select', options: ['rotate', 'scale', 'translate'] },
  // Bundled-node selectors — each picks a variant; keep in sync with the
  // matching case in graphEvaluator.ts and cppGenerator.ts.
  noiseType:      { control: 'select', options: ['field', 'simplex', 'noise3d', 'noise4d', 'worley', 'plasma'] },
  mathOp:         { control: 'select', options: ['add', 'subtract', 'multiply', 'divide', 'min', 'max'] },
  transitionType: { control: 'select', options: [
    'crossfade', 'wipe', 'dissolve', 'iris', 'clockwipe', 'push', 'checkerboard',
    'diagonal', 'fadeblack', 'fadewhite', 'blinds', 'ripple', 'spiral', 'curtain',
    'scanlines', 'zoom',
  ] },
  blendMode:      { control: 'select', options: ['normal', 'multiply', 'screen', 'overlay', 'add', 'difference'] },
  easeType:       { control: 'select', options: ['inOutCubic', 'inOutQuad', 'triwave', 'quadwave', 'cubicwave'] },
  fieldOp:        { control: 'select', options: ['add', 'subtract', 'multiply', 'mix', 'min', 'max', 'difference'] },
  particleType:   { control: 'select', options: [
    'fountain', 'gravity', 'fireworks', 'sparkle', 'comet', 'snow', 'swarm',
    'rain', 'embers', 'bubbles', 'vortex', 'orbit', 'confetti', 'fireflies',
    'meteor', 'tornado', 'pinwheel', 'bounce', 'attractor', 'waterfall',
  ] },
  channel:        { control: 'select', options: ['Left', 'Right'] },
  // Poline position functions — keep in sync with polinePalette.ts POSITION_FNS.
  position:   { control: 'select', options: ['linear', 'sinusoidal', 'quadratic', 'cubic', 'arc', 'smoothStep', 'exponential'] },
  points:     { control: 'slider', min: 1, max: 12, step: 1 },
  chipset:    { control: 'select', options: CHIPSET_OPTIONS },
  colorOrder: { control: 'select', options: COLOR_ORDER_OPTIONS },
  correction: { control: 'select', options: CORRECTION_OPTIONS },
  overclock:  { control: 'slider', min: 1, max: 1.7, step: 0.05 },

  // Bounded numeric ranges → slider
  speed:    { control: 'slider', min: 0, max: 5, step: 0.1 },
  scale:    { control: 'slider', min: 0, max: 2, step: 0.01 },
  fade:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  thickness:{ control: 'slider', min: 0.5, max: 4, step: 0.05 },
  // Opacity / mix amount, normalised 0–1 (scaled to FastLED's 0–255 in the
  // evaluator + codegen). Shared by Blend / Blur2D / PaletteBlend.
  amount:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  t:        { control: 'slider', min: 0, max: 1, step: 0.01 },
  mix:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  bass:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  mids:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  treble:   { control: 'slider', min: 0, max: 1, step: 0.01 },
  kick:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  snare:    { control: 'slider', min: 0, max: 1, step: 0.01 },
  hihat:    { control: 'slider', min: 0, max: 1, step: 0.01 },
  vocals:   { control: 'slider', min: 0, max: 1, step: 0.01 },
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
  // Smooth's time constant (seconds to ~63% of a step; 0 = passthrough).
  response: { control: 'slider', min: 0, max: 2, step: 0.01 },
  kelvin:   { control: 'slider', min: 1000, max: 12000, step: 100 },
  // HeatColor input, Rainbow spread, Gamma exponent, and MatrixOutput power cap.
  heat:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  deltaHue: { control: 'slider', min: 0, max: 32, step: 1 },
  gamma:    { control: 'slider', min: 1, max: 3.5, step: 0.1 },
  volts:    { control: 'slider', min: 3, max: 24, step: 1 },
  milliamps:{ control: 'slider', min: 100, max: 20000, step: 100 },
  // Show Engine timing.
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
  sensitivity:{ control: 'slider', min: 0, max: 1, step: 0.01 },
  separation: { control: 'slider', min: 0, max: 1, step: 0.01 },
  gate:       { control: 'slider', min: 0, max: 1, step: 0.01 },
  density:    { control: 'slider', min: 0, max: 1, step: 0.01 },
  // Audio-reactivity amount on the spectral pattern nodes (was `intensity`).
  energy:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  brightness: { control: 'slider', min: 0, max: 1, step: 0.01 },
  boost:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  // Show Engine beat-triggered particle overlay (style 0–10, hue 0–255).
  particleStyle:     { control: 'slider', min: 0, max: 10, step: 1 },
  particleHue:       { control: 'slider', min: 0, max: 255, step: 1 },
  particleIntensity: { control: 'slider', min: 0, max: 1, step: 0.01 },
  s:          { control: 'slider', min: 0, max: 1, step: 0.01 },
  v:          { control: 'slider', min: 0, max: 1, step: 0.01 },
  // 0–255 byte ranges (FastLED heat sim + CHSV channels).
  cooling:    { control: 'slider', min: 0, max: 255, step: 1 },
  sparking:   { control: 'slider', min: 0, max: 255, step: 1 },
  hue:        { control: 'slider', min: 0, max: 255, step: 1 },
  sat:        { control: 'slider', min: 0, max: 255, step: 1 },
  val:        { control: 'slider', min: 0, max: 255, step: 1 },
}

// A normalised 0–1 slider, the standard for `speed`/`scale` and most reactive
// controls. The evaluator/codegen map these onto each node's internal rate (see
// speedRange.ts), so the slider is uniform even where the underlying range
// differs.
const N01: PropertyControl = { control: 'slider', min: 0, max: 1, step: 0.01 }

// Per-node overrides for property names that collide across nodes with a
// different meaning or range. Most `speed`/`scale` sliders are 0–1 (normalised
// via speedRange.ts); the simulation patterns use a steps-per-second rate, and
// `rate` is a 0–1 emission rate for Particles but a degrees/sec spin for Transform.
export const PROPERTY_META_OVERRIDES: Record<string, Record<string, PropertyControl>> = {
  FFTAnalyzer:       {
    bands:     { control: 'slider', min: 8, max: 32, step: 1 },
    gain:      { control: 'slider', min: 0.25, max: 4, step: 0.05 },
    smoothing: { control: 'slider', min: 0, max: 0.95, step: 0.01 },
    tilt:      { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  PerformanceGenerator: {
    beatIntensity:      { control: 'slider', min: 0, max: 1, step: 0.05 },
    energySensitivity:  { control: 'slider', min: 0, max: 1, step: 0.05 },
    transitionDuration: { control: 'slider', min: 0.1, max: 3, step: 0.1 },
    patternHold:        { control: 'slider', min: 1, max: 30, step: 1 },
    paletteMode:        { control: 'select', options: ['mood', 'cycle', 'fixed'] },
    fixedPalette:       { control: 'select', options: STUDIO_PALETTES },
  },
  // Envelope's decay is a duration in seconds, not the shared 0–1 rate.
  Envelope: {
    decay: { control: 'slider', min: 0.05, max: 5, step: 0.05 },
  },
  // MatrixOutput's brightness is FastLED.setBrightness's native 0–255 (the
  // shared `brightness` meta is a 0–1 frame-level scale).
  MatrixOutput: {
    brightness: { control: 'slider', min: 0, max: 255, step: 1 },
  },
  // Saturation's amount is 0–2 (1 = unchanged), not the shared 0–1 opacity.
  Saturation: {
    amount: { control: 'slider', min: 0, max: 2, step: 0.01 },
  },
  BeatDetect: {
    threshold: { control: 'slider', min: 0, max: 1, step: 0.01 },
    attack:    { control: 'slider', min: 0, max: 1, step: 0.01 },
    decay:     { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  PercussionDetect: {
    sensitivity: { control: 'slider', min: 0, max: 1, step: 0.01 },
    decay:       { control: 'slider', min: 0, max: 1, step: 0.01 },
    separation:  { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  AudioFeatures: {
    sensitivity: { control: 'slider', min: 0, max: 1, step: 0.01 },
    gate:        { control: 'slider', min: 0, max: 1, step: 0.01 },
    smoothing:   { control: 'slider', min: 0, max: 0.95, step: 0.01 },
  },
  AudioFlow: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
    scale: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  MidrangeWaves: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  SpectrumBars: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  MidrangeBloom: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  BassRings: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  TreblePrism: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  AudioCascade: {
    speed: { control: 'slider', min: 0, max: 1, step: 0.01 },
  },
  KickShock:        { speed: N01 },
  VocalAurora:      { speed: N01 },
  PercussionBlobs:  {},
  EmberPulse:       { speed: N01 },
  TurbulentBloom:   { speed: N01 },
  GravityWell:      { speed: N01 },
  RainRipples:      { speed: N01 },
  PrismStorm:       { speed: N01 },
  // BeatKaleidoscope's hue comes from AudioHue (0-360°), not the generic
  // CHSV-style hue (0-255).
  BeatKaleidoscope: {
    speed: N01,
    hue: { control: 'slider', min: 0, max: 360, step: 1 },
  },
  // No generic `tiles` key exists elsewhere (tilesX/tilesY are separate).
  SpectraMosaic: {
    speed: N01,
    tiles: { control: 'slider', min: 2, max: 8, step: 1 },
  },
  // Normalised speed/scale pattern nodes (internal range in speedRange.ts).
  Noise:           { speed: N01, scale: N01 },
  Plasma:          { speed: N01 },
  Rainbow:         { speed: N01 },
  RadialBurst:     { speed: N01 },
  Spiral:          { speed: N01 },
  Starfield:       { speed: N01 },
  PaletteGradient: { speed: N01 },
  Noise2D:         { speed: N01, scale: N01 },
  FractalNoise:    { speed: N01, scale: N01 },
  GaborNoise:      { speed: N01, scale: N01 },
  Blobs:           { speed: N01, scale: N01 },
  FlowField:       { speed: N01, scale: N01 },
  Pride2015:       { speed: N01, scale: N01 },
  Pacifica:        { speed: N01, scale: N01 },
  TwinkleFox:      { speed: N01 },
  Scanner:         {
    speed: N01,
    width: { control: 'slider', min: 1, max: 16, step: 1 },
  },
  Confetti:        { speed: N01 },
  Juggle:          {
    speed: N01,
    count: { control: 'slider', min: 1, max: 8, step: 1 },
  },
  Particles:         { rate:  { control: 'slider', min: 0, max: 1,   step: 0.01 } },
  Transform:         { rate:  { control: 'slider', min: 0, max: 360, step: 1 } },
  Counter:           { rate:  { control: 'slider', min: 0, max: 5,   step: 0.1 } },
  GameOfLife:        { speed: { control: 'slider', min: 1, max: 30,  step: 1 } },
  ReactionDiffusion: { speed: { control: 'slider', min: 1, max: 30,  step: 1 } },
  WaveSim: {
    speed:   { control: 'slider', min: 1, max: 12,    step: 1 },
    damping: { control: 'slider', min: 0.8, max: 0.999, step: 0.001 },
    impulse: { control: 'slider', min: 0.1, max: 1,   step: 0.01 },
  },
  Image: {
    fit:       { control: 'select', options: ['stretch', 'contain', 'cover', 'original'] },
    sampling:  { control: 'select', options: ['nearest', 'smooth'] },
    positionX: { control: 'slider', min: 0, max: 1, step: 0.01 },
    positionY: { control: 'slider', min: 0, max: 1, step: 0.01 },
    rotation:  { control: 'select', options: ['0', '90', '180', '270'] },
    zoom:      { control: 'slider', min: 1, max: 8, step: 0.1 },
    cropX:     { control: 'slider', min: 0, max: 1, step: 0.01 },
    cropY:     { control: 'slider', min: 0, max: 1, step: 0.01 },
    saturation:{ control: 'slider', min: 0, max: 2, step: 0.01 },
    contrast:  { control: 'slider', min: 0, max: 2, step: 0.01 },
    hueShift:  { control: 'slider', min: -180, max: 180, step: 1 },
    gamma:     { control: 'slider', min: 1, max: 3.5, step: 0.1 },
    paletteLevels: { control: 'select', options: ['full', '2', '4', '8', '16', '32'] },
    dithering: { control: 'select', options: ['none', 'ordered2x2', 'ordered4x4'] },
  },
  AnimatedImage: {
    fit:       { control: 'select', options: ['stretch', 'contain', 'cover', 'original'] },
    sampling:  { control: 'select', options: ['nearest', 'smooth'] },
    positionX: { control: 'slider', min: 0, max: 1, step: 0.01 },
    positionY: { control: 'slider', min: 0, max: 1, step: 0.01 },
    rotation:  { control: 'select', options: ['0', '90', '180', '270'] },
    zoom:      { control: 'slider', min: 1, max: 8, step: 0.1 },
    cropX:     { control: 'slider', min: 0, max: 1, step: 0.01 },
    cropY:     { control: 'slider', min: 0, max: 1, step: 0.01 },
    saturation:{ control: 'slider', min: 0, max: 2, step: 0.01 },
    contrast:  { control: 'slider', min: 0, max: 2, step: 0.01 },
    hueShift:  { control: 'slider', min: -180, max: 180, step: 1 },
    gamma:     { control: 'slider', min: 1, max: 3.5, step: 0.1 },
    paletteLevels: { control: 'select', options: ['full', '2', '4', '8', '16', '32'] },
    dithering: { control: 'select', options: ['none', 'ordered2x2', 'ordered4x4'] },
    playbackRate: { control: 'slider', min: 0.25, max: 4, step: 0.05 },
  },
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
    labels: { field: 'Noise Field', simplex: 'Simplex', noise3d: 'Noise 3D', noise4d: 'Noise 4D', worley: 'Worley', plasma: 'Plasma Fractal' },
  },
  Path: {
    prop: 'pathShape',
    labels: { circle: 'Path · Circle', heart: 'Path · Heart', lissajous: 'Path · Lissajous', rose: 'Path · Rose' },
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
    labels: {
      fountain: 'Fountain', gravity: 'Gravity', fireworks: 'Fireworks', sparkle: 'Sparkle Rain',
      comet: 'Comet', snow: 'Snow', swarm: 'Swarm', rain: 'Rain', embers: 'Embers',
      bubbles: 'Bubbles', vortex: 'Vortex', orbit: 'Orbit', confetti: 'Confetti',
      fireflies: 'Fireflies', meteor: 'Meteor', tornado: 'Tornado', pinwheel: 'Pinwheel',
      bounce: 'Bounce', attractor: 'Attractor', waterfall: 'Waterfall',
    },
  },
  Ease: {
    prop: 'easeType',
    labels: { inOutCubic: 'Ease · Cubic', inOutQuad: 'Ease · Quad', triwave: 'Triangle Wave', quadwave: 'Quad Wave', cubicwave: 'Cubic Wave' },
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
  if (nodeType === 'MatrixOutput') {
    if (key === 'volts' || key === 'milliamps') return properties.powerLimit === true
    const spi = SPI_CHIPSETS.has(String(properties.chipset ?? 'WS2812B'))
    // The clock pin only exists on SPI chipsets; FASTLED_OVERCLOCK only applies
    // to clockless ones.
    if (key === 'clockPin') return spi
    if (key === 'overclock') return !spi
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
