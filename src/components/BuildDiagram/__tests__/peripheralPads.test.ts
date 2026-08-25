import { describe, it, expect } from 'vitest'
import {
  peripheralPadCount, peripheralPadLabel, peripheralPowerPadIndex,
  peripheralGroundPadIndex, peripheralSignalPadIndex, peripheralPowerNet,
} from '../physicalDiagramLayout'
import { partById } from '../../../state/partCatalogue'
import type { HardwareManifestItem } from '../../../build/hardwareManifest'

function item(kind: HardwareManifestItem['kind'], partId: string, facts: Record<string, unknown> = {}): HardwareManifestItem {
  return {
    id: `${kind}:x`, kind, title: kind, subtitle: '', sourceNodeId: 'x',
    supported: true, pins: [], facts: { partId, ...facts },
  } as HardwareManifestItem
}

/** Every pad the diagram draws, in order. */
function pads(entry: HardwareManifestItem): string[] {
  return Array.from({ length: peripheralPadCount(entry) }, (_, i) => peripheralPadLabel(entry, i))
}

describe('module pads come from the part, not the category', () => {
  /*
   * These were hardcoded per kind and had drifted from the modules. The
   * catalogue figures are measured off the part, so they are the ones a person
   * wiring from this diagram will see on the board in front of them.
   */
  it.each([
    ['sh1106-oled-128x64', 'info-display'],
    ['ssd1306-oled-128x64', 'info-display'],
    ['tm1637-4digit-display', 'segment-display'],
    ['max7219-8digit-7segment', 'segment-display'],
    ['ds3231-rtc-module', 'rtc-input'],
    ['microsd-module-5v', 'sd-card'],
    ['photosensitive-ldr-module', 'light-input'],
    ['hc-sr501-pir-sensor', 'motion-input'],
  ] as Array<[string, HardwareManifestItem['kind']]>)('draws %s exactly as its header reads', (partId, kind) => {
    expect(pads(item(kind, partId))).toEqual(partById(partId)!.pinLabelsLeftToRight)
  })

  // The header this used to get wrong: six pads, not four, and SCL before SDA.
  // Wiring from the old drawing swapped the data lines.
  it('draws a DS3231 with all six pads in header order', () => {
    const rtc = item('rtc-input', 'ds3231-rtc-module')
    expect(pads(rtc)).toEqual(['32K', 'SQW', 'SCL', 'SDA', 'VCC', 'GND'])
    expect(peripheralPowerPadIndex(rtc)).toBe(4)
    expect(peripheralGroundPadIndex(rtc)).toBe(5)
    // The manifest pushes SDA then SCL; each must land on its own pad.
    expect(peripheralSignalPadIndex(rtc, 0)).toBe(3)
    expect(peripheralSignalPadIndex(rtc, 1)).toBe(2)
  })

  // This module prints its signal first, so the old VCC/SIG/GND drawing put
  // the supply wire on the signal pad.
  it('puts an LDR supply on VCC rather than on its signal pad', () => {
    const ldr = item('light-input', 'photosensitive-ldr-module')
    expect(pads(ldr)).toEqual(['S', 'VCC', 'GND'])
    expect(peripheralPowerPadIndex(ldr)).toBe(1)
    expect(peripheralSignalPadIndex(ldr, 0)).toBe(0)
  })

  it('finds supply and ground by name on every catalogued module', () => {
    const cases: Array<[HardwareManifestItem['kind'], string]> = [
      ['info-display', 'sh1106-oled-128x64'],
      ['segment-display', 'tm1637-4digit-display'],
      ['segment-display', 'max7219-8digit-7segment'],
      ['sd-card', 'microsd-module-5v'],
      ['amplifier', 'max98357a-i2s-amplifier'],
    ]
    for (const [kind, partId] of cases) {
      const entry = item(kind, partId)
      const labels = pads(entry)
      expect(labels[peripheralPowerPadIndex(entry)], `${partId} supply`)
        .toMatch(/^(VIN|VCC|3V3|3V|5V|\+5V)$/)
      expect(labels[peripheralGroundPadIndex(entry)], `${partId} ground`).toBe('GND')
    }
  })

  it('routes each display signal to the pad it is printed on', () => {
    const oled = item('info-display', 'sh1106-oled-128x64')
    const labels = pads(oled)
    // collectPinUses order: CS, DC, RESET, SCK, MOSI.
    expect(labels[peripheralSignalPadIndex(oled, 0)]).toBe('CS')
    expect(labels[peripheralSignalPadIndex(oled, 1)]).toBe('DC')
    expect(labels[peripheralSignalPadIndex(oled, 2)]).toBe('RES')
    expect(labels[peripheralSignalPadIndex(oled, 3)]).toBe('CLK')
    expect(labels[peripheralSignalPadIndex(oled, 4)]).toBe('MOSI')
  })

  it('routes a MAX7219 to its own three lines', () => {
    const seg = item('segment-display', 'max7219-8digit-7segment')
    const labels = pads(seg)
    expect(labels[peripheralSignalPadIndex(seg, 0)]).toBe('CLK')
    expect(labels[peripheralSignalPadIndex(seg, 1)]).toBe('DIN')
    expect(labels[peripheralSignalPadIndex(seg, 2)]).toBe('CS')
  })

  // Feeding a bare 3.3 V breakout from the 5 V rail destroys cards, so the
  // rail follows what the module prints on its supply pad.
  it('picks the rail the module asks for', () => {
    expect(peripheralPowerNet(item('sd-card', 'microsd-breakout-3v3'))).toBe('v3v3')
    expect(peripheralPowerNet(item('sd-card', 'microsd-module-5v'))).toBe('v5')
    expect(peripheralPowerNet(item('amplifier', 'max98357a-i2s-amplifier'))).toBe('v5')
  })

  it('still draws the uncatalogued modules that predate the catalogue', () => {
    expect(pads(item('encoder-input', 'encoder-module'))).toEqual(['VCC', 'A', 'B', 'SW', 'GND'])
    expect(pads(item('button-input', 'button-module'))).toEqual(['VCC', 'SIG', 'GND'])
  })
})
