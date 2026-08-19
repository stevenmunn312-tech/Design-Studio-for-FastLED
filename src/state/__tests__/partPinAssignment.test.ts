import { describe, expect, it } from 'vitest'
import { assignPartPins } from '../partPinAssignment'
import type { StudioNode } from '../graphStore'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'

/** A board exposing 4, 5, 6 as general purpose, with 5 off limits. */
function profile(safeGeneralPurpose: number[], reserved: number[] = []): PhysicalBoardProfile {
  return {
    pinSafety: {
      safeGeneralPurpose,
      useWithCaution: {},
      boardReservedOrNotExposed: Object.fromEntries(reserved.map((pin) => [pin, 'reserved'])),
    },
  } as unknown as PhysicalBoardProfile
}

function nodeWithPin(id: string, nodeType: string, props: Record<string, unknown>): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: id, nodeType, category: 'input', properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

// The app's default board. On the S3 analog covers GPIO1-20 (1-10 ADC1, 11-20
// ADC2, which the table warns conflicts with Wi-Fi); 21 and 33-48 are digital
// only.
const ESP32_S3 = 'esp32:esp32:esp32s3'

describe('assignPartPins', () => {
  it('takes the board profile pool in order', () => {
    const result = assignPartPins(profile([4, 5, 6]), ESP32_S3, [], [{ key: 'pin' }])
    expect(result).toEqual({ ok: true, pins: { pin: 4 } })
  })

  it('gives a multi-pin part distinct pins', () => {
    // An encoder that reused one pin three times would look assigned and be
    // unwirable.
    const result = assignPartPins(profile([4, 5, 6, 7]), ESP32_S3, [], [
      { key: 'pinA' }, { key: 'pinB' }, { key: 'pinSW' },
    ])
    expect(result).toEqual({ ok: true, pins: { pinA: 4, pinB: 5, pinSW: 6 } })
  })

  it('skips pins the graph already claims', () => {
    const nodes = [nodeWithPin('b', 'ButtonInput', { pin: 4 })]
    const result = assignPartPins(profile([4, 5, 6]), ESP32_S3, nodes, [{ key: 'pin' }])
    expect(result).toEqual({ ok: true, pins: { pin: 5 } })
  })

  it('skips pins the board reserves', () => {
    const result = assignPartPins(profile([4, 5, 6], [4, 5]), ESP32_S3, [], [{ key: 'pin' }])
    expect(result).toEqual({ ok: true, pins: { pin: 6 } })
  })

  it('refuses rather than guessing when the board is full', () => {
    const nodes = [nodeWithPin('b', 'ButtonInput', { pin: 4 })]
    const result = assignPartPins(profile([4]), 'unknown:board:xyz', nodes, [{ key: 'pin' }])
    expect(result).toEqual({ ok: false, reason: 'No free GPIO on this board' })
  })

  describe('analog capability', () => {
    it('picks a pin that actually has an ADC', () => {
      // 21 and 33 are digital only on the S3; 7 is ADC1. A potentiometer on a
      // pin without an ADC reads garbage and says nothing about it.
      const result = assignPartPins(profile([21, 33, 7]), ESP32_S3, [], [
        { key: 'pin', capability: 'analogInput' },
      ])
      expect(result).toEqual({ ok: true, pins: { pin: 7 } })
    })

    it('prefers ADC1 over an ADC2 pin that Wi-Fi would kill', () => {
      // 11 is ADC2 and carries the board's Wi-Fi warning; 7 is ADC1 and clean.
      // A pot on ADC2 works on the bench and stops converting in the install.
      const result = assignPartPins(profile([11, 7]), ESP32_S3, [], [
        { key: 'pin', capability: 'analogInput' },
      ])
      expect(result).toEqual({ ok: true, pins: { pin: 7 } })
    })

    it('still offers a warned pin when it is the only one', () => {
      // Refusing outright would block a board someone can legitimately wire.
      const result = assignPartPins(profile([11]), ESP32_S3, [], [
        { key: 'pin', capability: 'analogInput' },
      ])
      expect(result).toEqual({ ok: true, pins: { pin: 11 } })
    })

    it('says so when the board has no analog pin left', () => {
      const result = assignPartPins(profile([21, 33]), ESP32_S3, [], [
        { key: 'pin', capability: 'analogInput' },
      ])
      expect(result).toEqual({ ok: false, reason: 'No free analog-capable pin on this board' })
    })

    it('never assumes an unlisted pin has an ADC', () => {
      // 99 is not in any table. Digital is a safe assumption on an exposed pin;
      // an ADC is not, and guessing wrong is the silent failure.
      expect(assignPartPins(profile([99]), ESP32_S3, [], [{ key: 'pin' }]))
        .toEqual({ ok: true, pins: { pin: 99 } })
      expect(assignPartPins(profile([99]), ESP32_S3, [], [{ key: 'pin', capability: 'analogInput' }]))
        .toEqual({ ok: false, reason: 'No free analog-capable pin on this board' })
    })
  })

  it('falls back to the board GPIO table when the profile has no pool', () => {
    // A profile knows which pads are broken out; the FQBN table only knows the
    // chip. Better than nothing, and the order says which is trusted first.
    const result = assignPartPins(undefined, ESP32_S3, [], [{ key: 'pin' }])
    expect(result.ok).toBe(true)
  })
})
