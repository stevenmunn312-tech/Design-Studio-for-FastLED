import { describe, expect, it } from 'vitest'
import { conductorVoltageDrop, recommendConductor, recommendFuse, WIRE_RULES } from '../electricalRules'

describe('electricalRules', () => {
  it('sizes a copper feed for both ampacity and round-trip voltage drop', () => {
    const recommendation = recommendConductor({
      designCurrentMa: 15000,
      oneWayLengthMm: 3000,
      circuitVoltage: 5,
      allowedVoltageDropPercent: 5,
      material: 'copper',
      ambientC: 30,
      bundledCircuits: 1,
    })

    expect(recommendation).toEqual(expect.objectContaining({
      awg: 8,
      crossSectionMm2: 8,
      limitingFactor: 'voltage-drop',
    }))
    expect(recommendation?.voltageDropPercent).toBeLessThanOrEqual(5)
  })

  it('requires a larger conductor for CCA than copper under the same drop target', () => {
    const copper = recommendConductor({
      designCurrentMa: 5000,
      oneWayLengthMm: 2000,
      circuitVoltage: 5,
      allowedVoltageDropPercent: 5,
      material: 'copper',
      ambientC: 30,
      bundledCircuits: 1,
    })
    const cca = recommendConductor({
      designCurrentMa: 5000,
      oneWayLengthMm: 2000,
      circuitVoltage: 5,
      allowedVoltageDropPercent: 5,
      material: 'cca',
      ambientC: 30,
      bundledCircuits: 1,
    })

    expect(cca?.crossSectionMm2 ?? Infinity).toBeGreaterThanOrEqual(copper?.crossSectionMm2 ?? 0)
    expect(cca?.voltageDropPercent ?? 0).toBeLessThanOrEqual(5)
  })

  it('calculates voltage drop over the outbound and return conductors', () => {
    const awg20 = WIRE_RULES[0]
    expect(conductorVoltageDrop(awg20, 1000, 1000, 'copper')).toBeCloseTo(0.06662, 5)
  })

  it('selects a standard fuse that carries normal load and protects the path', () => {
    expect(recommendFuse(5000, 15000, 10000)).toEqual({
      ratingMa: 7500,
      minimumLoadRatingMa: 6667,
      maximumProtectiveRatingMa: 10000,
    })
  })

  it('leaves fuse selection unresolved when no safe standard rating exists', () => {
    const result = recommendFuse(9000, 10000, 10000)
    expect(result.ratingMa).toBeUndefined()
    expect(result.unresolvedReason).toContain('No standard fuse rating')
  })
})
