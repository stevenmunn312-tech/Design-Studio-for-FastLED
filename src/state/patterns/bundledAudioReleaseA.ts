import { AudioReleaseBuilder, type AudioReleaseSeed } from './audioReleaseBuilder'

/** These are musical scenes: each engine has its own build and drop gesture. */
export const RELEASE_AUDIO_A_DESCRIPTIONS: Record<string, string> = {
  'Noctilucent Origami': 'Teal and coral recursive paper fans breathe with bass. A build folds the fans into their alternate pattern; drops open their seams into luminous facets.',
  'Copper Circuit Tide': 'Copper and jade hexagonal circuits drift across the panel. Treble adds fine detail, builds bend the circuits, and drops reconnect the maze with a fading echo.',
  'Chromafluid Cathedral': 'Violet smoke rises through hexagonal stained glass. Stereo balance steers the dye, relative bass feeds it, builds tighten its symmetry, and drops release a spreading puff.',
  'Mycelium Crescendo': 'Moss and amber Turing labyrinths grow slowly in quiet passages. Builds accelerate their fine structure; drops seed a new organism and briefly reveal its bright veins.',
  'Harmonic Lantern Loom': 'A lavender Fourier ribbon draws an infinity knot. Pitch colours the pen, vocals widen its path, builds add harmonics, and drops unfurl the full outline.',
  'Abyssal Julia Bloom': 'An indigo and seafoam Julia reef slowly turns with the music. Vocals reshape its islands, builds dive inward, and drops pull the camera back into a broad coral bloom.',
  'Opal Resonance Basin': 'Opal waves ripple on each beat. Energy changes their travel speed, builds extend their resonance, and drops send a stronger ripple through a rotating mirrored basin.',
}

function noctilucentOrigami(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Noctilucent Origami', ['matrix', 'ring'], ['#030a16', '#16bbaa', '#ff927d'])
  b.node('fans', 'SliceTiling', { lattice: 'hex', depth: 2, preset: 'snowflake', symmetry: 'dihedral', cells: 1.45, edge: 0.025, seed: 421 })
  b.map('fold', 'buildup', 'result', 0.05, 0.92)
  b.map('breathing', 'fft', 'bass', 0.02, 0.5)
  b.map('turn', 'energy', 'result', 1.2, 17)
  b.map('seams', 'dropEnvelope', 'result', 0.012, 0.11)
  b.node('cellColour', 'FieldMath', { fieldOp: 'multiply' })
  b.node('facetDetail', 'FieldLevels', { low: 0, high: 0.62 })
  b.node('shade', 'FieldToFrame')
  b.node('soften', 'Blur2D', { amount: 0.055 })
  b.wire('fold', 'result', 'fans', 'morph')
  b.wire('breathing', 'result', 'fans', 'warp')
  b.wire('turn', 'result', 'fans', 'spin')
  b.wire('seams', 'result', 'fans', 'edge')
  b.wire('fans', 'field', 'cellColour', 'a')
  b.wire('fans', 'cell', 'cellColour', 'b')
  b.wire('cellColour', 'field', 'facetDetail', 'field')
  b.wire('facetDetail', 'field', 'shade', 'field')
  b.wire('palette', 'palette', 'shade', 'paletteIn')
  b.wire('shade', 'frame', 'soften', 'frame')
  return b.finish('soften')
}

function copperCircuitTide(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Copper Circuit Tide', ['matrix'], ['#020e13', '#22a38f', '#ffb16b'])
  b.node('circuit', 'Truchet', { lattice: 'hex', motif: 'hexArcs', cells: 2.7, seed: 422 })
  b.map('traceWidth', 'band', 'level', 0.055, 0.17)
  b.map('drift', 'energy', 'result', 0.025, 0.65)
  b.node('warpNoise', 'FieldNoise', { speed: 0.1, scale: 0.2, octaves: 2, seed: 47 })
  // Field Warp uses pixel offsets, not a normalised amount. Cross a whole
  // sample during the build so the bend survives small LED resolutions.
  b.map('tension', 'buildup', 'result', 0.08, 3.8)
  b.node('bend', 'FieldWarp')
  b.node('shade', 'FieldToFrame')
  b.node('echo', 'FrameFeedback', { delayFrames: 3, fade: 0.24, blendMode: 'screen' })
  b.map('dropEcho', 'dropEnvelope', 'result', 0.05, 0.56)
  b.wire('song', 'drop', 'circuit', 'reroll')
  b.wire('traceWidth', 'result', 'circuit', 'lineWidth')
  b.wire('drift', 'result', 'circuit', 'scroll')
  b.wire('circuit', 'field', 'bend', 'field')
  b.wire('warpNoise', 'field', 'bend', 'dx')
  b.wire('warpNoise', 'field', 'bend', 'dy')
  b.wire('tension', 'result', 'bend', 'strength')
  b.wire('bend', 'field', 'shade', 'field')
  b.wire('palette', 'palette', 'shade', 'paletteIn')
  b.wire('shade', 'frame', 'echo', 'frame')
  b.wire('dropEcho', 'result', 'echo', 'amount')
  return b.finish('echo')
}

function chromafluidCathedral(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Chromafluid Cathedral', ['matrix'], ['#080414', '#803cca', '#ffc9a5'])
  b.node('fluid', 'FluidSim', { injectY: 0.76, dissipation: 0.035, diffusion: 0.0001, buoyancy: 0.45 })
  b.map('bassDye', 'vibe', 'bassAtt', 0.16, 0.82, 0, 2.5)
  b.map('stereoSource', 'stereo', 'balance', 0.22, 0.78)
  b.map('fluidMotion', 'energy', 'result', 3, 10)
  b.node('forceX', 'FieldNoise', { speed: 0.1, scale: 0.24, octaves: 2, seed: 311 })
  b.node('forceY', 'FieldNoise', { speed: 0.08, scale: 0.27, octaves: 2, seed: 617 })
  b.node('cathedral', 'FieldSymmetry', { group: 'p6m', cells: 1.1, spin: 2 })
  b.map('vaults', 'buildup', 'result', 1.1, 2.3)
  b.map('dropInjection', 'dropEnvelope', 'result', 0, 0.65)
  b.node('dyeSum', 'Math', { mathOp: 'add' })
  b.node('dyeLimit', 'Clamp', { min: 0, max: 1 })
  b.node('shade', 'FieldToFrame')
  b.node('dyeDetail', 'FieldLevels', { low: 0, high: 0.55 })
  b.wire('bassDye', 'result', 'dyeSum', 'a')
  b.wire('dropInjection', 'result', 'dyeSum', 'b')
  b.wire('dyeSum', 'result', 'dyeLimit', 'value')
  b.wire('dyeLimit', 'result', 'fluid', 'inject')
  b.wire('stereoSource', 'result', 'fluid', 'injectX')
  b.wire('fluidMotion', 'result', 'fluid', 'quality')
  b.wire('forceX', 'field', 'fluid', 'forceX')
  b.wire('forceY', 'field', 'fluid', 'forceY')
  b.wire('song', 'drop', 'fluid', 'trigger')
  b.wire('fluid', 'field', 'cathedral', 'field')
  b.wire('vaults', 'result', 'cathedral', 'cells')
  b.wire('cathedral', 'field', 'dyeDetail', 'field')
  b.wire('dyeDetail', 'field', 'shade', 'field')
  b.wire('palette', 'palette', 'shade', 'paletteIn')
  return b.finish('shade')
}

function myceliumCrescendo(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Mycelium Crescendo', ['matrix'], ['#04100d', '#509c64', '#f5c97d'])
  b.node('organism', 'TuringField', { scales: 3, baseRadius: 1, seed: 424 })
  b.map('growth', 'energy', 'result', 1, 4)
  b.map('branching', 'buildup', 'result', 0.025, 0.085)
  b.node('veins', 'FieldLevels', { high: 0.94 })
  b.map('reveal', 'dropEnvelope', 'result', 0.12, 0.38)
  b.node('shade', 'FieldToFrame')
  b.node('soften', 'Blur2D', { amount: 0.065 })
  b.wire('song', 'drop', 'organism', 'reset')
  b.wire('growth', 'result', 'organism', 'speed')
  b.wire('branching', 'result', 'organism', 'stepSize')
  b.wire('organism', 'field', 'veins', 'field')
  b.wire('reveal', 'result', 'veins', 'low')
  b.wire('veins', 'field', 'shade', 'field')
  b.wire('palette', 'palette', 'shade', 'paletteIn')
  b.wire('shade', 'frame', 'soften', 'frame')
  return b.finish('soften')
}

function harmonicLanternLoom(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Harmonic Lantern Loom', ['matrix', 'ring'], ['#9aaaff', '#e0bfff', '#fff0cc'])
  b.node('ribbon', 'FourierEpicycles', { outline: 'infinity', maxHarmonics: 24, showCircles: false, showPen: true, persistence: 0.995 })
  b.node('unfurl', 'Math', { mathOp: 'max' })
  b.map('harmonics', 'unfurl', 'result', 3, 24)
  b.map('drawingSpeed', 'energy', 'result', 0.09, 0.46)
  b.map('vocalSpan', 'features', 'vocals', 0.58, 0.88)
  b.node('confidentPitch', 'Compare', { b: 0.55 })
  b.node('safeNote', 'Switch', { a: 57 })
  b.node('safeVelocity', 'Switch', { a: 0.35 })
  b.node('noteGlide', 'Smooth', { response: 0.24 })
  b.map('noteColor', 'noteGlide', 'result', 0.15, 0.9, 36, 96)
  b.node('pen', 'GradientSampler', { rA: 120, gA: 185, bA: 255, rB: 255, gB: 190, bB: 220, mixMode: 'rgb' })
  b.map('penWeight', 'safeVelocity', 'result', 1.5, 3)
  b.wire('buildup', 'result', 'unfurl', 'a')
  b.wire('dropEnvelope', 'result', 'unfurl', 'b')
  b.wire('harmonics', 'result', 'ribbon', 'harmonics')
  b.wire('drawingSpeed', 'result', 'ribbon', 'speed')
  b.wire('vocalSpan', 'result', 'ribbon', 'scale')
  b.wire('pitch', 'confidence', 'confidentPitch', 'a')
  b.wire('confidentPitch', 'result', 'safeNote', 'sel')
  b.wire('confidentPitch', 'result', 'safeVelocity', 'sel')
  b.wire('pitch', 'note', 'safeNote', 'b')
  b.wire('pitch', 'velocity', 'safeVelocity', 'b')
  b.wire('safeNote', 'result', 'noteGlide', 'value')
  b.wire('noteColor', 'result', 'pen', 't')
  b.wire('pen', 'color', 'ribbon', 'color')
  b.wire('penWeight', 'result', 'ribbon', 'thickness')
  return b.finish('ribbon')
}

function abyssalJuliaBloom(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Abyssal Julia Bloom', ['matrix'], ['#020c21', '#35b8b0', '#ff987b'])
  b.node('reef', 'FractalField', { fractalType: 'julia', cRe: -0.745, cIm: 0.19, iterations: 28, smooth: true })
  b.map('vocalIslands', 'features', 'vocals', 0.14, 0.225)
  b.map('dive', 'buildup', 'result', 1.05, 2.75)
  b.node('pullback', 'Lerp', { b: 0.78 })
  b.node('turn', 'FieldRotate')
  b.map('current', 'energy', 'result', 1.2, 14)
  b.node('colour', 'PaletteTransform')
  b.map('mood', 'song', 'valence', -0.08, 0.12)
  b.node('shade', 'FieldToFrame')
  b.wire('vocalIslands', 'result', 'reef', 'cIm')
  b.wire('dive', 'result', 'pullback', 'a')
  b.wire('dropEnvelope', 'result', 'pullback', 't')
  b.wire('pullback', 'result', 'reef', 'zoom')
  b.wire('reef', 'field', 'turn', 'field')
  b.wire('current', 'result', 'turn', 'spin')
  b.wire('palette', 'palette', 'colour', 'paletteIn')
  b.wire('mood', 'result', 'colour', 'offset')
  b.wire('turn', 'field', 'shade', 'field')
  b.wire('colour', 'palette', 'shade', 'paletteIn')
  return b.finish('shade')
}

function opalResonanceBasin(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Opal Resonance Basin', ['matrix'], ['#040c21', '#628cda', '#bbfff0'])
  b.node('water', 'WaveSim', { wrapEdges: true, halfDuplex: false })
  b.node('splashTrigger', 'Logic', { logicOp: 'or' })
  b.node('impact', 'Math', { mathOp: 'max' })
  b.map('splash', 'impact', 'result', 0.22, 1)
  b.map('waveSpeed', 'energy', 'result', 2, 7)
  b.map('resonance', 'buildup', 'result', 0.965, 0.993)
  b.node('basin', 'FieldSymmetry', { group: 'p4m', cells: 1, spin: 1.8 })
  b.node('waveDetail', 'FieldLevels', { low: 0, high: 0.075 })
  b.map('stereoTurn', 'stereo', 'balance', -14, 14)
  b.node('shade', 'FieldToFrame')
  b.wire('beat', 'beat', 'splashTrigger', 'a')
  b.wire('song', 'drop', 'splashTrigger', 'b')
  b.wire('splashTrigger', 'result', 'water', 'trigger')
  b.wire('perc', 'kick', 'impact', 'a')
  b.wire('dropEnvelope', 'result', 'impact', 'b')
  b.wire('splash', 'result', 'water', 'impulse')
  b.wire('waveSpeed', 'result', 'water', 'speed')
  b.wire('resonance', 'result', 'water', 'damping')
  b.wire('water', 'field', 'basin', 'field')
  b.wire('stereoTurn', 'result', 'basin', 'rotation')
  b.wire('basin', 'field', 'waveDetail', 'field')
  b.wire('waveDetail', 'field', 'shade', 'field')
  b.wire('palette', 'palette', 'shade', 'paletteIn')
  return b.finish('shade')
}

export const RELEASE_AUDIO_A_SEEDS: AudioReleaseSeed[] = [
  noctilucentOrigami(), copperCircuitTide(), chromafluidCathedral(), myceliumCrescendo(),
  harmonicLanternLoom(), abyssalJuliaBloom(), opalResonanceBasin(),
]
