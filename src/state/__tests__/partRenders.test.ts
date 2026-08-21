import { describe, expect, it } from 'vitest'
import { PART_RENDER_BY_NODE_TYPE, partRenderForNodeType } from '../partRenders'
import { partRenderSrc } from '../partCatalogue'
import { isHardwareLibraryHiddenNodeType } from '../hardware'

describe('part renders', () => {
  it('covers every signal-carrying hardware part', () => {
    // The parts that exist in both views. If one gains a node type without a
    // picture, its graph node silently stops showing which part it is.
    expect(Object.keys(PART_RENDER_BY_NODE_TYPE).sort())
      .toEqual(['ButtonInput', 'EncoderInput', 'LightInput', 'MicInput', 'MotionInput', 'PotInput', 'RTCInput'])
  })

  it('only names parts the hardware view owns', () => {
    // A thumbnail on a node the user can still drag from the sidebar would be
    // claiming a bench part that is not attached to any board.
    for (const nodeType of Object.keys(PART_RENDER_BY_NODE_TYPE)) {
      expect(isHardwareLibraryHiddenNodeType(nodeType), nodeType).toBe(true)
    }
  })

  it('prefers the catalogued asset over the bundled copy', () => {
    // The microphone is modelled under Parts/, so the graph thumbnail and the
    // hardware view must both resolve to that one asset rather than to two
    // copies that could drift apart.
    expect(partRenderForNodeType('MicInput')!.src).toBe(partRenderSrc('inmp441-i2s-microphone'))
    expect(partRenderForNodeType('RTCInput')!.src).toBe(partRenderSrc('ds3231-rtc-module'))
  })

  it('uses the selected module render when a node stores a part id', () => {
    expect(partRenderForNodeType('RTCInput', { partId: 'jaycar-xc9044-rtc-module' })!.src)
      .toBe(partRenderSrc('jaycar-xc9044-rtc-module'))
  })

  it('gives every entry a usable image and a name', () => {
    for (const [nodeType, render] of Object.entries(PART_RENDER_BY_NODE_TYPE)) {
      expect(render.src, nodeType).toBeTruthy()
      expect(render.label, nodeType).toBeTruthy()
    }
  })

  it('has nothing for a node that is not a part', () => {
    expect(partRenderForNodeType('Plasma')).toBeNull()
    expect(partRenderForNodeType('MatrixOutput')).toBeNull()
  })
})
