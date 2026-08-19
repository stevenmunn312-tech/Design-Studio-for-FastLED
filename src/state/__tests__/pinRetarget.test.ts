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
function profile(
  pool: number[],
  inmp441?: { wsLrclk: number; sckBclk: number; sdDout: number },
  id = 'test-board',
) {
  return {
    id,
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

  it('ignores an edit made for a different board', () => {
    // Wiring a pin by hand is a decision about the board in front of you.
    // Holding a part to it on a board that may not even expose that pin would
    // be worse than moving it — the same reason mic defaults are kept per FQBN.
    const properties = { ...withAssignedPins({}, { pin: 4 }, 'esp32:esp32:esp32'), pin: 12 }
    expect(isPinAppOwned('ButtonInput', properties, 'pin', 'esp32:esp32:esp32')).toBe(false)
    expect(isPinAppOwned('ButtonInput', properties, 'pin', ESP32_S3)).toBe(true)
  })

  it('starts a fresh record when the board changes', () => {
    const onFirst = withAssignedPins({}, { pinA: 4 }, 'esp32:esp32:esp32')
    const onSecond = withAssignedPins(onFirst, { pinB: 5 }, ESP32_S3)
    // pinA belonged to the old board and must not be carried over as though
    // it had been chosen for this one.
    expect(onSecond.assignedPins).toEqual({ pinB: 5 })
    expect(onSecond.assignedPinsBoard).toBe(ESP32_S3)
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

  it('brings a hand-wired pin back when you return to its board', () => {
    /*
     * The case this exists for. An ESP8266 LED run is soldered to a
     * non-standard data pin; every board change put it back to the default, so
     * each reflash meant dark LEDs, a pin edit and another flash. The choice
     * has to survive leaving the board and coming back.
     */
    const nodemcu = profile([2, 4], undefined, 'esp8266-nodemcu-v3')
    const s3 = profile([21, 33], undefined, 'esp32-s3-devkitc-1')
    const wired = part('b', 'ButtonInput', {
      ...withAssignedPins({}, { pin: 2 }, nodemcu.id),
      pin: 13,
    })

    const away = retargetHardwarePins([wired], s3, ESP32_S3)
    expect(away.nodes[0].data.properties.pin).not.toBe(13)

    const back = retargetHardwarePins(away.nodes, nodemcu, 'esp8266:esp8266:nodemcuv2')
    expect(back.nodes[0].data.properties.pin).toBe(13)
  })

  it('keeps a returned pin theirs, so it survives the next trip too', () => {
    const nodemcu = profile([2, 4], undefined, 'esp8266-nodemcu-v3')
    const s3 = profile([21, 33], undefined, 'esp32-s3-devkitc-1')
    let nodes = [part('b', 'ButtonInput', {
      ...withAssignedPins({}, { pin: 2 }, nodemcu.id),
      pin: 13,
    })]
    for (let lap = 0; lap < 3; lap++) {
      nodes = retargetHardwarePins(nodes, s3, ESP32_S3).nodes
      nodes = retargetHardwarePins(nodes, nodemcu, 'esp8266:esp8266:nodemcuv2').nodes
    }
    expect(nodes[0].data.properties.pin).toBe(13)
  })

  it('remembers each board separately', () => {
    const nodemcu = profile([2, 4], undefined, 'esp8266-nodemcu-v3')
    const s3 = profile([21, 33], undefined, 'esp32-s3-devkitc-1')
    let nodes = [part('b', 'ButtonInput', {
      ...withAssignedPins({}, { pin: 2 }, nodemcu.id),
      pin: 13,
    })]
    // Move to the S3 and hand-wire it differently there.
    nodes = retargetHardwarePins(nodes, s3, ESP32_S3).nodes
    nodes = [part('b', 'ButtonInput', { ...nodes[0].data.properties, pin: 7 })]

    nodes = retargetHardwarePins(nodes, nodemcu, 'esp8266:esp8266:nodemcuv2').nodes
    expect(nodes[0].data.properties.pin).toBe(13)
    nodes = retargetHardwarePins(nodes, s3, ESP32_S3).nodes
    expect(nodes[0].data.properties.pin).toBe(7)
  })

  it('does not report a move when it only recorded a choice', () => {
    const s3 = profile([21, 33], undefined, 'esp32-s3-devkitc-1')
    const nodes = [part('b', 'ButtonInput', {
      ...withAssignedPins({}, { pin: 13 }, 'esp8266-nodemcu-v3'),
      // Already on the pin this board remembers, so nothing shifts.
      userPinsByBoard: { [s3.id]: { pin: 13 } },
      pin: 13,
    })]
    expect(retargetHardwarePins(nodes, s3, ESP32_S3).moved).toBe(0)
  })

  it('retargets between two boards that share an FQBN', () => {
    /*
     * `esp32:esp32:esp32` belongs to both the 38-pin generic DevKit and the
     * 30-pin DevKit v1 — different headers, same chip. Keying on the FQBN made
     * switching between them look like no change at all, so the pins never
     * moved: reported from the bench with a microphone left on another board's
     * wiring while the board panel advertised its own.
     */
    const thirtyPin = profile([2, 4], undefined, 'esp32-devkit-v1-30pin-esp32d')
    const thirtyEight = profile([21, 33], undefined, 'esp32-generic-devkit-38pin')
    const shared = 'esp32:esp32:esp32'

    let nodes = [part('b', 'ButtonInput', withAssignedPins({}, { pin: 2 }, thirtyPin.id))]
    nodes = retargetHardwarePins(nodes, thirtyEight, shared).nodes
    expect(nodes[0].data.properties.pin).toBe(21)
  })

  it('keeps each shared-FQBN board its own memory', () => {
    const thirtyPin = profile([2, 4], undefined, 'esp32-devkit-v1-30pin-esp32d')
    const thirtyEight = profile([21, 33], undefined, 'esp32-generic-devkit-38pin')
    const shared = 'esp32:esp32:esp32'

    // Hand-wired on the 30-pin, then away to the 38-pin and back.
    let nodes = [part('b', 'ButtonInput', {
      ...withAssignedPins({}, { pin: 2 }, thirtyPin.id),
      pin: 15,
    })]
    nodes = retargetHardwarePins(nodes, thirtyEight, shared).nodes
    expect(nodes[0].data.properties.pin).toBe(21)
    nodes = retargetHardwarePins(nodes, thirtyPin, shared).nodes
    expect(nodes[0].data.properties.pin).toBe(15)
  })

  it('does not strand an unstamped edit on every board', () => {
    /*
     * Reported with screenshots. An SD pin set to 18 on a 30-pin DevKit still
     * read 18 after switching to an S3 that wants 41 — on a board where that
     * pin was never chosen, and eventually on boards with no GPIO 18 at all.
     * A pin with no stamp has no board attached, so treating it as the user's
     * everywhere pins it everywhere; it belongs to the board being left.
     */
    const devkit = profile([1, 2], { wsLrclk: 32, sckBclk: 33, sdDout: 34 }, 'esp32-devkit-v1-30pin-esp32d')
    const s3 = profile([3, 4], { wsLrclk: 39, sckBclk: 40, sdDout: 41 }, 'esp32-s3-generic-n16r8')

    // No provenance: the state a node saved before stamping existed is in.
    let nodes = [part('mic', 'MicInput', { i2sWs: 32, i2sSck: 33, i2sSd: 18 })]

    nodes = retargetHardwarePins(nodes, s3, ESP32_S3, devkit.id).nodes
    // The S3's own pins, all three of them.
    expect(nodes[0].data.properties).toMatchObject({ i2sWs: 39, i2sSck: 40, i2sSd: 41 })

    // And the edit was not lost — it belonged to the DevKit, and returns there.
    nodes = retargetHardwarePins(nodes, devkit, 'esp32:esp32:esp32doit-devkit-v1').nodes
    expect(nodes[0].data.properties).toMatchObject({ i2sWs: 32, i2sSck: 33, i2sSd: 18 })
  })

  it('does not freeze a whole microphone because one pin was edited', () => {
    /*
     * Reported from the bench, with screenshots. A mic sat on the 30-pin
     * DevKit's 32/33/34; the SD pin was changed to 18; switching to an S3 that
     * wants 39/40/41 left the mic on 32/33/18 — the edit had frozen WS and SCK
     * as well. The legacy ownership check asked whether all three pins matched
     * one board's starting point, so touching any one of them made the other
     * two look hand-wired.
     *
     * No provenance recorded here on purpose: that is the state the reported
     * node was in.
     */
    const s3 = profile([1, 2], { wsLrclk: 39, sckBclk: 40, sdDout: 41 }, 'esp32-s3-generic-n16r8')
    const nodes = [part('mic', 'MicInput', {
      ...withAssignedPins({}, { i2sWs: 32, i2sSck: 33, i2sSd: 34 }, 'esp32-devkit-v1-30pin-esp32d'),
      i2sSd: 18,
    })]

    const result = retargetHardwarePins(nodes, s3, ESP32_S3)
    const props = result.nodes[0].data.properties
    // All three follow the new board; the edit belonged to the old one.
    expect(props.i2sWs).toBe(39)
    expect(props.i2sSck).toBe(40)
    expect(props.i2sSd).toBe(41)
  })

  it('follows the described microphone behaviour end to end', () => {
    /*
     * "I change boards, the mic should change all its pins to the defaults for
     * that board. Later if I go back to the first board it should retain the
     * SD as 32 instead of 33, but only for that board."
     */
    const boardA = profile([1, 2], { wsLrclk: 32, sckBclk: 33, sdDout: 34 }, 'board-a')
    const boardB = profile([3, 4], { wsLrclk: 39, sckBclk: 40, sdDout: 41 }, 'board-b')

    // On board A, wired as the app suggested, then the SD pin changed by hand.
    let nodes = [part('mic', 'MicInput', {
      ...withAssignedPins({}, { i2sWs: 32, i2sSck: 33, i2sSd: 34 }, boardA.id),
      i2sSd: 18,
    })]

    // To board B: everything takes B's pins, the hand-edit included, because
    // that edit was about board A.
    nodes = retargetHardwarePins(nodes, boardB, 'b').nodes
    expect(nodes[0].data.properties).toMatchObject({ i2sWs: 39, i2sSck: 40, i2sSd: 41 })

    // Back to A: A's own pins, and the hand-edit returns with them.
    nodes = retargetHardwarePins(nodes, boardA, 'a').nodes
    expect(nodes[0].data.properties).toMatchObject({ i2sWs: 32, i2sSck: 33, i2sSd: 18 })

    // And B is still B's, unaffected by what was done on A.
    nodes = retargetHardwarePins(nodes, boardB, 'b').nodes
    expect(nodes[0].data.properties).toMatchObject({ i2sWs: 39, i2sSck: 40, i2sSd: 41 })
  })

  it('ignores nodes that are not hardware parts', () => {
    const nodes = [part('p', 'Plasma', { speed: 0.5 })]
    expect(retargetHardwarePins(nodes, profile([21]), ESP32_S3).moved).toBe(0)
  })
})
