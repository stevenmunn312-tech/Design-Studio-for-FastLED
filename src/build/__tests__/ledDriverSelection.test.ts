import { describe, expect, it } from 'vitest'
import {
  LED_DRIVER_AUTO,
  normalizeLedDriverChoice,
  selectableLedDrivers,
  selectedLedDriverFor,
  suggestParallelLedDriver,
} from '../ledDrivers'
import { ledDriverOptionsForBoard, selectedLedDriver, withLedDriverNormalized } from '../ledDriverSelection'

const S3 = 'espressif-esp32-s3-devkitc-1'
const ESP32 = 'esp32-generic-devkit-38pin'
const C6 = 'esp32-c6-devkitc-1'
const board = (properties: Record<string, unknown>) =>
  ({ id: 'board', data: { nodeType: 'Board', properties } })

describe('selectableLedDrivers', () => {
  it('offers the drivers FastLED 3.10.5 builds besides each family default', () => {
    expect(selectableLedDrivers('esp32-s3').map((d) => d.bus)).toEqual(['LCD_CLOCKLESS', 'I2S'])
    expect(selectableLedDrivers('esp32').map((d) => [d.bus, d.selection])).toEqual([['I2S', 'legacy-define']])
    expect(selectableLedDrivers('esp32-c6').map((d) => d.bus)).toEqual(['RMT'])
    expect(selectableLedDrivers('esp32-h2').map((d) => d.bus)).toEqual(['RMT'])
    for (const family of ['esp32-s2', 'esp32-c3', 'esp8266', 'rp2040', 'teensy', 'avr', 'unknown'] as const) {
      expect(selectableLedDrivers(family)).toEqual([])
    }
  })

  it('names each exclusive driver with the header that defines its BusTraits', () => {
    for (const family of ['esp32-s3', 'esp32-c6'] as const) {
      for (const driver of selectableLedDrivers(family)) {
        expect(driver.selection).toBe('exclusive')
        expect(driver.traitsHeader).toMatch(/^platforms\/esp\/32\/drivers\/[a-z_0-9/]+\/bus_traits\.h$/)
      }
    }
  })

  it('lets only an offered bus through and normalises the rest to auto', () => {
    expect(selectedLedDriverFor('esp32-s3', '', 'LCD_CLOCKLESS')?.peripheral).toBe('LCD_CAM')
    expect(selectedLedDriverFor('esp32-s3', '', 'PARLIO')).toBeNull()
    expect(selectedLedDriverFor('esp32-s3', '', 'RMT); evil();')).toBeNull()
    expect(selectedLedDriverFor('esp32-s3', '', LED_DRIVER_AUTO)).toBeNull()
    expect(selectedLedDriverFor('esp32-s3', '', 7)).toBeNull()
    expect(normalizeLedDriverChoice('esp32', '', 'LCD_CLOCKLESS')).toBe(LED_DRIVER_AUTO)
    expect(normalizeLedDriverChoice('esp32-c6', '', 'RMT')).toBe('RMT')
  })
})

describe('suggestParallelLedDriver', () => {
  it('suggests LCD_CAM once an S3 graph has more outputs than its four RMT channels', () => {
    expect(suggestParallelLedDriver('esp32-s3', '', 4)).toBeNull()
    const suggestion = suggestParallelLedDriver('esp32-s3', '', 6)
    expect(suggestion).toMatchObject({ choice: 'LCD_CLOCKLESS', defaultOutputsAtOnce: 4 })
    expect(suggestion?.message).toContain('all 6 outputs at once')
  })

  it('counts the network rate, which leaves the S3 one RMT channel', () => {
    expect(suggestParallelLedDriver('esp32-s3', '', 2, { networkActive: true })?.defaultOutputsAtOnce).toBe(1)
  })

  it('stays quiet where RMT is not the default or no parallel driver is offered', () => {
    expect(suggestParallelLedDriver('esp32-c6', '', 8)).toBeNull()
    expect(suggestParallelLedDriver('esp32-c3', '', 8)).toBeNull()
    expect(suggestParallelLedDriver('esp32', '', 12)).toBeNull()
    expect(suggestParallelLedDriver('esp32-s3', '', 17)).toBeNull()
  })
})

describe('Board LED driver selection', () => {
  it('resolves the chosen driver from the Board profile, never from a stale value', () => {
    expect(selectedLedDriver([board({ profileId: S3, ledDriver: 'LCD_CLOCKLESS' })])?.bus).toBe('LCD_CLOCKLESS')
    expect(selectedLedDriver([board({ profileId: ESP32, ledDriver: 'LCD_CLOCKLESS' })])).toBeNull()
    expect(selectedLedDriver([board({ profileId: '', ledDriver: 'LCD_CLOCKLESS' })])).toBeNull()
    expect(selectedLedDriver([board({ profileId: S3 })])).toBeNull()
    expect(ledDriverOptionsForBoard({ profileId: C6 }).map((d) => d.bus)).toEqual(['RMT'])
  })

  it('resets an unavailable driver to auto on a board change', () => {
    expect(withLedDriverNormalized({ profileId: ESP32, ledDriver: 'LCD_CLOCKLESS' }).ledDriver).toBe(LED_DRIVER_AUTO)
    const kept = { profileId: 'lolin-s3-40pin-dual-usbc', ledDriver: 'LCD_CLOCKLESS' }
    expect(withLedDriverNormalized(kept, { profileId: S3, ledDriver: 'LCD_CLOCKLESS' })).toBe(kept)
  })

  it('resets a bus name that means a different driver on the new board', () => {
    // I2S is the S3's LCD_CAM driver and the classic ESP32's I2S one.
    const next = withLedDriverNormalized({ profileId: ESP32, ledDriver: 'I2S' }, { profileId: S3, ledDriver: 'I2S' })
    expect(next.ledDriver).toBe(LED_DRIVER_AUTO)
  })
})
