import { describe, expect, it } from 'vitest'
import { ensureBuildProfile, normalizeBuildProfile, targetFamilyFromFqbn } from '../buildProfile'

describe('buildProfile', () => {
  it('recognizes ESP32 variants in generic and vendor-specific FQBNs', () => {
    expect(targetFamilyFromFqbn('esp32:esp32:esp32s3')).toBe('esp32-s3')
    expect(targetFamilyFromFqbn('esp32:esp32:lolin_s2_mini')).toBe('esp32-s2')
    expect(targetFamilyFromFqbn('esp32:esp32:lolin_c3_mini')).toBe('esp32-c3')
    expect(targetFamilyFromFqbn('esp32:esp32:esp32')).toBe('esp32')
    // Named after its u-blox module rather than the chip.
    expect(targetFamilyFromFqbn('esp32:esp32:nano_nora')).toBe('esp32-s3')
  })

  it('keeps a valid export mode when normalizing build profile data', () => {
    expect(normalizeBuildProfile({
      version: 1,
      exportMode: 'current-view',
    })?.exportMode).toBe('current-view')
  })

  it('defaults back to complete-build semantics when export mode is missing or invalid', () => {
    expect(normalizeBuildProfile({
      version: 1,
      exportMode: 'not-real',
    })?.exportMode).toBeUndefined()
    expect(ensureBuildProfile(undefined).exportMode).toBeUndefined()
  })

  it('keeps signal-conditioning choices and drops malformed values', () => {
    const profile = normalizeBuildProfile({
      version: 1,
      signalConditioning: { output: true, pending: false, bad: 'yes' },
    })
    expect(profile?.signalConditioning).toEqual({ output: true, pending: false })
  })

  it('drops the retired owned-parts record: the Power Supply node holds the supply now', () => {
    const profile = normalizeBuildProfile({
      version: 1,
      ownedParts: { supplies: { a: { id: 'a', voltage: 5, continuousCurrentMa: 10000 } } },
    })
    expect(profile).not.toHaveProperty('ownedParts')
  })
})
