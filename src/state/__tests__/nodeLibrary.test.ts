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

  it('AudioFlow exposes speed/scale as normalized animatable inputs', () => {
    const af = NODE_LIBRARY.find((n) => n.type === 'AudioFlow')
    expect(af?.inputs.map((p) => p.id)).toEqual(['bass', 'mids', 'treble', 'speed', 'scale', 'paletteIn'])
    expect(af?.defaultProperties).toMatchObject({ speed: 0.5, scale: 0.5, palette: 'rainbow' })
    expect(propertyMeta('AudioFlow', 'speed')).toMatchObject({ control: 'slider', min: 0, max: 1 })
    expect(propertyMeta('AudioFlow', 'scale')).toMatchObject({ control: 'slider', min: 0, max: 1 })
  })
})
