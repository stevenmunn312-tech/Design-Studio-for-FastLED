import { describe, it, expect } from 'vitest'
import { NODE_LIBRARY, NODE_DESCRIPTIONS, portColor, propertyMeta, isPropertyEnabled } from '../nodeLibrary'

describe('nodeLibrary', () => {
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

  it('every node in the shelf has a tooltip description', () => {
    const missing = NODE_LIBRARY.filter((n) => !NODE_DESCRIPTIONS[n.type]).map((n) => n.type)
    expect(missing).toEqual([])
  })

  it('descriptions are concise single lines', () => {
    for (const [type, desc] of Object.entries(NODE_DESCRIPTIONS)) {
      expect(desc, type).not.toContain('\n')
      expect(desc.length, type).toBeLessThanOrEqual(80)
    }
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

  it('AudioCascade exposes full-spectrum audio inputs with normalized controls', () => {
    const ac = NODE_LIBRARY.find((n) => n.type === 'AudioCascade')
    expect(ac?.inputs.map((p) => p.id)).toEqual(['bass', 'mids', 'treble', 'energy', 'speed', 'paletteIn'])
    expect(ac?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, palette: 'rainbow' })
    expect(propertyMeta('AudioCascade', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('AudioCascade', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('MusicLibrary shelves with the show pipeline nodes', () => {
    expect(NODE_LIBRARY.find((n) => n.type === 'MusicLibrary')?.category).toBe('show')
  })

  it('PerformanceGenerator exposes only shows — no misleading frame port', () => {
    // A firmware-facing frame port would be structurally misleading (a normal
    // sketch has no audio transport to drive it); the live show preview is
    // opt-in via the `showInMainPreview` property instead (showPlayback.ts).
    expect(NODE_LIBRARY.find((n) => n.type === 'PerformanceGenerator')?.outputs).toEqual([
      { id: 'shows', label: 'Shows', dataType: 'shows' },
    ])
    expect(NODE_LIBRARY.find((n) => n.type === 'PerformanceGenerator')?.defaultProperties).toMatchObject({
      showInMainPreview: false,
    })
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
})
