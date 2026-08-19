import { describe, expect, it } from 'vitest'
import { isPinAppOwned, retargetHardwarePins, withAssignedPins } from '../pinRetarget'
import type { StudioNode } from '../graphStore'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'

function part(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: id, nodeType, category: 'input', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

/** A board exposing a general pool and, optionally, an I2S mic trio. */
function profile(pool: number[], inmp441?: { wsLrclk: number; sckBclk: number; sdDout: number }) {
  return {
    pinSafety: { safeGeneralPurpose: pool, useWithCaution: {}, boardReservedOrNotExposed: {} },
    peripheralPins: inmp441 ? { inmp441 } : undefined,
  } as unknown as PhysicalBoardProfile
}

const ESP32_S3 = 'esp32:esp32:esp32s3'

describe('pin ownership', () => {
  it('treats a pin still holding the assigned value as the app\'s', () => {
    const properties = withAssignedPins({}, { pin: 4 })
    expect(isPinAppOwned('ButtonInput', properties, 'pin')).toBe(true)
  })

  it('treats a pin the user has changed as theirs', () => {
    // The whole rule: a board someone has wired differently is a fact about
    // their bench, not a preference to correct.
    const properties = { ...withAssignedPins({}, { pin: 4 }), pin: 12 }
    expect(isPinAppOwned('ButtonInput', properties, 'pin')).toBe(false)
  })

  it('records the assignment without losing earlier ones', () => {
    const first = withAssignedPins({}, { pinA: 4 })
    const both = withAssignedPins(first, { pinB: 5 })
    expect(both.assignedPins).toEqual({ pinA: 4, pinB: 5 })
  })

  it('reads a legacy microphone through the check written for it', () => {
    // No provenance recorded. 39/40/41 is a known Studio starting point, so it
    // was never hand-wired; 7/8/9 in that slot is not, so it was.
    expect(isPinAppOwned('MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41 }, 'i2sWs')).toBe(true)
    expect(isPinAppOwned('MicInput', { i2sWs: 1, i2sSck: 2, i2sSd: 3 }, 'i2sWs')).toBe(false)
  })
})

describe('retargetHardwarePins', () => {
  it('moves a part the app placed', () => {
    const nodes = [part('b', 'ButtonInput', withAssignedPins({}, { pin: 4 }))]
    const result = retargetHardwarePins(nodes, profile([21, 33]), ESP32_S3)
    expect(result.moved).toBe(1)
    expect(result.nodes[0].data.properties.pin).toBe(21)
  })

  it('leaves a part the user wired', () => {
    const nodes = [part('b', 'ButtonInput', { ...withAssignedPins({}, { pin: 4 }), pin: 12 })]
    const result = retargetHardwarePins(nodes, profile([21, 33]), ESP32_S3)
    expect(result.moved).toBe(0)
    expect(result.nodes[0].data.properties.pin).toBe(12)
  })

  it('routes around a pin the user owns rather than onto it', () => {
    // The user's button sits on 21. The app's button must not be handed 21
    // just because the board offers it first.
    const nodes = [
      part('mine', 'ButtonInput', { ...withAssignedPins({}, { pin: 4 }), pin: 21 }),
      part('theirs', 'ButtonInput', withAssignedPins({}, { pin: 5 })),
    ]
    const result = retargetHardwarePins(nodes, profile([21, 33]), ESP32_S3)
    expect(result.nodes.find((n) => n.id === 'mine')!.data.properties.pin).toBe(21)
    expect(result.nodes.find((n) => n.id === 'theirs')!.data.properties.pin).toBe(33)
  })

  it('does not put two app-placed parts on the same pin', () => {
    const nodes = [
      part('a', 'ButtonInput', withAssignedPins({}, { pin: 4 })),
      part('b', 'ButtonInput', withAssignedPins({}, { pin: 5 })),
    ]
    const result = retargetHardwarePins(nodes, profile([21, 33]), ESP32_S3)
    const pins = result.nodes.map((n) => Number(n.data.properties.pin))
    expect(new Set(pins).size).toBe(2)
  })

  it('moves only the pins of a part the user half-edited', () => {
    const nodes = [part('e', 'EncoderInput', {
      ...withAssignedPins({}, { pinA: 4, pinB: 5, pinSW: 6 }),
      pinB: 19,
    })]
    const result = retargetHardwarePins(nodes, profile([21, 33, 34]), ESP32_S3)
    const props = result.nodes[0].data.properties
    expect(props.pinB).toBe(19)
    expect(props.pinA).not.toBe(4)
    expect(props.pinSW).not.toBe(6)
  })

  it('takes an I2S trio from the board profile, not the general pool', () => {
    const nodes = [part('mic', 'MicInput', withAssignedPins({}, { i2sWs: 39, i2sSck: 40, i2sSd: 41 }))]
    const result = retargetHardwarePins(nodes, profile([21, 33], { wsLrclk: 7, sckBclk: 8, sdDout: 9 }), ESP32_S3)
    expect(result.nodes[0].data.properties).toMatchObject({ i2sWs: 7, i2sSck: 8, i2sSd: 9 })
  })

  it('re-stamps what it moved, so the next board change still knows', () => {
    const nodes = [part('b', 'ButtonInput', withAssignedPins({}, { pin: 4 }))]
    const once = retargetHardwarePins(nodes, profile([21, 33]), ESP32_S3)
    expect(once.nodes[0].data.properties.assignedPins).toMatchObject({ pin: 21 })
    // Still the app's, so a second board change can move it again.
    expect(isPinAppOwned('ButtonInput', once.nodes[0].data.properties, 'pin')).toBe(true)
  })

  it('reports nothing moved when the board already agrees', () => {
    // No-op rather than an empty undo step.
    const nodes = [part('b', 'ButtonInput', withAssignedPins({}, { pin: 21 }))]
    const result = retargetHardwarePins(nodes, profile([21, 33]), ESP32_S3)
    expect(result.moved).toBe(0)
    expect(result.nodes).toBe(nodes)
  })

  it('ignores nodes that are not hardware parts', () => {
    const nodes = [part('p', 'Plasma', { speed: 0.5 })]
    expect(retargetHardwarePins(nodes, profile([21]), ESP32_S3).moved).toBe(0)
  })
})
