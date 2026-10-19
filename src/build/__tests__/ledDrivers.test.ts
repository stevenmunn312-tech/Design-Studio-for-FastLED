import { describe, expect, it } from 'vitest'
import { CHIPSET_WIRE, chipsetSendMicros, ledDriverFacts, rmtOutputsThatFit } from '../ledDrivers'
import { ADDRESSABLE_CHIPSET_OPTIONS } from '../../state/nodeLibrary'
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
