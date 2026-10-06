// Simulation pattern node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'

export const SIMULATIONS_DEFINITIONS: NodeDefinition[] = [
  {
    // `direction` rotates which edge sparks (the flame base) and which way heat
    // rises; `turbulence` widens the sideways diffusion kernel (1 = the
    // original 3-wide average); `paletteMix` blends the palette colour with
    // plain heat-brightness grayscale (1 = full colour, 0 = grayscale);
    // `mirror` folds the flame symmetric across its width; `seed` (0 = free-
    // running) switches cooling/sparking to a deterministic per-instance PRNG
    // so the same seed reproduces the same flame. See PROPERTY_META overrides
    // and the `Fire`/`Fire2012` cases in graphEvaluator/cppGenerator, which
    // share this exact set of controls but keep their own heat algorithms.
    type: 'Fire',
    label: 'Fire',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'intensity', label: 'Intensity', dataType: 'float' },
      { id: 'cooling', label: 'Cooling', dataType: 'float' },
      { id: 'sparking', label: 'Sparking', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'turbulence', label: 'Turbulence', dataType: 'float' },
      { id: 'paletteMix', label: 'Palette Mix', dataType: 'float' },
    ],
    propertyInputs: { intensity: 'intensity', cooling: 'cooling', sparking: 'sparking', palette: 'paletteIn', turbulence: 'turbulence', paletteMix: 'paletteMix' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      // Wire-or-field: the same reading the evaluator and the generator already
      // fall back to, now dialable so a pattern can be judged without audio.
      intensity: 0.7,
      cooling: 55, sparking: 120, palette: 'fire',
      direction: 'up', turbulence: 1, paletteMix: 1, mirror: false, seed: 0, fireStyle: 'classic',
    },
  },
  {
    type: 'Fire2012',
    label: 'Fire 2012',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'cooling', label: 'Cooling', dataType: 'float' },
      { id: 'sparking', label: 'Sparking', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'turbulence', label: 'Turbulence', dataType: 'float' },
      { id: 'paletteMix', label: 'Palette Mix', dataType: 'float' },
    ],
    propertyInputs: { cooling: 'cooling', sparking: 'sparking', palette: 'paletteIn', turbulence: 'turbulence', paletteMix: 'paletteMix' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      cooling: 55, sparking: 120, palette: 'heat',
      direction: 'up', turbulence: 1, paletteMix: 1, mirror: false, seed: 0,
    },
  },
  {
    // Bundled particle systems — `particleType` selects the simulation. All
    // variants share the (rate, palette, decay)→frame signature; the evaluator and
    // codegen dispatch on the variant. Each particle is coloured by its life
    // (age) through the palette. See PROPERTY_META.particleType.
    // Five extra controls are gated to the variants they actually affect (see
    // isPropertyEnabled): `count` sets the pool size directly for the
    // fixed-population modes (swarm/orbit/bounce/fireflies, decoupled from
    // `rate`); `spread` widens/narrows the spawn area for width-spawning modes;
    // `gravity`/`bounce` scale the built-in accel/restitution constants for
    // modes with a falling or floor-bouncing motion. `size` scales the
    // rendered particle radius and applies to every mode.
    type: 'Particles',
    label: 'Particles',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'rate', label: 'Rate', dataType: 'float' },
      { id: 'decay', label: 'Decay', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'size', label: 'Size', dataType: 'float' },
      { id: 'spread', label: 'Spread', dataType: 'float' },
      { id: 'gravity', label: 'Gravity', dataType: 'float' },
      { id: 'bounce', label: 'Bounce', dataType: 'float' },
    ],
    /*
     * `count` and `seed` are deliberately absent. The swarm variant sizes its
     * particle pool from `count`, so it must be known when the array is
     * declared; `seed` is read once behind a one-shot guard, so a wire into it
     * would be sampled on the first frame and never again.
     */
    propertyInputs: {
      rate: 'rate', decay: 'decay', palette: 'paletteIn',
      size: 'size', spread: 'spread', gravity: 'gravity', bounce: 'bounce',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      particleType: 'fountain', rate: 0.3, decay: 0.92, palette: 'party',
      size: 1, count: 24, spread: 1, gravity: 1, bounce: 1, seed: 0,
    },
  },
  {
    // Curated stateful point/trajectory generators, selected by a dropdown —
    // the pattern-category, self-contained-frame-generator sibling of
    // FormulaField (field category). See
    // docs/design/formula-pattern-nodes.md.
    type: 'FormulaPoints',
    label: 'Formula Points',
    category: 'pattern',
    subcategory: 'Simulations',
    /*
     * Every numeric knob is a property input, so a touch control or an LFO can
     * drive the shape live — the same treatment FormulaField has, and for the
     * same reason: these are all values that mean something at runtime.
     *
     * The two selects stay properties. `formulaType` picks which block the
     * generator emits and `preset` picks the de Jong constants it bakes, both
     * at generation time, so neither has anything to branch on at runtime.
     *
     * Only the knobs `isPropertyEnabled` allows for the chosen variant do
     * anything; a wire into another variant's knob is inert by construction
     * (the generator emits one block, the evaluator reads one variant's
     * params) rather than by a rule anyone has to maintain.
     */
    inputs: [
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'dotSize', label: 'Dot Size', dataType: 'float' },
      { id: 'count', label: 'Count', dataType: 'float' },
      { id: 'persistence', label: 'Persistence', dataType: 'float' },
      { id: 'freqA', label: 'Freq A', dataType: 'float' },
      { id: 'freqB', label: 'Freq B', dataType: 'float' },
      { id: 'petals', label: 'Petals', dataType: 'float' },
      { id: 'chaos', label: 'Chaos', dataType: 'float' },
    ],
    propertyInputs: {
      palette: 'paletteIn',
      speed: 'speed',
      dotSize: 'dotSize',
      count: 'count',
      persistence: 'persistence',
      freqA: 'freqA',
      freqB: 'freqB',
      petals: 'petals',
      chaos: 'chaos',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: {
      formulaType: 'phyllotaxis',
      speed: 0.3,
      dotSize: 1,
      palette: 'rainbow',
      // phyllotaxis / logisticMap / attractor
      count: 60,
      // lissajousPath / rosePath / attractor
      persistence: 0.85,
      // lissajousPath
      freqA: 3,
      freqB: 2,
      // rosePath
      petals: 5,
      // logisticMap
      chaos: 3.8,
      // attractor
      preset: 'classic',
    },
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
      { id: 'count', label: 'Count', dataType: 'float' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: {
      speed: 'speed', scale: 'scale', count: 'count',
      fade: 'fade', palette: 'paletteIn',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.67, scale: 0.08, count: 80, fade: 0.9, palette: 'ocean', seed: 0, flowMode: 'angle' },
  },
  {
    // String Particles — a 1-D particle pool drawn along a row, column or ring track.
    type: 'StringParticles',
    label: 'String Particles',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'spawn', label: 'Spawn', dataType: 'float' },
      { id: 'trigger', label: 'Trigger', dataType: 'bool' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { spawn: 'spawn', speed: 'speed', fade: 'fade', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { track: 'row', mode: 'drift', count: 12, ringLeds: 60, bed: 0.3, spawn: 0.5, speed: 0.5, fade: 0.85, palette: 'rainbow', seed: 0 },
  },
  {
    // Warp starfield — stars streak outward from the centre.
    type: 'Starfield',
    label: 'Starfield',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'count', label: 'Count', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', count: 'count', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.33, count: 60, palette: 'ice', seed: 0 },
  },
  {
    // Boids — Reynolds flocking swarm (separation / alignment / cohesion).
    type: 'Boids',
    label: 'Boids',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'color', label: 'Color', dataType: 'color' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'count', label: 'Count', dataType: 'float' },
      { id: 'separation', label: 'Separation', dataType: 'float' },
      { id: 'alignment', label: 'Alignment', dataType: 'float' },
      { id: 'cohesion', label: 'Cohesion', dataType: 'float' },
      { id: 'visualRange', label: 'Range', dataType: 'float' },
      { id: 'r', label: 'R', dataType: 'float' },
      { id: 'g', label: 'G', dataType: 'float' },
      { id: 'b', label: 'B', dataType: 'float' },
    ],
    propertyInputs: {
      speed: 'speed', count: 'count', separation: 'separation',
      alignment: 'alignment', cohesion: 'cohesion',
      visualRange: 'visualRange', palette: 'paletteIn',
      r: 'r', g: 'g', b: 'b',
    },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 0.5, count: 24, separation: 0.6, alignment: 0.5, cohesion: 0.4, visualRange: 4, colorMode: 'solid', r: 120, g: 200, b: 255, palette: 'rainbow', seed: 0 },
  },
  {
    // Gray-Scott reaction-diffusion — organic spots/stripes that evolve. A
    // named `rdPreset` fixes feed and kill; `custom` reads the two knobs. The
    // Field output is the V concentration the frame is coloured from.
    type: 'ReactionDiffusion',
    label: 'Reaction Diffusion',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'feed', label: 'Feed', dataType: 'float' },
      { id: 'kill', label: 'Kill', dataType: 'float' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { feed: 'feed', kill: 'kill', speed: 'speed', palette: 'paletteIn' },
    outputs: [
      { id: 'frame', label: 'Frame', dataType: 'frame' },
      { id: 'field', label: 'Field', dataType: 'field' },
    ],
    defaultProperties: { rdPreset: 'custom', feed: 0.055, kill: 0.062, speed: 8, palette: 'ocean', seed: 0 },
  },
  {
    // Conway's Game of Life with fading trails; reseeds when it stagnates.
    type: 'GameOfLife',
    label: 'Game of Life',
    category: 'pattern',
    subcategory: 'Simulations',
    inputs: [
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
      { id: 'speed', label: 'Speed', dataType: 'float' },
      { id: 'fade', label: 'Fade', dataType: 'float' },
    ],
    propertyInputs: { speed: 'speed', fade: 'fade', palette: 'paletteIn' },
    outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    defaultProperties: { speed: 8, fade: 0.75, palette: 'mojito', seed: 0 },
  },
]

export const SIMULATIONS_DESCRIPTIONS: Record<string, string> = {
  Fire: 'Classic rising fire effect.',
  Fire2012: 'FastLED Fire2012 heat simulation.',
  Particles: 'Twenty-one particle displays: weather, trails, flocking, orbits, and more.',
  FormulaPoints: 'Curated point generator: phyllotaxis, Lissajous/rose, logistic map, attractor.',
  FlowField: 'Particles drifting along a noise flow field, with trails.',
  StringParticles: 'Particles on one line: a string, a column or an LED ring.',
  Starfield: 'Warp starfield — stars streak outward from the centre.',
  Boids: 'Flocking swarm — agents steer by separation, alignment and cohesion.',
  ReactionDiffusion: 'Gray-Scott reaction-diffusion — organic spots & stripes, with named presets.',
  GameOfLife: 'Conway’s Game of Life with fading trails.',
}
