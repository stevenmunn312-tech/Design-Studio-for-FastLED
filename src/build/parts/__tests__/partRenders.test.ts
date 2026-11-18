import { describe, expect, it } from 'vitest'
import { partRenderForNodeType } from '../partRenders'
import { partRenderSrc } from '../partCatalogue'

describe('part renders', () => {
  it('draws a catalogued part from its own asset', () => {
    // The graph thumbnail and the hardware view must both resolve to that one
    // asset rather than to two copies that could drift apart.
    expect(partRenderForNodeType('MicInput')!.src).toBe(partRenderSrc('inmp441-i2s-microphone'))
    expect(partRenderForNodeType('RtcModule')!.src).toBe(partRenderSrc('ds3231-rtc-module'))
  })

  it('uses the selected module render when a node stores a part id', () => {
    expect(partRenderForNodeType('RtcModule', { partId: 'jaycar-xc9044-rtc-module' })!.src)
      .toBe(partRenderSrc('jaycar-xc9044-rtc-module'))
  })

  it('names the part it draws', () => {
    expect(partRenderForNodeType('MotionInput', { partId: 'hc-sr501-pir-sensor' })!.label).toBeTruthy()
  })

  it('never substitutes another part for one the catalogue does not hold', () => {
    // An unknown or not-yet-downloaded part is an explicit error elsewhere; the
    // picture must not pass it off as the first bundled part of its type.
    for (const nodeType of ['MotionInput', 'DistanceInput', 'PowerMonitorInput', 'EncoderInput', 'TemperatureInput']) {
      expect(partRenderForNodeType(nodeType, { partId: 'no-such-part' }), nodeType).toBeNull()
    }
  })

  it('keeps the pictures of the modules that predate the catalogue', () => {
    // No part to name, so no part to get wrong: these are those modules.
    for (const nodeType of ['ButtonBank', 'PotInput', 'EncoderInput']) {
      const render = partRenderForNodeType(nodeType)
      expect(render?.src, nodeType).toBeTruthy()
      expect(render?.label, nodeType).toBeTruthy()
    }
  })

  it('has nothing for a node that is not a part', () => {
    expect(partRenderForNodeType('Plasma')).toBeNull()
    expect(partRenderForNodeType('MatrixOutput')).toBeNull()
  })
})
