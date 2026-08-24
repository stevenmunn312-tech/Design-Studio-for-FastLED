import { describe, it, expect } from 'vitest'
import { isHardwareLibraryHiddenNodeType, isHardwareManagedSignalNodeType } from '../hardware'
import { NODE_LIBRARY, NODE_DESCRIPTIONS, PORT_COLORS, portColor, propertyMeta, propertyDescription, propertyLabel, PROPERTY_DESCRIPTIONS, PROPERTY_DESCRIPTIONS_OVERRIDES, isPropertyEnabled, isGpioPinProperty, gpioRequirementForProperty, nodeDisplayLabel } from '../nodeLibrary'
import { EASE_TYPES } from '../easing'

describe('nodeLibrary', () => {
  it('defines dedicated semantic Music Player control and particle bundles', () => {
    const controls = NODE_LIBRARY.find((n) => n.type === 'PlayerControls')
    expect(controls).toMatchObject({
      label: 'Player Controls',
      category: 'show',
      outputs: [{ id: 'controls', dataType: 'playercontrols' }],
    })
    expect(controls?.inputs.map(({ id, dataType }) => [id, dataType])).toEqual([
      ['controlsIn', 'playercontrols'], ['playPause', 'bool'], ['previous', 'bool'],
      ['next', 'bool'], ['volume', 'float'], ['volumeUp', 'bool'],
      ['volumeDown', 'bool'], ['ledToggle', 'bool'], ['brightness', 'float'],
      ['brightnessUp', 'bool'], ['brightnessDown', 'bool'],
    ])

    const particles = NODE_LIBRARY.find((n) => n.type === 'PlayerParticles')
    expect(particles).toMatchObject({
      label: 'Player Particles',
      category: 'show',
      outputs: [{ id: 'particleFx', dataType: 'playerparticles' }],
      defaultProperties: { enabled: false, style: 0, intensity: 0.8 },
    })

    const player = NODE_LIBRARY.find((n) => n.type === 'PatternMaster')!
    expect(player.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'controls', dataType: 'playercontrols' }),
      expect.objectContaining({ id: 'particleFx', dataType: 'playerparticles' }),
    ]))
    expect(player.inputs.map((p) => p.id)).not.toEqual(expect.arrayContaining([
      'particles', 'particleColor', 'particleIntensity', 'randomColor', 'randomStyle',
    ]))
    expect(player.defaultProperties).not.toHaveProperty('particles')
    expect(PORT_COLORS).toMatchObject({ playercontrols: expect.any(String), playerparticles: expect.any(String) })
  })

  it('exposes an Audio capability source with an explicit audio output', () => {
    const audio = NODE_LIBRARY.find((node) => node.type === 'Audio')
    expect(audio).toMatchObject({
      category: 'input',
      defaultProperties: { sourceId: '' },
      outputs: [{ id: 'audio', dataType: 'audio' }],
    })
  })

  it('keeps PCM1802 line in hardware-created and signal-carrying', () => {
    const lineIn = NODE_LIBRARY.find((node) => node.type === 'LineInput')
    expect(lineIn).toMatchObject({
      label: 'Line In',
      outputs: [{ id: 'audio', dataType: 'audio' }],
      defaultProperties: { partId: 'pcm1802-line-in-adc', channel: 'Both' },
    })
    expect(isHardwareLibraryHiddenNodeType('LineInput')).toBe(true)
    expect(isHardwareManagedSignalNodeType('LineInput')).toBe(true)
    expect(gpioRequirementForProperty('LineInput', 'i2sDout', {})).toEqual({
      capability: 'digitalInput', pullup: false,
    })
    expect(gpioRequirementForProperty('LineInput', 'i2sMclk', {})).toEqual({
      capability: 'digitalOutput', pullup: false,
    })
  })

  it('gives Image nodes placement and transform defaults', () => {
    expect(NODE_LIBRARY.find((n) => n.type === 'Image')?.defaultProperties).toEqual({
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
      playbackRate: 1,
      loop: true,
    })
  })

  it('gives the Image node animation playback defaults', () => {
    // The Image node handles both stills and animations, so it carries the
    // playback defaults too (AnimatedImage was merged into it).
    expect(NODE_LIBRARY.find((n) => n.type === 'Image')?.defaultProperties).toMatchObject({
      playbackRate: 1,
      loop: true,
      sampling: 'nearest',
      paletteLevels: 'full',
    })
    expect(NODE_LIBRARY.find((n) => n.type === 'AnimatedImage')).toBeUndefined()
  })

  it('connects Image data to a bounded palette extraction node', () => {
    const image = NODE_LIBRARY.find((n) => n.type === 'Image')
    const extract = NODE_LIBRARY.find((n) => n.type === 'PaletteFromImage')
    expect(image?.outputs).toContainEqual({ id: 'image', label: 'Image Data', dataType: 'image' })
    expect(extract).toMatchObject({
      category: 'color',
      subcategory: 'Palettes',
      inputs: [{ id: 'image', label: 'Image', dataType: 'image' }],
      outputs: [{ id: 'palette', label: 'Palette', dataType: 'palette' }],
      defaultProperties: { count: 6 },
    })
    expect(propertyMeta('PaletteFromImage', 'count')).toEqual({
      control: 'slider',
      min: 2,
      max: 8,
      step: 1,
    })
    expect(propertyLabel('PaletteFromImage', 'count')).toBe('Colors')
  })

  it('ships matrix-relative Line defaults', () => {
    expect(NODE_LIBRARY.find((n) => n.type === 'Line')?.defaultProperties).toMatchObject({
      x1: 0, y1: 0, x2: 'W-1', y2: 'H-1',
    })
  })

  it('makes RadialBurst ring density and KickShock tiling functional controls', () => {
    const radial = NODE_LIBRARY.find((n) => n.type === 'RadialBurst')
    const shock = NODE_LIBRARY.find((n) => n.type === 'KickShock')
    expect(radial?.inputs.find((port) => port.id === 'arms')?.label).toBe('Rings')
    expect(radial?.defaultProperties).toMatchObject({ arms: 8 })
    expect(propertyMeta('RadialBurst', 'arms')).toMatchObject({ control: 'slider', min: 1, max: 32 })
    expect(shock?.defaultProperties).toMatchObject({ tiles: 1 })
    expect(propertyMeta('KickShock', 'tiles')).toMatchObject({ control: 'slider', min: 1, max: 8 })
  })

  it('gives formula nodes editable inputs and in-app vocabulary help', () => {
    expect(NODE_LIBRARY.find((n) => n.type === 'CustomFormula')?.defaultProperties).toMatchObject({ a: 0, b: 0 })
    expect(propertyDescription('CustomFormula', 'formula')).toMatch(/x, y, t.*sin8/)
    expect(propertyDescription('FieldFormula', 'formula')).toMatch(/beatsin8.*fieldIn/)
  })

  it('every node in the shelf has a tooltip description', () => {
    const missing = NODE_LIBRARY.filter((n) => !NODE_DESCRIPTIONS[n.type]).map((n) => n.type)
    expect(missing).toEqual([])
  })

  // A colour for a dataType nothing carries tints a handle that cannot exist;
  // a live dataType with no colour silently falls back to the float/bool grey
  // and stops reading as its own type. Both are drift, so both are caught.
  it('colours exactly the port dataTypes that exist', () => {
    const live = new Set<string>()
    for (const node of NODE_LIBRARY) {
      for (const port of node.inputs) live.add(port.dataType)
      for (const port of node.outputs) live.add(port.dataType)
    }
    expect(live.size).toBeGreaterThan(8)
    expect(Object.keys(PORT_COLORS).filter((t) => !live.has(t))).toEqual([])
    expect([...live].filter((t) => !(t in PORT_COLORS)).sort()).toEqual([])
  })

  it('descriptions are concise single lines', () => {
    for (const [type, desc] of Object.entries(NODE_DESCRIPTIONS)) {
      expect(desc, type).not.toContain('\n')
      expect(desc.length, type).toBeLessThanOrEqual(80)
    }
  })

  it('property tooltip descriptions are single lines with no per-node override collisions', () => {
    for (const [key, desc] of Object.entries(PROPERTY_DESCRIPTIONS)) {
      expect(desc, key).not.toContain('\n')
    }
    for (const [nodeType, overrides] of Object.entries(PROPERTY_DESCRIPTIONS_OVERRIDES)) {
      for (const [key, desc] of Object.entries(overrides)) {
        expect(desc, `${nodeType}.${key}`).not.toContain('\n')
      }
    }
  })

  it('propertyDescription prefers a per-node override over the generic description', () => {
    expect(propertyDescription('Fire', 'direction')).toBe('Which way the flame rises.')
    expect(propertyDescription('Transition', 'direction')).toBe('Slide direction for the Wipe / Push styles.')
    expect(propertyDescription('SDCard', 'audioOutput')).toBe(PROPERTY_DESCRIPTIONS.audioOutput)
    expect(propertyDescription('Circle', 'nonexistentProp')).toBeUndefined()
  })

  it('port colours: float/bool share a colour; distinct types differ', () => {
    expect(portColor('float')).toBe(portColor('bool'))     // cross-compatible
    expect(portColor('frame')).not.toBe(portColor('color'))
    expect(portColor('palette')).not.toBe(portColor('audio'))
    expect(portColor('mystery')).toBe(portColor('float'))  // unknown → default
  })

  it('HueCycle exposes a bounded cycles-per-second color source', () => {
    const hueCycle = NODE_LIBRARY.find((n) => n.type === 'HueCycle')
    expect(hueCycle?.category).toBe('color')
    expect(hueCycle?.inputs.map((port) => port.id)).toEqual(['rate', 's', 'v'])
    expect(hueCycle?.outputs).toEqual([{ id: 'color', label: 'Color', dataType: 'color' }])
    expect(hueCycle?.defaultProperties).toEqual({ rate: 0.1, s: 1, v: 1 })
    expect(propertyMeta('HueCycle', 'rate')).toMatchObject({ control: 'slider', min: 0, max: 4, step: 0.01 })
  })

  it('PaletteSweep bundles palette sampling, round-trip rate, and easing', () => {
    const sweep = NODE_LIBRARY.find((n) => n.type === 'PaletteSweep')
    expect(sweep?.category).toBe('color')
    expect(sweep?.inputs.map((port) => port.id)).toEqual(['paletteIn', 'rate'])
    expect(sweep?.outputs).toEqual([{ id: 'color', label: 'Color', dataType: 'color' }])
    expect(sweep?.defaultProperties).toEqual({ palette: 'rainbow', rate: 0.1, easing: 'sine' })
    expect(propertyMeta('PaletteSweep', 'rate')).toMatchObject({ control: 'slider', min: 0, max: 4, step: 0.01 })
    expect(propertyMeta('PaletteSweep', 'easing')).toEqual({
      control: 'select', options: ['linear', 'sine', 'quad', 'cubic'],
    })
  })

  it('BeatDetect sliders use a narrow, beat-friendly range', () => {
    expect(NODE_LIBRARY.find((n) => n.type === 'BeatDetect')?.defaultProperties).toMatchObject({
      threshold: 0.2,
      attack: 0.55,
      decay: 0.25,
    })
    expect(propertyMeta('BeatDetect', 'threshold')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('BeatDetect', 'attack')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('BeatDetect', 'decay')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('BeatDetect exposes its internal tuning diagnostics as outputs', () => {
    const bd = NODE_LIBRARY.find((n) => n.type === 'BeatDetect')
    expect(bd?.outputs.map((p) => p.id)).toEqual([
      'beat', 'bpm', 'flux', 'onset', 'contrast', 'threshold', 'cooldownMs',
    ])
  })

  it('PercussionDetect exposes kick/snare/hihat with tunable heuristics', () => {
    const pd = NODE_LIBRARY.find((n) => n.type === 'PercussionDetect')
    expect(pd?.category).toBe('audio')
    expect(pd?.outputs.map((p) => p.id)).toEqual(['kick', 'snare', 'hihat'])
    expect(pd?.defaultProperties).toMatchObject({ sensitivity: 0.55, decay: 0.72, separation: 0.4 })
    expect(propertyMeta('PercussionDetect', 'sensitivity')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('PercussionDetect', 'separation')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('AudioFeatures exposes vocals, energy, and silence controls in Audio', () => {
    const af = NODE_LIBRARY.find((n) => n.type === 'AudioFeatures')
    expect(af?.category).toBe('audio')
    expect(af?.outputs.map((p) => p.id)).toEqual(['vocals', 'energy', 'silence'])
    expect(af?.defaultProperties).toMatchObject({ sensitivity: 0.5, gate: 0.12, smoothing: 0.8 })
    expect(propertyMeta('AudioFeatures', 'gate')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('AudioFeatures', 'smoothing')).toMatchObject({ control: 'slider', min: 0, max: 0.95 })
  })

  it("AudioFeatures.gate has a display label and tooltip explaining what it gates", () => {
    expect(propertyLabel('AudioFeatures', 'gate')).toBe('Silence Gate')
    expect(propertyDescription('AudioFeatures', 'gate')).toMatch(/silence/i)
  })

  it('AudioHue has default properties so it renders without being wired', () => {
    const audioHue = NODE_LIBRARY.find((n) => n.type === 'AudioHue')
    expect(audioHue?.defaultProperties).toEqual({
      bass: 0.5, mids: 0.5, treble: 0.5,
      bassWeight: 0.5, midsWeight: 0.3, trebleWeight: 0.2,
    })
  })

  it('AudioHue exposes its band mix as bounded, labelled weights', () => {
    for (const key of ['bassWeight', 'midsWeight', 'trebleWeight']) {
      expect(propertyMeta('AudioHue', key)).toEqual({ control: 'slider', min: 0, max: 1, step: 0.01 })
      expect(propertyDescription('AudioHue', key)).toMatch(/contributes to the hue/i)
    }
    expect(propertyLabel('AudioHue', 'bassWeight')).toBe('bass weight')
    expect(propertyLabel('AudioHue', 'midsWeight')).toBe('mids weight')
    expect(propertyLabel('AudioHue', 'trebleWeight')).toBe('treble weight')
  })

  it("FFTAnalyzer's bands tooltip explains its resample resolution", () => {
    expect(propertyDescription('FFTAnalyzer', 'bands')).toMatch(/resample|resolution/i)
  })

  it('MicInput exposes FastLED processor gain without obsolete custom gate controls', () => {
    const mic = NODE_LIBRARY.find((n) => n.type === 'MicInput')
    expect(mic?.category).toBe('input')
    expect(mic?.defaultProperties).toMatchObject({
      gain: 1,
    })
    expect(mic?.defaultProperties).not.toHaveProperty('agc')
    expect(mic?.defaultProperties).not.toHaveProperty('threshold')
    expect(mic?.defaultProperties).not.toHaveProperty('attack')
    expect(mic?.defaultProperties).not.toHaveProperty('decay')
    expect(mic?.defaultProperties).not.toHaveProperty('sampleRate')
    expect(propertyMeta('MicInput', 'gain')).toMatchObject({ control: 'slider', min: 0, max: 20 })
  })

  it('AudioFlow exposes speed/scale as normalized animatable inputs', () => {
    const af = NODE_LIBRARY.find((n) => n.type === 'AudioFlow')
    expect(af?.inputs.map((p) => p.id)).toEqual(['bass', 'mids', 'treble', 'speed', 'scale', 'paletteIn'])
    expect(af?.defaultProperties).toMatchObject({ speed: 0.5, scale: 0.5, palette: 'rainbow' })
    expect(propertyMeta('AudioFlow', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('AudioFlow', 'scale')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('ColorTrails exposes autonomous flow controls plus optional audio modulation', () => {
    const trails = NODE_LIBRARY.find((n) => n.type === 'ColorTrails')
    expect(trails?.subcategory).toBe('Audio-Reactive')
    expect(NODE_DESCRIPTIONS.ColorTrails).toContain('Stefan Petrick')
    expect(trails?.inputs.map((p) => p.id)).toEqual(['bass', 'mids', 'treble', 'beat', 'paletteIn'])
    expect(trails?.defaultProperties).toMatchObject({
      injectionMode: 'Moving Line', flowMode: 'Scrolling',
      xSpeed: 0.1, xAmplitude: 1, xFrequency: 0.33,
      ySpeed: 0.1, yAmplitude: 1, yFrequency: 0.32,
      displacement: 1.8, endpointSpeed: 0.35, colorSpeed: 0.1,
      persistence: 0.99922, palette: 'rainbow', seed: 42,
    })
    expect(propertyMeta('ColorTrails', 'xSpeed')).toMatchObject({ control: 'slider', min: -2, max: 2 })
    expect(propertyMeta('ColorTrails', 'injectionMode')).toMatchObject({ control: 'select', options: ['Moving Line', 'Rainbow Border', 'Both'] })
    expect(propertyMeta('ColorTrails', 'flowMode')).toMatchObject({ control: 'select', options: ['Scrolling', 'Morphing 2D'] })
    expect(propertyMeta('ColorTrails', 'displacement')).toMatchObject({ control: 'slider', min: 0, max: 4 })
    expect(propertyMeta('ColorTrails', 'persistence')).toMatchObject({ control: 'slider', min: 0.9, max: 0.9999 })
  })

  it('AnimARTrix exposes the credited five-effect audio-reactive instrument', () => {
    const animartrix = NODE_LIBRARY.find((n) => n.type === 'Animartrix')
    expect(animartrix?.label).toBe('AnimARTrix')
    expect(animartrix?.subcategory).toBe('Audio-Reactive')
    expect(NODE_DESCRIPTIONS.Animartrix).toContain('Stefan Petrick')
    expect(animartrix?.inputs.map((p) => p.id)).toEqual([
      'bass', 'mids', 'treble', 'kick', 'snare', 'hihat', 'beat', 'speed',
    ])
    expect(animartrix?.defaultProperties).toEqual({ effect: 'Water', speed: 0.65, audioAmount: 1 })
    expect(propertyMeta('Animartrix', 'effect')).toMatchObject({
      control: 'select',
      options: ['Water', 'Polar Waves', 'RGB Blobs', 'Spiralus', 'Complex Kaleido'],
    })
    expect(propertyMeta('Animartrix', 'audioAmount')).toMatchObject({ control: 'slider', min: 0, max: 2 })
  })

  it('MidrangeWaves exposes energy, normalized speed, and palette inputs', () => {
    const mw = NODE_LIBRARY.find((n) => n.type === 'MidrangeWaves')
    expect(mw?.inputs.map((p) => p.id)).toEqual(['mids', 'energy', 'speed', 'paletteIn'])
    expect(mw?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, palette: 'ocean' })
    expect(propertyMeta('MidrangeWaves', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('MidrangeWaves', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('SpectrumBars exposes palette-driven energy and speed controls', () => {
    const sb = NODE_LIBRARY.find((n) => n.type === 'SpectrumBars')
    expect(sb?.inputs.map((p) => p.id)).toEqual(['bass', 'mids', 'treble', 'energy', 'speed', 'paletteIn'])
    expect(sb?.defaultProperties).toMatchObject({ energy: 0.7, speed: 0.6, palette: 'rainbow', mirror: true })
    expect(propertyMeta('SpectrumBars', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('SpectrumBars', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('SpectrumVisualizer exposes full-spectrum display and falling-peak controls', () => {
    const visualizer = NODE_LIBRARY.find((n) => n.type === 'SpectrumVisualizer')
    expect(visualizer?.subcategory).toBe('Audio-Reactive')
    expect(visualizer?.inputs.map((p) => p.id)).toEqual(['audio', 'paletteIn'])
    expect(visualizer?.defaultProperties).toMatchObject({
      style: 'Bars', bands: 16, gain: 1.25, smoothing: 0.58, tilt: 0.2,
      peakHold: 0.42, peakGravity: 1.8, waterfallSpeed: 10, palette: 'citrus',
    })
    expect(propertyMeta('SpectrumVisualizer', 'style')).toMatchObject({
      control: 'select', options: ['Bars', 'Centre Mirror', 'Ribbon', 'Orbit', 'Waterfall'],
    })
    expect(propertyMeta('SpectrumVisualizer', 'bands')).toMatchObject({ control: 'slider', min: 4, max: 32 })
    expect(propertyMeta('SpectrumVisualizer', 'peakHold')).toMatchObject({ control: 'slider', min: 0, max: 2 })
    expect(isPropertyEnabled('SpectrumVisualizer', 'peakGravity', { style: 'Bars' })).toBe(true)
    expect(isPropertyEnabled('SpectrumVisualizer', 'peakGravity', { style: 'Waterfall' })).toBe(false)
    expect(isPropertyEnabled('SpectrumVisualizer', 'waterfallSpeed', { style: 'Waterfall' })).toBe(true)
  })

  /*
   * An analog amplifier has no I2S receiver, so offering it BCLK/LRC/DIN would
   * invite three jumpers to pads that do not exist on the board.
   */
  it('hides the I2S pins on an amplifier that takes line level', () => {
    for (const key of ['i2sBclk', 'i2sLrc', 'i2sDout']) {
      expect(isPropertyEnabled('Amplifier', key, { model: 'max98357a-i2s-amplifier' }), key).toBe(true)
      expect(isPropertyEnabled('Amplifier', key, { model: 'pam8403-3w-stereo-amplifier' }), key).toBe(false)
    }
    // Volume is the decoder's, not the amplifier's, so it survives either way.
    expect(isPropertyEnabled('Amplifier', 'maxVolume', { model: 'pam8403-3w-stereo-amplifier' })).toBe(true)
  })

  it('BassRings exposes bass, energy, normalized speed, and palette inputs', () => {
    const br = NODE_LIBRARY.find((n) => n.type === 'BassRings')
    expect(br?.inputs.map((p) => p.id)).toEqual(['bass', 'energy', 'speed', 'paletteIn'])
    expect(br?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, palette: 'lava' })
    expect(propertyMeta('BassRings', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('BassRings', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('MidrangeBloom exposes energy, normalized speed, and palette inputs', () => {
    const mb = NODE_LIBRARY.find((n) => n.type === 'MidrangeBloom')
    expect(mb?.inputs.map((p) => p.id)).toEqual(['mids', 'energy', 'speed', 'paletteIn'])
    expect(mb?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, palette: 'party' })
    expect(propertyMeta('MidrangeBloom', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('MidrangeBloom', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('TrebleSparks exposes a palette input with a cool default', () => {
    const ts = NODE_LIBRARY.find((n) => n.type === 'TrebleSparks')
    expect(ts?.inputs.map((p) => p.id)).toEqual(['treble', 'density', 'paletteIn'])
    expect(ts?.defaultProperties).toMatchObject({ density: 0.5, palette: 'ice' })
  })

  it('TreblePrism exposes energy, normalized speed, and a palette input', () => {
    const tp = NODE_LIBRARY.find((n) => n.type === 'TreblePrism')
    expect(tp?.inputs.map((p) => p.id)).toEqual(['treble', 'energy', 'speed', 'paletteIn'])
    expect(tp?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, palette: 'amethyst' })
    expect(propertyMeta('TreblePrism', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('TreblePrism', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('Confetti exposes normalized speed, palette input, and fading speckle defaults', () => {
    const cf = NODE_LIBRARY.find((n) => n.type === 'Confetti')
    expect(cf?.inputs.map((p) => p.id)).toEqual(['speed', 'paletteIn'])
    expect(cf?.defaultProperties).toMatchObject({ speed: 0.45, density: 0.45, fade: 0.28, palette: 'party' })
    expect(propertyMeta('Confetti', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('Juggle exposes normalized speed, palette input, and a bounded dot count', () => {
    const jg = NODE_LIBRARY.find((n) => n.type === 'Juggle')
    expect(jg?.inputs.map((p) => p.id)).toEqual(['speed', 'paletteIn'])
    expect(jg?.defaultProperties).toMatchObject({ speed: 0.5, count: 4, fade: 0.22, palette: 'rainbow' })
    expect(propertyMeta('Juggle', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('Juggle', 'count')).toMatchObject({ control: 'slider', min: 1, max: 8 })
  })

  it('Path exposes base/color/t inputs with selectable curve presets', () => {
    const path = NODE_LIBRARY.find((n) => n.type === 'Path')
    expect(path?.inputs.map((p) => p.id)).toEqual(['base', 'color', 't', 'scale', 'thickness'])
    expect(path?.defaultProperties).toMatchObject({ pathShape: 'circle', t: 0, scale: 0.8, thickness: 1.25 })
    expect(propertyMeta('Path', 'pathShape')).toMatchObject({ control: 'select' })
    expect((propertyMeta('Path', 'pathShape') as { options?: string[] }).options).toEqual(['circle', 'heart', 'lissajous', 'rose'])
    expect(propertyMeta('Path', 'thickness')).toMatchObject({ control: 'slider', min: 0.5 })
  })

  it('Noise exposes both frame and raw field outputs', () => {
    const nz = NODE_LIBRARY.find((n) => n.type === 'Noise')
    expect(nz?.outputs.map((p) => p.id)).toEqual(['frame', 'field'])
    expect(propertyMeta('Noise', 'noiseType')).toMatchObject({ control: 'select' })
    expect((propertyMeta('Noise', 'noiseType') as { options?: string[] }).options).toContain('noise4d')
  })

  it('ColorBoost exposes a frame input and bounded boost control', () => {
    const cb = NODE_LIBRARY.find((n) => n.type === 'ColorBoost')
    expect(cb?.inputs.map((p) => p.id)).toEqual(['frame', 'boost'])
    expect(cb?.defaultProperties).toMatchObject({ boost: 0.5 })
    expect(propertyMeta('ColorBoost', 'boost')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('BrightnessMod exposes a safe amplification range', () => {
    expect(propertyMeta('BrightnessMod', 'brightness')).toEqual({
      control: 'slider', min: 0, max: 3, step: 0.01,
    })
  })

  it('AudioCascade exposes full-spectrum audio inputs with normalized controls', () => {
    const ac = NODE_LIBRARY.find((n) => n.type === 'AudioCascade')
    expect(ac?.inputs.map((p) => p.id)).toEqual(['bass', 'mids', 'treble', 'energy', 'speed', 'paletteIn'])
    expect(ac?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, palette: 'rainbow' })
    expect(propertyMeta('AudioCascade', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('AudioCascade', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('MusicLibrary shelves with the show pipeline nodes', () => {
    const musicLibrary = NODE_LIBRARY.find((n) => n.type === 'MusicLibrary')
    expect(musicLibrary?.category).toBe('show')
    expect(musicLibrary?.defaultProperties).toEqual({})
  })

  it('RTCInput exposes schedule-friendly clock fields plus firmware clock settings', () => {
    const rtc = NODE_LIBRARY.find((n) => n.type === 'RTCInput')
    expect(rtc?.category).toBe('input')
    expect(rtc?.inputs).toEqual([])
    expect(rtc?.outputs.map((port) => port.id)).toEqual([
      'dateTime', 'valid', 'synced', 'stale', 'hour', 'minute', 'second', 'weekday', 'day', 'month', 'year', 'secondsOfDay', 'weekend',
    ])
    expect(rtc?.defaultProperties).toMatchObject({
      timeSource: 'Compile Time',
      sdaPin: 21,
      sclPin: 22,
      ntpServer: 'pool.ntp.org',
      timezoneOffsetMinutes: 0,
      wifiHostname: 'fastled-clock',
      useDhcp: true,
      startYear: 2026,
      startMonth: 1,
      startDay: 1,
      startHour: 12,
      startMinute: 0,
      startSecond: 0,
    })
    expect(isPropertyEnabled('RTCInput', 'startYear', { timeSource: 'Manual' })).toBe(true)
    expect(isPropertyEnabled('RTCInput', 'startYear', { timeSource: 'Compile Time' })).toBe(false)
    expect(isPropertyEnabled('RTCInput', 'ntpServer', { timeSource: 'NTP' })).toBe(true)
    expect(isPropertyEnabled('RTCInput', 'ntpServer', { timeSource: 'Manual' })).toBe(false)
    expect(isPropertyEnabled('RTCInput', 'sdaPin', { timeSource: 'DS3231' })).toBe(true)
    expect(isPropertyEnabled('RTCInput', 'sdaPin', { timeSource: 'NTP' })).toBe(false)
    expect(propertyMeta('RTCInput', 'timeSource')).toEqual({
      control: 'select',
      options: ['Compile Time', 'Manual', 'NTP', 'DS3231'],
    })
  })

  it('ScheduleTrigger exposes window state, both pulses, and window progress', () => {
    const sched = NODE_LIBRARY.find((n) => n.type === 'ScheduleTrigger')
    expect(sched?.category).toBe('signal')
    expect(sched?.outputs.map((port) => port.id)).toEqual(['active', 'start', 'end', 'progress'])
    // End-of-window fields only make sense for the Window mode.
    expect(isPropertyEnabled('ScheduleTrigger', 'endHour', { scheduleMode: 'Window' })).toBe(true)
    expect(isPropertyEnabled('ScheduleTrigger', 'endHour', { scheduleMode: 'Trigger' })).toBe(false)
  })

  it('ClockDisplay offers RTC-fed clock layouts plus stopwatch/timer controls', () => {
    const clock = NODE_LIBRARY.find((n) => n.type === 'ClockDisplay')
    expect(clock?.category).toBe('pattern')
    expect(clock?.subcategory).toBe('Shapes & Text')
    expect(clock?.inputs.map((port) => port.id)).toEqual([
      'dateTime', 'base', 'color', 'secondsOfDay', 'valid', 'day', 'month', 'run', 'reset', 'durationSec', 'x', 'y', 'radius',
    ])
    expect(clock?.outputs.map((port) => port.id)).toEqual(['frame', 'seconds', 'done'])
    expect(clock?.defaultProperties).toMatchObject({
      displayMode: 'Digital HH:MM',
      x: 0.5,
      y: 0.5,
      radius: 6,
      run: true,
      durationSec: 300,
    })
    expect(propertyMeta('ClockDisplay', 'displayMode')).toEqual({
      control: 'select',
      options: ['Digital HH:MM', 'Digital HH:MM:SS', 'Digital 12H', 'Digital + Date', 'Analog', 'Analog + Date', 'Stopwatch', 'Timer'],
    })
    expect(propertyMeta('ClockDisplay', 'radius')).toMatchObject({ control: 'slider', min: 2, max: 16 })
    expect(propertyLabel('ClockDisplay', 'durationSec')).toBe('duration (s)')
    expect(nodeDisplayLabel('ClockDisplay', { displayMode: 'Analog + Date' }, 'Clock Display')).toBe('Clock · Analog + Date')
    expect(isPropertyEnabled('ClockDisplay', 'radius', { displayMode: 'Analog' })).toBe(true)
    expect(isPropertyEnabled('ClockDisplay', 'radius', { displayMode: 'Digital HH:MM' })).toBe(false)
    expect(isPropertyEnabled('ClockDisplay', 'durationSec', { displayMode: 'Timer' })).toBe(true)
    expect(isPropertyEnabled('ClockDisplay', 'durationSec', { displayMode: 'Stopwatch' })).toBe(false)
  })

  it('bounds Show duration and SD SPI pins to their runtime ranges', () => {
    expect(propertyMeta('Sequencer', 'fade')).toEqual({ control: 'slider', min: 0, max: 20, step: 0.1 })
    for (const key of ['sdCsPin', 'sdSckPin', 'sdMisoPin', 'sdMosiPin']) {
      expect(propertyMeta('SDCard', key), key).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    }
  })

  it('PerformanceGenerator exposes a frame output, which is where its show is going', () => {
    // Not because a normal sketch renders it — it does not; the SD player drives
    // the LEDs from the card. It exists because the destination has to be
    // *stated*: without it the player took its LED config from whichever
    // MatrixOutput came first in the node array, and the canvas showed a chain
    // that stopped in mid-air next to an output asking to be fed.
    // `shows` stays gone: it was a cable to the SD Card, which is a bench part.
    expect(NODE_LIBRARY.find((n) => n.type === 'PerformanceGenerator')?.outputs).toEqual([
      { id: 'frame', label: 'Show', dataType: 'frame' },
    ])
    expect(NODE_LIBRARY.find((n) => n.type === 'PerformanceGenerator')?.defaultProperties).toMatchObject({
      useGroupInputs: true,
      showInMainPreview: false,
    })
  })

  it('adds the PIR and LDR as bench parts, not sidebar nodes', () => {
    // Both are physical modules, so they follow the same rule every other part
    // does: they exist because they are on the hardware view. Draggable from
    // the sidebar, a graph could claim a sensor no board is wired to.
    for (const type of ['MotionInput', 'LightInput']) {
      const def = NODE_LIBRARY.find((n) => n.type === type)
      expect(def, type).toBeTruthy()
      expect(def!.category).toBe('input')
      expect(isHardwareLibraryHiddenNodeType(type), type).toBe(true)
      expect(isHardwareManagedSignalNodeType(type), type).toBe(true)
    }

    expect(NODE_LIBRARY.find((n) => n.type === 'MotionInput')!.outputs)
      .toEqual([{ id: 'motion', label: 'Motion', dataType: 'bool' }])
    expect(NODE_LIBRARY.find((n) => n.type === 'LightInput')!.outputs)
      .toEqual([{ id: 'level', label: 'Level', dataType: 'float' }])
  })

  it('Particles gates its extra variant-specific controls by particleType', () => {
    const p = NODE_LIBRARY.find((n) => n.type === 'Particles')
    expect(p?.defaultProperties).toMatchObject({ size: 1, count: 24, spread: 1, gravity: 1, bounce: 1 })
    expect(propertyMeta('Particles', 'size')).toMatchObject({ control: 'slider', min: 0.25, max: 3 })

    // `size` applies to every mode; the rest are gated to the modes that read them.
    expect(isPropertyEnabled('Particles', 'size', { particleType: 'fountain' })).toBe(true)
    expect(isPropertyEnabled('Particles', 'size', { particleType: 'swarm' })).toBe(true)

    expect(isPropertyEnabled('Particles', 'count', { particleType: 'swarm' })).toBe(true)
    expect(isPropertyEnabled('Particles', 'count', { particleType: 'orbit' })).toBe(true)
    expect(isPropertyEnabled('Particles', 'count', { particleType: 'fountain' })).toBe(false)

    expect(isPropertyEnabled('Particles', 'spread', { particleType: 'fountain' })).toBe(true)
    expect(isPropertyEnabled('Particles', 'spread', { particleType: 'comet' })).toBe(false)

    expect(isPropertyEnabled('Particles', 'gravity', { particleType: 'gravity' })).toBe(true)
    expect(isPropertyEnabled('Particles', 'gravity', { particleType: 'snow' })).toBe(false)

    expect(isPropertyEnabled('Particles', 'bounce', { particleType: 'gravity' })).toBe(true)
    expect(isPropertyEnabled('Particles', 'bounce', { particleType: 'fountain' })).toBe(false)
  })

  it('Fire and Fire2012 share the direction/turbulence/paletteMix/mirror/seed controls', () => {
    for (const type of ['Fire', 'Fire2012']) {
      const n = NODE_LIBRARY.find((nd) => nd.type === type)
      expect(n?.defaultProperties, type).toMatchObject({
        direction: 'up', turbulence: 1, paletteMix: 1, mirror: false, seed: 0,
      })
      expect(propertyMeta(type, 'direction'), type).toMatchObject({ control: 'select' })
      expect((propertyMeta(type, 'direction') as { options?: string[] }).options, type)
        .toEqual(['up', 'down', 'left', 'right'])
      expect(propertyMeta(type, 'turbulence'), type).toMatchObject({ control: 'slider', min: 0, max: 2 })
      expect(propertyMeta(type, 'paletteMix'), type).toMatchObject({ control: 'slider', min: 0, max: 1 })
    }
  })

  it('Comment has no ports and a text + color default', () => {
    const c = NODE_LIBRARY.find((n) => n.type === 'Comment')
    expect(c?.category).toBe('note')
    expect(c?.inputs).toEqual([])
    expect(c?.outputs).toEqual([])
    expect(c?.defaultProperties).toMatchObject({ text: 'Note', color: '#ffd24a' })
  })

  it('bounds the Input category GPIO fallback to Arduino numeric pin aliases', () => {
    expect(propertyMeta('MicInput', 'i2sWs')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('MicInput', 'i2sSck')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('MicInput', 'i2sSd')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('ButtonInput', 'pin')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('PotInput', 'pin')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('EncoderInput', 'pinA')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('EncoderInput', 'pinB')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('EncoderInput', 'pinSW')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
  })

  it('bounds MidiInput note/cc to a 0-127 slider', () => {
    expect(propertyMeta('MidiInput', 'note')).toEqual({ control: 'slider', min: 0, max: 127, step: 1 })
    expect(propertyMeta('MidiInput', 'cc')).toEqual({ control: 'slider', min: 0, max: 127, step: 1 })
  })

  it('flags hardware-input and SDCard GPIO properties for the board-aware picker', () => {
    expect(isGpioPinProperty('MicInput', 'i2sWs')).toBe(true)
    expect(isGpioPinProperty('MicInput', 'i2sSck')).toBe(true)
    expect(isGpioPinProperty('MicInput', 'i2sSd')).toBe(true)
    expect(isGpioPinProperty('MicInput', 'gain')).toBe(false)
    expect(isGpioPinProperty('ButtonInput', 'pin')).toBe(true)
    expect(isGpioPinProperty('PotInput', 'pin')).toBe(true)
    expect(isGpioPinProperty('EncoderInput', 'pinA')).toBe(true)
    expect(isGpioPinProperty('EncoderInput', 'pinB')).toBe(true)
    expect(isGpioPinProperty('EncoderInput', 'pinSW')).toBe(true)
    expect(isGpioPinProperty('EncoderInput', 'resetOnPress')).toBe(false)
    expect(isGpioPinProperty('SDCard', 'sdCsPin')).toBe(true)
    expect(isGpioPinProperty('SDCard', 'sdSckPin')).toBe(true)
    expect(isGpioPinProperty('SDCard', 'sdMisoPin')).toBe(true)
    expect(isGpioPinProperty('SDCard', 'sdMosiPin')).toBe(true)
    expect(isGpioPinProperty('SDCard', 'i2sBclk')).toBe(false)
    expect(isGpioPinProperty('SDCard', 'maxVolume')).toBe(false)
    expect(isGpioPinProperty('MatrixOutput', 'dataPin')).toBe(true)
    expect(isGpioPinProperty('MatrixOutput', 'clockPin')).toBe(true)
    expect(isGpioPinProperty('MatrixOutput', 'brightness')).toBe(false)
    expect(isGpioPinProperty('MatrixOutput', 'hub75R1Pin')).toBe(true)
    expect(isGpioPinProperty('MatrixOutput', 'hub75OePin')).toBe(true)
    expect(isGpioPinProperty('MatrixOutput', 'hub75ColorDepthBits')).toBe(false)
  })

  it('assigns electrical requirements to generated pin roles', () => {
    expect(gpioRequirementForProperty('PotInput', 'pin', {})).toEqual({
      capability: 'analogInput',
      pullup: false,
    })
    expect(gpioRequirementForProperty('ButtonInput', 'pin', { pullup: true })).toEqual({
      capability: 'digitalInput',
      pullup: true,
    })
    expect(gpioRequirementForProperty('EncoderInput', 'pinA', { pullup: false })).toEqual({
      capability: 'digitalInput',
      pullup: false,
    })
    expect(gpioRequirementForProperty('MicInput', 'i2sSd', {})).toEqual({
      capability: 'digitalInput',
      pullup: false,
    })
    expect(gpioRequirementForProperty('MicInput', 'i2sSck', {})).toEqual({
      capability: 'digitalOutput',
      pullup: false,
    })
    expect(gpioRequirementForProperty('SDCard', 'sdMisoPin', {})).toEqual({
      capability: 'digitalInput',
      pullup: false,
    })
    expect(gpioRequirementForProperty('SDCard', 'sdMosiPin', {})).toEqual({
      capability: 'digitalOutput',
      pullup: false,
    })
  })

  it('bounds MatrixOutput pins to the shared GPIO range', () => {
    expect(propertyMeta('MatrixOutput', 'dataPin')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('MatrixOutput', 'clockPin')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('MatrixOutput', 'hub75R1Pin')).toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    expect(propertyMeta('MatrixOutput', 'hub75ColorDepthBits')).toEqual({ control: 'slider', min: 1, max: 8, step: 1 })
  })

  it('gates MatrixOutput HUB75 wiring to the HUB75 chipset', () => {
    const hub75 = { chipset: 'HUB75' }
    const ws2812 = { chipset: 'WS2812B' }
    expect(isPropertyEnabled('MatrixOutput', 'hub75R1Pin', hub75)).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'hub75ClkPin', hub75)).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'hub75ColorDepthBits', hub75)).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'hub75R1Pin', ws2812)).toBe(false)
    // A single-wire chipset still owns dataPin/colorOrder/serpentine; HUB75 doesn't.
    expect(isPropertyEnabled('MatrixOutput', 'dataPin', hub75)).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'colorOrder', hub75)).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'serpentine', hub75)).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'dataPin', ws2812)).toBe(true)
    // FASTLED_OVERCLOCK doesn't apply to HUB75 (it's not driven via FastLED's
    // clockless RMT path at all).
    expect(isPropertyEnabled('MatrixOutput', 'overclock', hub75)).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'overclock', ws2812)).toBe(true)
  })

  it('gates MatrixOutput hub75EPin on hub75WideScan', () => {
    expect(isPropertyEnabled('MatrixOutput', 'hub75EPin', { chipset: 'HUB75', hub75WideScan: true })).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'hub75EPin', { chipset: 'HUB75', hub75WideScan: false })).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'hub75EPin', { chipset: 'WS2812B', hub75WideScan: true })).toBe(false)
  })

  it('MatrixOutput defaults HUB75 wiring off with a full pin set to fall back on', () => {
    const matrixOutput = NODE_LIBRARY.find((n) => n.type === 'MatrixOutput')
    expect(matrixOutput?.defaultProperties?.chipset).toBe('WS2812B')
    expect(matrixOutput?.defaultProperties).toMatchObject({
      hub75WideScan: false,
      hub75ColorDepthBits: 8,
    })
    const pins = [
      'hub75R1Pin', 'hub75G1Pin', 'hub75B1Pin', 'hub75R2Pin', 'hub75G2Pin', 'hub75B2Pin',
      'hub75APin', 'hub75BPin', 'hub75CPin', 'hub75DPin', 'hub75EPin',
      'hub75ClkPin', 'hub75LatPin', 'hub75OePin',
    ]
    const values = pins.map((key) => (matrixOutput?.defaultProperties as Record<string, unknown>)[key])
    for (const value of values) expect(typeof value).toBe('number')
    // No two HUB75 lines should default onto the same GPIO.
    expect(new Set(values).size).toBe(values.length)
  })

  it('EncoderInput defaults resetOnPress to off', () => {
    const enc = NODE_LIBRARY.find((n) => n.type === 'EncoderInput')
    expect(enc?.defaultProperties).toMatchObject({ resetOnPress: false })
  })

  it('math todo nodes expose editable defaults before wiring', () => {
    const defaults = (type: string) => NODE_LIBRARY.find((n) => n.type === type)?.defaultProperties ?? {}
    expect(defaults('Math')).toEqual({ mathOp: 'add' })
    expect(defaults('Clamp')).toMatchObject({ value: 0, min: 0, max: 1 })
    expect(defaults('MapRange')).toMatchObject({ value: 0, inMin: 0, inMax: 1, outMin: 0, outMax: 1 })
    expect(NODE_LIBRARY.find((n) => n.type === 'MapRange')?.inputs.map((port) => port.id)).toEqual([
      'value', 'inMin', 'inMax', 'outMin', 'outMax',
    ])
    expect(defaults('Lerp')).toMatchObject({ a: 0, b: 1, t: 0.5 })
    expect(defaults('Ease')).toMatchObject({ easeType: 'inOutCubic', t: 0 })
    expect(defaults('Abs')).toMatchObject({ x: 0 })
    expect(defaults('Mod')).toMatchObject({ x: 0, m: 1 })
    expect(defaults('Gate')).toMatchObject({ value: 0, fallback: 0 })
    expect(defaults('Smooth')).toMatchObject({ value: 0, response: 0.25 })
    expect(defaults('SampleHold')).toMatchObject({ value: 0 })
    expect(defaults('Compare')).toMatchObject({ a: 0, b: 0.5 })
    expect(defaults('XYMapper')).toMatchObject({ x: 0, y: 0 })
  })

  it('exposes every Ease variant with a descriptive bundled title', () => {
    expect(propertyMeta('Ease', 'easeType')).toEqual({
      control: 'select',
      options: [...EASE_TYPES],
    })
    for (const easeType of EASE_TYPES) {
      expect(nodeDisplayLabel('Ease', { easeType }, 'Ease'), easeType).not.toBe('Ease')
    }
    expect(nodeDisplayLabel('Ease', { easeType: 'unknown' }, 'Ease')).toBe('Ease')
  })

  it('color todo nodes expose editable defaults and bounded hue controls', () => {
    const defaults = (type: string) => NODE_LIBRARY.find((n) => n.type === type)?.defaultProperties ?? {}
    expect(defaults('BlendColors')).toMatchObject({
      rA: 255, gA: 0, bA: 0,
      rB: 0, gB: 0, bB: 255,
      t: 0.5,
    })
    expect(defaults('RGBToHSV')).toMatchObject({ r: 0, g: 0, b: 0 })
    expect(defaults('GradientSampler')).toMatchObject({ t: 0 })
    expect(propertyMeta('HSVToRGB', 'h')).toEqual({ control: 'slider', min: 0, max: 360, step: 1 })
  })

  it('signal todo nodes expose bounded controls and compatibility defaults', () => {
    expect(NODE_LIBRARY.find((n) => n.type === 'Random')?.defaultProperties).toMatchObject({ min: 0, max: 1, seed: 0 })
    expect(propertyMeta('Random', 'seed')).toEqual({ control: 'slider', min: 0, max: 9999, step: 1 })
    expect(NODE_LIBRARY.find((n) => n.type === 'Envelope')?.defaultProperties).toMatchObject({ attack: 0, decay: 0.5 })
    expect(propertyMeta('Envelope', 'attack')).toEqual({ control: 'slider', min: 0, max: 5, step: 0.05 })
    expect(propertyMeta('Envelope', 'decay')).toEqual({ control: 'slider', min: 0.05, max: 5, step: 0.05 })
    expect(propertyMeta('BeatSin', 'bpm')).toEqual({ control: 'slider', min: 1, max: 220, step: 1 })
  })

  it('explains that Sin and Cos need an explicit X signal to animate', () => {
    expect(propertyDescription('Sin', 'x')).toMatch(/does not animate on its own/i)
    expect(propertyDescription('Cos', 'x')).toMatch(/does not animate on its own/i)
  })

  it('has tooltips for serialDebug and pullup', () => {
    expect(propertyDescription('MicInput', 'serialDebug')).toMatch(/serial monitor/i)
    expect(propertyDescription('ButtonInput', 'pullup')).toMatch(/INPUT_PULLUP/)
    expect(propertyDescription('EncoderInput', 'pullup')).toMatch(/INPUT_PULLUP/)
  })
})
