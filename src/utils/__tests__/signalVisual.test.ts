import { describe, expect, it } from 'vitest'
import { frameAmbient, signalVisual } from '../signalVisual'

describe('signal visuals', () => {
  it('preserves the colour and energy of a colour port', () => {
    expect(signalVisual({ r: 255, g: 64, b: 0 })).toMatchObject({
      color: 'rgb(255 64 0)',
      energy: 1,
    })
  })

  it('uses RMS mixing so sparse bright pixels still cast coloured light', () => {
    const visual = signalVisual([
      [{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }],
      [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }],
    ])
    expect(visual?.color).toBe('rgb(128 0 0)')
    expect(visual?.energy).toBe(0.25)
  })

  it('samples separate corners for the preview Ambilight', () => {
    const ambient = frameAmbient([
      [{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }],
      [{ r: 0, g: 255, b: 0 }, { r: 255, g: 255, b: 255 }],
    ])
    expect(ambient.colors).toEqual([
      'rgb(255 0 0)',
      'rgb(0 0 255)',
      'rgb(0 255 0)',
      'rgb(255 255 255)',
    ])
    expect(ambient.energy).toBe(1)
  })
})
