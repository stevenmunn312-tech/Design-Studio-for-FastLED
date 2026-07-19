import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultPropertiesForNodeType,
  presettableProperties,
  useNodePresets,
  variationProperties,
} from '../nodePresets'

describe('nodePresets', () => {
  beforeEach(() => {
    localStorage.clear()
    useNodePresets.setState({ presets: [] })
  })

  it('saves only preset-friendly scalar properties', () => {
    const saved = useNodePresets.getState().savePreset('Text', 'Title look', {
      text: 'HELLO',
      x: 0.25,
      y: 0.75,
      font: { name: 'private font data' },
      globalCode: 'nope',
      image: { w: 1 },
    })

    expect(saved?.properties).toEqual(expect.objectContaining({ text: 'HELLO', x: 0.25, y: 0.75 }))
    expect(saved?.properties).not.toHaveProperty('font')
    expect(saved?.properties).not.toHaveProperty('globalCode')
    expect(saved?.properties).not.toHaveProperty('image')
    expect(JSON.parse(localStorage.getItem('design-studio-for-fastled.node-presets.v1') ?? '[]')).toHaveLength(1)
  })

  it('randomizes slider and select values inside their metadata bounds', () => {
    const next = variationProperties('Noise', {
      noiseType: 'simplex',
      speed: 0.5,
      scale: 0.5,
      palette: 'rainbow',
    }, 'randomize')

    expect(['field', 'simplex', 'noise3d', 'noise4d', 'worley', 'plasma', 'sine']).toContain(next.noiseType)
    expect(typeof next.speed).toBe('number')
    expect(Number(next.speed)).toBeGreaterThanOrEqual(0)
    expect(Number(next.speed)).toBeLessThanOrEqual(1)
    expect(Number(next.scale)).toBeGreaterThanOrEqual(0)
    expect(Number(next.scale)).toBeLessThanOrEqual(1)
  })

  it('keeps code, media, graph identity, and hardware settings out of presets', () => {
    expect(presettableProperties('Code', {
      code: 'leds[0] = CRGB::Red;',
      globalCode: 'int x;',
      brightness: 0.5,
    })).toEqual({ brightness: 0.5 })
    expect(presettableProperties('Group', { groupId: 'group-1', opacity: 0.5 })).toEqual({ opacity: 0.5 })
    const imageProps = presettableProperties('Image', { image: { w: 1 }, playbackRate: 2, brightness: 0.8 })
    expect(imageProps).toEqual(expect.objectContaining({ brightness: 0.8 }))
    expect(imageProps).not.toHaveProperty('image')
    expect(imageProps).not.toHaveProperty('playbackRate')
    expect(presettableProperties('MatrixOutput', {
      width: 32,
      height: 16,
      dataPin: 18,
      chipset: 'WS2812B',
    })).toEqual({})
  })

  it('exposes library defaults for reset operations', () => {
    expect(defaultPropertiesForNodeType('SolidColor')).toEqual({ r: 255, g: 0, b: 128 })
  })
})
