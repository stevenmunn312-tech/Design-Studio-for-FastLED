// Audio-reactive pattern node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const AUDIO_REACTIVE_DEFINITIONS: NodeDefinition[] = [
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
    propertyInputs: { energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { energy: 0.7, speed: 0.6, palette: 'rainbow', mirror: true },
  },
  {
    // Full equalizer display driven directly from the shared microphone
    // spectrum. Unlike SpectrumBars' deliberately stylised three-band motion,
    // this preserves the individual frequency bins in preview and firmware.
    type: 'SpectrumVisualizer',
    label: 'Spectrum Visualizer',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'gain', label: 'Gain', dataType: 'float' },
      { id: 'smoothing', label: 'Smoothing', dataType: 'float' },
      { id: 'tilt', label: 'Tilt', dataType: 'float' },
      { id: 'peakHold', label: 'Peak Hold', dataType: 'float' },
      { id: 'peakGravity', label: 'Peak Gravity', dataType: 'float' },
      { id: 'waterfallSpeed', label: 'Waterfall Speed', dataType: 'float' },
    ],
    // `bands` is deliberately absent: it sizes the band array the generator
    // emits and composes literals of its own, so there is nothing for a wire
    // to change at runtime.
    propertyInputs: {
      palette: 'paletteIn',
      gain: 'gain', smoothing: 'smoothing', tilt: 'tilt',
      peakHold: 'peakHold', peakGravity: 'peakGravity',
      waterfallSpeed: 'waterfallSpeed',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      style: 'Bars', bands: 16, gain: 1.25, smoothing: 0.58, tilt: 0.2,
      peakHold: 0.42, peakGravity: 1.8, waterfallSpeed: 10, palette: 'citrus',
    },
  },

  {
    // The raw audio waveform drawn over a base frame: the shape of the sound
    // itself rather than its spectrum. Reads the 128 decimated samples the
    // audio payload and the sketch engine both carry.
    type: 'Waveform',
    label: 'Waveform',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'base', label: 'Base', dataType: 'frame' },
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'gain', label: 'Gain', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'thickness', label: 'Thickness', dataType: 'float' },
      { id: 'smoothing', label: 'Smoothing', dataType: 'float' },
    ],
    propertyInputs: { palette: 'paletteIn', gain: 'gain', thickness: 'thickness', smoothing: 'smoothing' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { style: 'line', gain: 2, thickness: 1, smoothing: 0.3, palette: 'citrus' },
  },

  // ── Audio-reactive patterns ─────────────────────────────────────────────
  {
    type: 'BassPulse',
    label: 'Bass Pulse',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { bass: 'bass', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0,
      palette: 'lava',
    },
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
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { bass: 'bass', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0.5,
      energy: 0.7, speed: 1.0, palette: 'lava',
    },
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
    propertyInputs: { mids: 'mids', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      mids: 0.5,
      energy: 0.7, speed: 1.0, palette: 'ocean',
    },
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
    propertyInputs: { mids: 'mids', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      mids: 0.5,
      energy: 0.7, speed: 1.0, palette: 'party',
    },
  },
  {
    type: 'TrebleSparks',
    label: 'Treble Sparks',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'density', label: 'Density', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { treble: 'treble', density: 'density', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      treble: 0.5,
      density: 0.5, palette: 'ice',
    },
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
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { treble: 'treble', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      treble: 0.5,
      energy: 0.7, speed: 1.0, palette: 'amethyst',
    },
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
    propertyInputs: { bass: 'bass', mids: 'mids', treble: 'treble', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0.5, mids: 0.5, treble: 0.5,
      energy: 0.7, speed: 1.0, palette: 'rainbow',
    },
  },
  {
    type: 'BeatFlash',
    label: 'Beat Flash',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'frame', label: 'Base', dataType: 'frame' },
      { id: 'attack', label: 'Attack', dataType: 'float' },
      { id: 'decay', label: 'Decay', dataType: 'float' },
      { id: 'intensity', label: 'Intensity', dataType: 'float' },
      // Wire a palette to sweep the flash through it as it decays; leave
      // `palette` at 'none' (default) to use the solid r/g/b color instead.
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: {
      attack: 'attack', decay: 'decay', intensity: 'intensity',
      palette: 'paletteIn',
      r: 'r', g: 'g', b: 'b',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      decay: 0.85,
      attack: 0,
      intensity: 1,
      blendMode: 'screen',
      preserveBase: true,
      palette: 'none',
      r: 255, g: 255, b: 255,
    },
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
      { id: 'tiles', label: 'Tiles', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'decay', label: 'Decay', dataType: 'float' },
      { id: 'thickness', label: 'Thickness', dataType: 'float' },
      { id: 'spawnSpread', label: 'Spawn Spread', dataType: 'float' },
    ],
    propertyInputs: { decay: 'decay', thickness: 'thickness', spawnSpread: 'spawnSpread', hihat: 'hihat', kick: 'kick', snare: 'snare', energy: 'energy', speed: 'speed', tiles: 'tiles', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      hihat: 0, kick: 0, snare: 0,
      energy: 0.7, speed: 1.0, tiles: 1, palette: 'volcano',
      count: 8, decay: 1, thickness: 1, spawnSpread: 0, blendMode: 'add',
    },
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
    propertyInputs: { vocals: 'vocals', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      vocals: 0,
      energy: 0.7, speed: 1.0, palette: 'aurora',
    },
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
    propertyInputs: { hue: 'hue', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
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
      { id: 'tiles', label: 'Tiles', dataType: 'float' },
    ],
    propertyInputs: { tiles: 'tiles', bass: 'bass', mids: 'mids', treble: 'treble', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0.5, mids: 0.5, treble: 0.5,
      energy: 0.7, speed: 1.0, palette: 'peacock', tiles: 4,
    },
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
      { id: 'size', label: 'Size', dataType: 'float' },
      { id: 'decay', label: 'Decay', dataType: 'float' },
      { id: 'spawnSpread', label: 'Spawn Spread', dataType: 'float' },
    ],
    propertyInputs: { size: 'size', decay: 'decay', spawnSpread: 'spawnSpread', hihat: 'hihat', kick: 'kick', snare: 'snare', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      hihat: 0, kick: 0, snare: 0,
      palette: 'party',
      count: 12, size: 1, decay: 1, spawnSpread: 1, blendMode: 'add',
    },
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
    propertyInputs: { bass: 'bass', mids: 'mids', treble: 'treble', energy: 'energy', speed: 'speed' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0.5, mids: 0.5, treble: 0.5,
      energy: 0.7, speed: 1.0,
    },
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
    propertyInputs: { bass: 'bass', mids: 'mids', treble: 'treble', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0.5, mids: 0.5, treble: 0.5,
      energy: 0.7, speed: 1.0, palette: 'deepsea',
    },
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
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: { bass: 'bass', energy: 'energy', speed: 'speed', r: 'r', g: 'g', b: 'b' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0.5,
      energy: 0.7, speed: 1.0, r: 80, g: 160, b: 255,
    },
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
      { id: 'decay', label: 'Decay', dataType: 'float' },
      { id: 'thickness', label: 'Thickness', dataType: 'float' },
      { id: 'spawnSpread', label: 'Spawn Spread', dataType: 'float' },
    ],
    propertyInputs: { decay: 'decay', thickness: 'thickness', spawnSpread: 'spawnSpread', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      energy: 0.7, speed: 1.0, palette: 'laguna',
      count: 8, decay: 1, thickness: 1, spawnSpread: 1, blendMode: 'max',
    },
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
    propertyInputs: { hihat: 'hihat', mids: 'mids', treble: 'treble', energy: 'energy', speed: 'speed', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      hihat: 0, mids: 0.5, treble: 0.5,
      energy: 0.7, speed: 1.0, palette: 'amethyst',
    },
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
    propertyInputs: { bass: 'bass', mids: 'mids', treble: 'treble', speed: 'speed', scale: 'scale', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0.5, mids: 0.5, treble: 0.3,
      speed: 0.5, scale: 0.5, palette: 'rainbow',
    },
  },
  {
    // Persistent palette advection: a moving Lissajous segment, a rainbow
    // perimeter, or both are painted into an RGB feedback buffer, then smooth
    // noise profiles shift every row and column with subpixel interpolation.
    // Audio modulation remains optional, so autonomous motion works unwired.
    type: 'ColorTrails',
    label: 'Color Trails',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'xSpeed', label: 'X Speed', dataType: 'float' },
      { id: 'xAmplitude', label: 'X Amplitude', dataType: 'float' },
      { id: 'xFrequency', label: 'X Frequency', dataType: 'float' },
      { id: 'ySpeed', label: 'Y Speed', dataType: 'float' },
      { id: 'yAmplitude', label: 'Y Amplitude', dataType: 'float' },
      { id: 'yFrequency', label: 'Y Frequency', dataType: 'float' },
      { id: 'displacement', label: 'Displacement', dataType: 'float' },
      { id: 'endpointSpeed', label: 'Endpoint Speed', dataType: 'float' },
      { id: 'colorSpeed', label: 'Color Speed', dataType: 'float' },
      { id: 'persistence', label: 'Persistence', dataType: 'float' },
    ],
    propertyInputs: { xSpeed: 'xSpeed', xAmplitude: 'xAmplitude', xFrequency: 'xFrequency', ySpeed: 'ySpeed', yAmplitude: 'yAmplitude', yFrequency: 'yFrequency', displacement: 'displacement', endpointSpeed: 'endpointSpeed', colorSpeed: 'colorSpeed', persistence: 'persistence', bass: 'bass', mids: 'mids', treble: 'treble', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0, mids: 0, treble: 0,
      injectionMode: 'Moving Line', flowMode: 'Scrolling',
      xSpeed: 0.1, xAmplitude: 1, xFrequency: 0.33,
      ySpeed: 0.1, yAmplitude: 1, yFrequency: 0.32,
      displacement: 1.8, endpointSpeed: 0.35, colorSpeed: 0.1,
      persistence: 0.99922, palette: 'rainbow', seed: 42,
    },
  },
  {
    // A separately licensed, removable AnimARTrix integration. The six audio
    // bands/percussion signals alter geometry, not merely master brightness.
    type: 'Animartrix',
    label: 'AnimARTrix',
    category: 'pattern',
    subcategory: 'Audio-Reactive',
    inputs: [
      { id: 'bass', label: 'Bass', dataType: 'float' },
      { id: 'mids', label: 'Mids', dataType: 'float' },
      { id: 'treble', label: 'Treble', dataType: 'float' },
      { id: 'kick', label: 'Kick', dataType: 'float' },
      { id: 'snare', label: 'Snare', dataType: 'float' },
      { id: 'hihat', label: 'Hi-Hat', dataType: 'float' },
      { id: 'beat', label: 'Beat', dataType: 'bool' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'audioAmount', label: 'Audio Amount', dataType: 'float' },
    ],
    propertyInputs: { audioAmount: 'audioAmount', bass: 'bass', hihat: 'hihat', kick: 'kick', mids: 'mids', snare: 'snare', treble: 'treble', speed: 'speed' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      bass: 0, hihat: 0, kick: 0, mids: 0, snare: 0, treble: 0,
      effect: 'Water', speed: 0.65, audioAmount: 1,
    },
  },
]

export const AUDIO_REACTIVE_DESCRIPTIONS: Record<string, string> = {
  SpectrumBars: 'Palette-driven equalizer bars with audio-reactive motion.',
  SpectrumVisualizer: 'Full-spectrum bars, ribbon, orbit, mirror, or waterfall display.',
  Waveform: 'Raw audio waveform as a line, filled, mirror, or ring trace over a base.',
  BassPulse: 'Pulses a palette colour with bass energy.',
  BassRings: 'Concentric rings that swell and brighten with bass.',
  MidrangeWaves: 'Waves driven by midrange audio.',
  MidrangeBloom: 'Blooming palette contours driven by midrange energy.',
  TrebleSparks: 'Glittering treble sparks coloured from a palette.',
  TreblePrism: 'Sharp diagonal prisms that shimmer with treble energy.',
  AudioCascade: 'Full-spectrum ribbons with bass glow, mids flow, and treble shimmer.',
  BeatFlash: 'Flashes toward a color/palette on each beat — attack, decay, intensity, blend.',
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
  AudioFlow: 'Audio-reactive flowing noise field.',
  ColorTrails: 'Fluid palette trails adapted from a Stefan Petrick prototype.',
  Animartrix: 'AnimARTrix by Stefan Petrick, rebuilt for deep musical control.',
}
