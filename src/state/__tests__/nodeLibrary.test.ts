import { describe, it, expect } from 'vitest'
import { NODE_LIBRARY, NODE_DESCRIPTIONS, portColor, propertyMeta } from '../nodeLibrary'

describe('nodeLibrary', () => {
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

  it('MicInput defaults keep AGC off until the user opts in', () => {
    const mic = NODE_LIBRARY.find((n) => n.type === 'MicInput')
    expect(mic?.category).toBe('hardware')
    expect(mic?.defaultProperties).toMatchObject({
      gain: 1,
      agc: false,
      threshold: 0.08,
      attack: 0.2,
      decay: 0.05,
    })
  })

  it('AudioFlow exposes speed/scale as normalized animatable inputs', () => {
    const af = NODE_LIBRARY.find((n) => n.type === 'AudioFlow')
    expect(af?.inputs.map((p) => p.id)).toEqual(['bass', 'mids', 'treble', 'speed', 'scale', 'paletteIn'])
    expect(af?.defaultProperties).toMatchObject({ speed: 0.5, scale: 0.5, palette: 'rainbow' })
    expect(propertyMeta('AudioFlow', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('AudioFlow', 'scale')).toMatchObject({ control: 'slider', min: 0, max: 1 })
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

  it('BassRings exposes bass, energy, normalized speed, and tintable color inputs', () => {
    const br = NODE_LIBRARY.find((n) => n.type === 'BassRings')
    expect(br?.inputs.map((p) => p.id)).toEqual(['bass', 'energy', 'speed', 'color'])
    expect(br?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, r: 255, g: 120, b: 32 })
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

  it('TrebleSparks exposes a color input with a cool-tinted fallback', () => {
    const ts = NODE_LIBRARY.find((n) => n.type === 'TrebleSparks')
    expect(ts?.inputs.map((p) => p.id)).toEqual(['treble', 'density', 'color'])
    expect(ts?.defaultProperties).toMatchObject({ density: 0.5, r: 180, g: 220, b: 255 })
  })

  it('TreblePrism exposes energy, normalized speed, and a tintable color input', () => {
    const tp = NODE_LIBRARY.find((n) => n.type === 'TreblePrism')
    expect(tp?.inputs.map((p) => p.id)).toEqual(['treble', 'energy', 'speed', 'color'])
    expect(tp?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, r: 200, g: 120, b: 255 })
    expect(propertyMeta('TreblePrism', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('TreblePrism', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('AudioCascade exposes full-spectrum audio inputs with normalized controls', () => {
    const ac = NODE_LIBRARY.find((n) => n.type === 'AudioCascade')
    expect(ac?.inputs.map((p) => p.id)).toEqual(['bass', 'mids', 'treble', 'energy', 'speed', 'paletteIn'])
    expect(ac?.defaultProperties).toMatchObject({ energy: 0.7, speed: 1, palette: 'rainbow' })
    expect(propertyMeta('AudioCascade', 'energy')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('AudioCascade', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })

  it('MusicLibrary now shelves with audio analysis nodes', () => {
    expect(NODE_LIBRARY.find((n) => n.type === 'MusicLibrary')?.category).toBe('audio')
  })
})
