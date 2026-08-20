import { describe, expect, it } from 'vitest'
import { BOARD_I2C_DEFAULTS } from '../boardI2cDefaults'
import { BOARD_PROFILES, boardProfileById } from '../boardProfiles'
import { rtcI2cPinsForProfile } from '../../state/rtcPins'

describe('board I2C defaults', () => {
  it('has one reviewed Wire default for every supported physical board', () => {
    const profileIds = BOARD_PROFILES.map((profile) => profile.id).sort()
    const defaultIds = Object.keys(BOARD_I2C_DEFAULTS).sort()
    expect(defaultIds).toEqual(profileIds)
    for (const profile of BOARD_PROFILES) {
      const resolved = rtcI2cPinsForProfile(profile)
      expect(resolved, profile.id).not.toBeNull()
      expect(resolved?.sda.arduinoPin, `${profile.id} SDA`).toBeGreaterThanOrEqual(0)
      expect(resolved?.scl.arduinoPin, `${profile.id} SCL`).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps core aliases and physical pads distinct where they differ', () => {
    const nanoEvery = rtcI2cPinsForProfile(boardProfileById('arduino-nano-every'))
    expect(nanoEvery).toMatchObject({
      sda: { arduinoPin: 22 },
      scl: { arduinoPin: 23 },
    })
    expect(nanoEvery?.sda.boardPin?.label).toMatch(/A4.*SDA/i)
    expect(nanoEvery?.scl.boardPin?.label).toMatch(/A5.*SCL/i)

    const bluePill = rtcI2cPinsForProfile(boardProfileById('stm32-blue-pill-f103c8'))
    expect(bluePill).toMatchObject({
      sda: { displayLabel: 'PB7' },
      scl: { displayLabel: 'PB6' },
    })
  })

  it('resolves every physical diagram pad present in the imported board maps', () => {
    const unresolved = BOARD_PROFILES
      .filter((profile) => (profile.pins?.length ?? 0) > 0)
      .flatMap((profile) => {
        const pins = rtcI2cPinsForProfile(profile)
        return pins?.sda.boardPin && pins.scl.boardPin ? [] : [profile.id]
      })
    // The nRF52840 DK source render omits P0.27 entirely. Keep reporting the
    // core's correct SCL default instead of attaching its wire to a false pad.
    expect(unresolved).toEqual(['nordic-nrf52840-dk'])
  })

  it('resolves the selected board defaults as property values', () => {
    expect(rtcI2cPinsForProfile(boardProfileById('seeed-xiao-esp32s3'))).toMatchObject({
      sda: { arduinoPin: 5 },
      scl: { arduinoPin: 6 },
    })
    expect(rtcI2cPinsForProfile(undefined)).toBeNull()
  })
})
