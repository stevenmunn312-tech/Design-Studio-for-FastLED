import { describe, expect, it } from 'vitest'
import {
  CHIPSET_WIRE, CLOCKED_DATA_RATES_MHZ, chipsetSendMicros, clockedRateFix, dataRateAfterChipsetChange,
  dataRateOptionsMhz, defaultDataRateMhz, effectiveDataRateMhz, ledDriverFacts, rmtOutputsThatFit,
} from '../ledDrivers'
import { ADDRESSABLE_CHIPSET_OPTIONS, SPI_CHIPSETS } from '../../state/nodeLibrary'
import type { BuildTargetFamily } from '../buildProfile'

describe('LED driver facts', () => {
  it('records the RMT5 TX channel counts FastLED documents', () => {
    expect(ledDriverFacts('esp32').rmt?.txChannels).toBe(8)
    expect(ledDriverFacts('esp32-s3').rmt?.txChannels).toBe(4)
    for (const family of ['esp32-c3', 'esp32-c6', 'esp32-h2'] as BuildTargetFamily[]) {
      expect(ledDriverFacts(family).rmt?.txChannels).toBe(2)
    }
  })

  it('names FastLED 3.10.5 default buses', () => {
    expect(ledDriverFacts('esp32-s3').clocklessBus).toBe('RMT')
    expect(ledDriverFacts('esp32-c6').clocklessBus).toBe('PARLIO')
    expect(ledDriverFacts('esp32-s3').spiBus).toBe('LCD_SPI')
    expect(ledDriverFacts('esp32').spiBus).toBe('I2S_SPI')
    expect(ledDriverFacts('teensy', 'teensy:avr:teensy41').clocklessBus).toBe('OBJECT_FLED')
  })

  it('sends one output after another where there is no parallel driver', () => {
    for (const family of ['avr', 'esp8266', 'rp2040', 'samd', 'unknown'] as BuildTargetFamily[]) {
      expect(ledDriverFacts(family).parallelOutputs).toBe(1)
    }
    expect(ledDriverFacts('teensy', 'teensy:avr:teensy32').parallelOutputs).toBe(1)
  })

  it('separates chips that share a family', () => {
    expect(ledDriverFacts('teensy', 'teensy:avr:teensy32').fpu).toBe(false)
    expect(ledDriverFacts('teensy', 'teensy:avr:teensy36').fpu).toBe(true)
    expect(ledDriverFacts('rp2040', 'rp2040:rp2040:rpipicow').fpu).toBe(false)
    expect(ledDriverFacts('rp2040', 'rp2040:rp2040:rpipico2').fpu).toBe(true)
    expect(ledDriverFacts('esp32-s2').fpu).toBe(false)
    expect(ledDriverFacts('esp32-s3').fpu).toBe(true)
  })

  it('counts RMT outputs that fit with and without a network', () => {
    const s3 = ledDriverFacts('esp32-s3').rmt!
    expect(rmtOutputsThatFit(s3, false)).toBe(2)   // 192 / (2 × 48)
    expect(rmtOutputsThatFit(s3, true)).toBe(1)    // 192 / (3 × 48)
    const classic = ledDriverFacts('esp32').rmt!
    expect(rmtOutputsThatFit(classic, false)).toBe(4)
    expect(rmtOutputsThatFit(classic, true, 64)).toBe(2)
  })
})

describe('chipset wire time', () => {
  it('has a figure for every chipset the LED output offers', () => {
    for (const chipset of ADDRESSABLE_CHIPSET_OPTIONS) expect(CHIPSET_WIRE[chipset]).toBeDefined()
  })

  it('charges 30 µs an LED for an 800 kHz RGB part plus its reset', () => {
    expect(chipsetSendMicros('WS2812B', 1000)).toBeCloseTo(30_000 + 280, 5)
    expect(chipsetSendMicros('SK6812-RGBW', 100)).toBeCloseTo(100 * 32 * 1.2 + 80, 5)
    expect(chipsetSendMicros('WS2816', 100)).toBeCloseTo(100 * 48 * 1.25 + 280, 5)
  })

  it('times clocked parts at FastLED default rates, or the one given', () => {
    // 100 LEDs × 32 bits + 32 start + 50 end bits at 6 MHz.
    expect(chipsetSendMicros('APA102', 100)).toBeCloseTo((3200 + 32 + 50) / 6, 5)
    expect(chipsetSendMicros('APA102', 100, 12_000_000)).toBeCloseTo((3200 + 32 + 50) / 12, 5)
    expect(chipsetSendMicros('WS2801', 100)).toBeCloseTo(2400, 5)
    expect(chipsetSendMicros('HD108', 100)).toBeCloseTo((6400 + 128) / 25, 5)
  })
})

describe('clocked data rates', () => {
  it('offers every clocked chipset a whole-MHz list holding FastLED\'s default', () => {
    expect(Object.keys(CLOCKED_DATA_RATES_MHZ).sort()).toEqual([...SPI_CHIPSETS].sort())
    for (const chipset of SPI_CHIPSETS) {
      const rates = dataRateOptionsMhz(chipset)
      expect(rates).toContain(defaultDataRateMhz(chipset))
      expect([...rates].sort((a, b) => a - b)).toEqual(rates)
      for (const rate of rates) expect(Number.isInteger(rate)).toBe(true)
    }
    expect(defaultDataRateMhz('APA102')).toBe(6)
    expect(defaultDataRateMhz('HD108')).toBe(25)
    expect(defaultDataRateMhz('WS2801')).toBe(1)
    expect(Math.max(...dataRateOptionsMhz('APA102'))).toBe(24)
    expect(Math.max(...dataRateOptionsMhz('HD108'))).toBe(40)
    expect(Math.max(...dataRateOptionsMhz('WS2801'))).toBe(25)
  })

  it('has no rate for a clockless chipset', () => {
    expect(defaultDataRateMhz('WS2812B')).toBeNull()
    expect(dataRateOptionsMhz('WS2812B')).toEqual([])
    expect(effectiveDataRateMhz('WS2812B', 12)).toBeNull()
  })

  it('reads 0, stale and hand-edited rates as FastLED\'s default', () => {
    expect(effectiveDataRateMhz('APA102', 0)).toBe(6)
    expect(effectiveDataRateMhz('APA102', undefined)).toBe(6)
    expect(effectiveDataRateMhz('APA102', 40)).toBe(6)
    expect(effectiveDataRateMhz('APA102', '12')).toBe(12)
    expect(effectiveDataRateMhz('HD108', 40)).toBe(40)
  })

  it('resets a rate the new chipset cannot use, or the old default', () => {
    expect(dataRateAfterChipsetChange('HD108', 'APA102', 40)).toBe(0)
    expect(dataRateAfterChipsetChange('APA102', 'HD108', 6)).toBe(0)
    expect(dataRateAfterChipsetChange('APA102', 'APA102HD', 12)).toBe(12)
    expect(dataRateAfterChipsetChange('APA102', 'WS2812B', 12)).toBe(0)
    expect(dataRateAfterChipsetChange('WS2812B', 'APA102', 0)).toBe(0)
  })

  it('names the next rate up as the faster-clock fix', () => {
    expect(clockedRateFix('APA102', 0)).toEqual({ fromMhz: 6, toMhz: 8 })
    expect(clockedRateFix('HD108', 30)).toEqual({ fromMhz: 30, toMhz: 40 })
    expect(clockedRateFix('APA102', 24)).toBeNull()
    expect(clockedRateFix('WS2812B', 0)).toBeNull()
  })
})
