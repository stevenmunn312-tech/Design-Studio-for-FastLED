import { AudioReleaseBuilder, type AudioReleaseSeed } from './audioReleaseBuilder'

function pitchHold(
  b: AudioReleaseBuilder, id: string, port: string, confidence: string,
  triggerSource: string, triggerHandle: string, fallback: number,
): string {
  b.node(`${id}Confident`, 'Compare', { b: 0.55 })
  b.wire('pitch', confidence, `${id}Confident`, 'a')
  b.node(`${id}Fallback`, 'Switch', { a: fallback })
  b.wire('pitch', port, `${id}Fallback`, 'b').wire(`${id}Confident`, 'result', `${id}Fallback`, 'sel')
  b.node(`${id}Trigger`, 'Logic', { logicOp: 'and' })
  b.wire(triggerSource, triggerHandle, `${id}Trigger`, 'a').wire(`${id}Confident`, 'result', `${id}Trigger`, 'b')
  b.node(id, 'SampleHold')
  b.wire(`${id}Fallback`, 'result', id, 'value').wire(`${id}Trigger`, 'result', id, 'trigger')
  return id
}

function shade(b: AudioReleaseBuilder, source: string): string {
  b.node('shade', 'FieldToFrame')
  b.wire(source, 'field', 'shade', 'field').wire('palette', 'palette', 'shade', 'paletteIn')
  return 'shade'
}

function resonantVelvet(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Resonant Velvet', ['matrix'], ['#060b18', '#2251bd', '#f3cba4'])
  // A held musical note changes the standing-wave mode without noisy pitch jitter.
  pitchHold(b, 'noteHold', 'note', 'confidence', 'pitch', 'noteOn', 60)
  const mode = b.map('mode', 'noteHold', 'result', 2, 5, 42, 84)
  const tension = b.map('tension', 'buildup', 'result', 6, 9)
  b.node('plate', 'FieldFormula', {
    formula: 'max(0,1-abs(cos(round(a)*PI*cx)*cos(round(b)*PI*cy)-cos(round(b)*PI*cx)*cos(round(a)*PI*cy))*2.2)',
  })
  b.wire(mode, 'result', 'plate', 'a').wire(tension, 'result', 'plate', 'b')
  const spin = b.map('spin', 'energy', 'result', 2, 18)
  const impact = b.map('impact', 'dropEnvelope', 'result', 0, 45)
  b.node('turn', 'FieldWarp', { spin: 2, edgeMode: 'wrap' })
  b.wire('plate', 'field', 'turn', 'field').wire(spin, 'result', 'turn', 'spin').wire(impact, 'result', 'turn', 'angle')
  b.node('contours', 'FieldLevels', { low: 0.12, high: 0.88, steps: 4 })
  b.wire('turn', 'field', 'contours', 'field')
  const contour = b.map('contour', 'band', 'level', 0.86, 0.58)
  b.wire(contour, 'result', 'contours', 'high')
  return b.finish(shade(b, 'contours'))
}

function silkAttractor(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Silk Attractor', ['matrix'], ['#040d16', '#38bfbb', '#f4d49a'])
  b.node('filaments', 'FormulaPoints', { formulaType: 'attractor', preset: 'swirl', count: 48, dotSize: 0.8, trail: 0.43 })
  b.wire('palette', 'palette', 'filaments', 'paletteIn')
  const count = b.map('threadCount', 'energy', 'result', 24, 116)
  const trail = b.map('threadLength', 'buildup', 'result', 0.4, 0.68)
  const size = b.map('threadSize', 'vibe', 'midAtt', 0.65, 1.4, 0, 2.5)
  b.wire(count, 'result', 'filaments', 'count').wire(trail, 'result', 'filaments', 'trail')
  b.wire(size, 'result', 'filaments', 'dotSize')
  // The drop opens the woven attractor rather than replacing it with a white flash.
  const zoom = b.map('open', 'dropEnvelope', 'result', 1, 1.42)
  const tilt = b.map('tilt', 'stereo', 'balance', -8, 8)
  b.node('opening', 'FrameTransform', { mode: 'smooth', edgeMode: 'wrap', sampling: 'bilinear' })
  b.wire('filaments', 'frame', 'opening', 'frame').wire(zoom, 'result', 'opening', 'scale')
  b.wire(tilt, 'result', 'opening', 'rotate')
  return b.finish('opening')
}

function moonflowerRelease(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Moonflower Release', ['matrix', 'ring'], ['#12091d', '#9857cc', '#ffd4b0'])
  // At size 0.5 a lobe reaches the matrix edge at A and B of 1. The flower
  // turns anticlockwise at 1.5 rad/s (85.94 degrees/s) per unit of motion.
  b.node('flower', 'ShapeField', {
    shape: 'superformula', size: 0.5, softness: 0.015,
    symmetry: 8, n1: 0.55, n2: 1.35, n3: 1.35, a: 0.82, b: 0.82,
  })
  b.node('flowerSpin', 'Math', { mathOp: 'multiply', b: -85.94 })
  b.wire('motion', 'result', 'flowerSpin', 'a').wire('flowerSpin', 'result', 'flower', 'spin')
  const opening = b.map('petalOpening', 'buildup', 'result', 0.4, 1.2)
  const breath = b.map('petalBreath', 'fft', 'bass', 0.72, 1.06)
  b.wire(opening, 'result', 'flower', 'n1').wire(breath, 'result', 'flower', 'a').wire(breath, 'result', 'flower', 'b')
  // Multiply the silhouette by a radial palette field to keep its interior textured.
  b.node('radial', 'GradientField', { gradientType: 'radial', repeat: 3 })
  b.wire('phase', 'bar', 'radial', 'offset')
  b.node('texture', 'FieldMath', { fieldOp: 'multiply' })
  b.wire('flower', 'field', 'texture', 'a').wire('radial', 'field', 'texture', 'b')
  const frame = shade(b, 'texture')
  const zoom = b.map('bloom', 'dropEnvelope', 'result', 1, 1.5)
  b.node('blooming', 'FrameTransform', { mode: 'smooth', edgeMode: 'clamp', sampling: 'bilinear' })
  b.wire(frame, 'frame', 'blooming', 'frame').wire(zoom, 'result', 'blooming', 'scale')
  return b.finish('blooming')
}

function interferenceLoom(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('Interference Loom', ['matrix'], ['#050e1f', '#1d8dcc', '#f29dca'])
  b.node('weave', 'GeometryField', { formulaType: 'lissajousField', freqA: 3, freqB: 2, thickness: 0.14 })
  b.wire('motion', 'result', 'weave', 'speed')
  const width = b.map('weaveWidth', 'buildup', 'result', 0.14, 0.24)
  b.wire(width, 'result', 'weave', 'thickness')
  pitchHold(b, 'heldMode', 'note', 'confidence', 'song', 'downbeat', 60)
  // Low integer ratios respect the field node's 48-sample curve budget.
  const frequency = b.map('weaveFrequency', 'heldMode', 'result', 2, 3, 42, 84)
  b.node('integerMode', 'Function', { fn: 'round' })
  b.wire(frequency, 'result', 'integerMode', 'x').wire('integerMode', 'result', 'weave', 'freqA')
  const tilt = b.map('dropTurn', 'dropEnvelope', 'result', 0, 60)
  b.node('rotateWeave', 'FieldWarp', { edgeMode: 'wrap' })
  b.wire('weave', 'field', 'rotateWeave', 'field').wire(tilt, 'result', 'rotateWeave', 'angle')
  const frame = shade(b, 'rotateWeave')
  b.node('silkTrails', 'Trails', { decay: 0.34 })
  b.wire(frame, 'frame', 'silkTrails', 'frame')
  const decay = b.map('tail', 'vibe', 'trebleAtt', 0.28, 0.6, 0, 2.5)
  b.wire(decay, 'result', 'silkTrails', 'decay')
  return b.finish('silkTrails')
}

function stringMeteorPact(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('String Meteor Pact', ['string'], ['#06121c', '#0a8fbd', '#ffb77a'])
  b.node('meteors', 'StringParticles', { mode: 'meteors', track: 'row', count: 32, bed: 0.13, trail: 0.5, seed: 841 })
  b.wire('palette', 'palette', 'meteors', 'paletteIn')
  const dropSpeed = b.map('dropSpeed', 'dropEnvelope', 'result', 0, 0.3)
  b.node('launchSpeed', 'Math', { mathOp: 'add' })
  b.wire('motion', 'result', 'launchSpeed', 'a').wire(dropSpeed, 'result', 'launchSpeed', 'b')
  b.wire('launchSpeed', 'result', 'meteors', 'speed')
  // A bass spike or drop launches a head and its counter-moving debris.
  b.node('launch', 'Logic', { logicOp: 'or' })
  b.wire('vibe', 'bassSpike', 'launch', 'a').wire('song', 'drop', 'launch', 'b')
  b.wire('launch', 'result', 'meteors', 'trigger')
  const spawn = b.map('dust', 'band', 'level', 0.015, 0.5)
  const trail = b.map('chargingTail', 'buildup', 'result', 0.38, 0.68)
  b.wire(spawn, 'result', 'meteors', 'spawn').wire(trail, 'result', 'meteors', 'trail')
  const sparkle = b.map('impactDust', 'dropEnvelope', 'result', 0, 0.15)
  b.node('debris', 'Glitter', { r: 145, g: 210, b: 255, seed: 842 })
  b.wire('meteors', 'frame', 'debris', 'frame').wire(sparkle, 'result', 'debris', 'density')
  return b.finish('debris')
}

function stringStereoLanterns(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('String Stereo Lanterns', ['string'], ['#16091c', '#c84b7c', '#ffd2a0'])
  b.node('coolPalette', 'Poline', { anchorA: '#041b20', anchorB: '#29aaa8', anchorC: '#b2e5ff', points: 6 })
  b.node('warm', 'Scanner', { width: 2, trail: 0.61, axis: 'horizontal' })
  b.node('cool', 'Scanner', { width: 2, trail: 0.61, axis: 'horizontal' })
  b.wire('palette', 'palette', 'warm', 'paletteIn').wire('coolPalette', 'palette', 'cool', 'paletteIn')
  const leftSpeed = b.map('leftSpeed', 'stereo', 'left', 0.035, 0.6)
  const rightSpeed = b.map('rightSpeed', 'stereo', 'right', 0.035, 0.6)
  const width = b.map('lanternWidth', 'buildup', 'result', 1.4, 7)
  b.wire(leftSpeed, 'result', 'warm', 'speed').wire(rightSpeed, 'result', 'cool', 'speed')
  b.wire(width, 'result', 'warm', 'width').wire(width, 'result', 'cool', 'width')
  b.node('reverse', 'FrameTransform', { flipX: true })
  b.wire('cool', 'frame', 'reverse', 'frame')
  b.node('lanterns', 'Blend', { blendMode: 'screen', amount: 0.5 })
  b.wire('warm', 'frame', 'lanterns', 'a').wire('reverse', 'frame', 'lanterns', 'b')
  const balance = b.map('balance', 'stereo', 'balance', 0.22, 0.9)
  b.wire(balance, 'result', 'lanterns', 'amount')
  b.node('burst', 'StringParticles', { mode: 'meteors', track: 'row', count: 24, bed: 0, spawn: 0.01, trail: 0.55, seed: 843 })
  b.wire('coolPalette', 'palette', 'burst', 'paletteIn').wire('song', 'drop', 'burst', 'trigger')
  const burstSpeed = b.map('burstSpeed', 'dropEnvelope', 'result', 0.16, 0.9)
  b.wire(burstSpeed, 'result', 'burst', 'speed')
  b.node('celebration', 'Blend', { blendMode: 'add', amount: 0.65 })
  b.wire('lanterns', 'frame', 'celebration', 'a').wire('burst', 'frame', 'celebration', 'b')
  return b.finish('celebration')
}

function stringHarmonicTide(): AudioReleaseSeed {
  const b = new AudioReleaseBuilder('String Harmonic Tide', ['string'], ['#091929', '#178ac0', '#d9ccff'])
  pitchHold(b, 'noteColor', 'keyRoot', 'keyConfidence', 'pitch', 'noteOn', 2)
  const hue = b.map('keyHue', 'noteColor', 'result', 175, 315, 0, 11)
  const spread = b.map('harmonySpread', 'buildup', 'result', 0.2, 0.9)
  b.node('harmony', 'HarmonyPalette', { harmony: 'analogous', saturation: 0.8, value: 0.9 })
  b.wire(hue, 'result', 'harmony', 'hue').wire(spread, 'result', 'harmony', 'spread')
  b.node('musicalPalette', 'PaletteBlend', { amount: 0.35 })
  b.wire('palette', 'palette', 'musicalPalette', 'paletteA').wire('harmony', 'palette', 'musicalPalette', 'paletteB')
  b.node('barColor', 'PaletteTransform')
  b.wire('musicalPalette', 'palette', 'barColor', 'paletteIn').wire('phase', 'bar', 'barColor', 'offset')
  b.node('tide', 'PaletteGradient', { angle: 0, repeat: 1.4 })
  b.wire('barColor', 'palette', 'tide', 'paletteIn').wire('motion', 'result', 'tide', 'speed')
  const folds = b.map('folds', 'energy', 'result', 1, 4)
  b.wire(folds, 'result', 'tide', 'repeat')
  b.node('tideBed', 'BrightnessMod', { brightness: 0.26 })
  b.wire('tide', 'frame', 'tideBed', 'frame')
  b.node('foam', 'StringParticles', { mode: 'drift', track: 'row', count: 20, trail: 0.47, seed: 844 })
  b.wire('barColor', 'palette', 'foam', 'paletteIn').wire('motion', 'result', 'foam', 'speed')
  const foam = b.map('foamDensity', 'band', 'level', 0.005, 0.28)
  b.wire(foam, 'result', 'foam', 'spawn')
  b.node('shore', 'Blend', { blendMode: 'screen', amount: 0.8 })
  b.wire('tideBed', 'frame', 'shore', 'a').wire('foam', 'frame', 'shore', 'b')
  const surge = b.map('surge', 'dropEnvelope', 'result', 0, 0.22)
  b.node('spray', 'Glitter', { r: 162, g: 205, b: 255, seed: 845 })
  b.wire('shore', 'frame', 'spray', 'frame').wire(surge, 'result', 'spray', 'density')
  return b.finish('spray')
}

/** Four spatial studies and three line-native studies, each with its own musical response. */
export const RELEASE_AUDIO_B_SEEDS: AudioReleaseSeed[] = [
  resonantVelvet(), silkAttractor(), moonflowerRelease(), interferenceLoom(),
  stringMeteorPact(), stringStereoLanterns(), stringHarmonicTide(),
]

export const RELEASE_AUDIO_B_DESCRIPTIONS: Record<string, string> = {
  'Resonant Velvet': 'Pitch selects a stable Chladni mode. Energy rotates the standing waves; a buildup adds modal complexity, and a drop turns the plate through 45 degrees. A presence band controls the contour contrast.',
  'Silk Attractor': 'A de Jong attractor draws turquoise and gold filaments. Energy adds threads, relative mids thicken them, and buildups extend their persistence. Drops open the woven form; stereo balance tilts it.',
  'Moonflower Release': 'A lavender superformula flower breathes with bass over a bar-synchronised radial texture. Buildups open its petals, then drops expand the entire bloom.',
  'Interference Loom': 'A held, confident pitch selects low integer Lissajous ratios. Energy animates the weave, buildups thicken its strands, and drops turn the loom. Relative treble controls the trailing silk.',
  'String Meteor Pact': 'A quiet blue dust bed supports meteors with counter-moving debris. Bass spikes and drops launch heads, a presence band adds dust, buildups lengthen tails, and drops scatter a cool sparkle cloud.',
  'String Stereo Lanterns': 'Warm and cool scanners respond independently to left and right channel levels. Stereo balance mixes the lanterns, buildups widen them, and drops launch a separate turquoise meteor shower.',
  'String Harmonic Tide': 'Confident musical key colours a restrained moving tide. Bar phase scrolls its palette, energy adds folds, and a presence band adds foam. Buildups widen its colour harmony; drops add cold spray.',
}
