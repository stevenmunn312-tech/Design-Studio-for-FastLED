import { describe, it, expect } from 'vitest'
import {
  peripheralPadCount, peripheralPadLabel, peripheralPowerPadIndex,
  peripheralGroundPadIndex, peripheralSignalPadIndex, peripheralPowerNet,
  micChannelSelectPadIndex, MODULE_PAD_GEOMETRY, transceiverEnableBridgePads,
  receiveDivider, peripheralSignalEndPoint, peripheralPadPoint, PERIPHERAL_RENDER_H,
} from '../physicalDiagramLayout'
import { MIC_MODULES } from '../../../state/micModules'
import { partById } from '../../../state/partCatalogue'
import type { HardwareManifestItem } from '../../../build/hardwareManifest'

function item(kind: HardwareManifestItem['kind'], partId: string, facts: Record<string, unknown> = {}): HardwareManifestItem {
  return {
    id: `${kind}:x`, kind, title: kind, subtitle: '', sourceNodeId: 'x',
    supported: true, pins: [], facts: { partId, ...facts },
  } as HardwareManifestItem
}

function pin(propertyKey: string) {
  return { propertyKey } as HardwareManifestItem['pins'][number]
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
      expect(labels[peripheralPowerPadIndex(entry)!], `${partId} supply`)
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

  /*
   * The manifest pushes SDA then SCL for an I2C OLED and CS, DC, RESET, CLK,
   * MOSI for an SPI one, so the positional fallback has to follow the module's
   * transport. Reading the SPI order for a four-pin module drew SDA on the CS
   * pad and SCL on the DC pad — on a board that has neither.
   */
  it('routes an I2C OLED to SDA and SCL rather than to the SPI order', () => {
    const oled = item('info-display', 'sh1106-oled-128x64-i2c')
    const labels = pads(oled)
    expect(labels[peripheralSignalPadIndex(oled, 0)]).toBe('SDA')
    expect(labels[peripheralSignalPadIndex(oled, 1)]).toBe('SCL')
  })

  // Adafruit prints the SPI names on the two lines its breakout answers I2C on,
  // so the data line is found as DATA and the clock as CLK.
  it('finds an I2C line printed with its SPI name', () => {
    const oled = {
      ...item('info-display', 'ssd1306-oled-128x64'),
      pins: ['sdaPin', 'sclPin'].map(pin),
    }
    const labels = pads(oled)
    expect(oled.pins.map((_, index) => labels[peripheralSignalPadIndex(oled, index)]))
      .toEqual(['DATA', 'CLK'])
  })

  it('routes the square ST7789 signals to its SCL/SDA/RST/BL silkscreen pads', () => {
    const tft = {
      ...item('transport-display', 'st7789-tft-240x240'),
      pins: ['sckPin', 'mosiPin', 'csPin', 'dcPin', 'resetPin', 'backlightPin'].map(pin),
    }
    const labels = pads(tft)
    expect(tft.pins.map((_, index) => labels[peripheralSignalPadIndex(tft, index)]))
      .toEqual(['SCL', 'SDA', 'CS', 'DC', 'RST', 'BL'])
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

  /*
   * Every microphone the app may offer, derived from the one list that decides
   * that — so a fourth module cannot reach the Add Hardware menu drawn wrong.
   *
   * These three agree on nothing but the count: six pads in three different
   * silkscreen orders, supply printed VDD on two and 3V on the third, channel
   * select printed L/R on two and SEL on the third. The diagram used to place
   * all six as a hardcoded column in a fixed BCLK/WS/L-R/DOUT/VDD/GND order,
   * which is not the order, the shape or the edge that any of them has.
   */
  it.each(MIC_MODULES.map((module) => [module.partId] as const))(
    'finds every role on %s by the name printed beside it',
    (partId) => {
      const mic = item('mic-input', partId)
      const labels = pads(mic)
      expect(labels).toEqual(partById(partId)!.pinLabelsLeftToRight)
      expect(labels[peripheralPowerPadIndex(mic)!], 'supply').toMatch(/^(VDD|3V|3V3)$/)
      expect(labels[peripheralGroundPadIndex(mic)], 'ground').toBe('GND')
      expect(labels[micChannelSelectPadIndex(mic)!], 'channel select').toMatch(/^(L\/R|SEL)$/)
      // The manifest pushes WS, SCK then SD; each lands on the pad its own
      // module prints that line as.
      const wired = item('mic-input', partId)
      wired.pins = [pin('i2sWs'), pin('i2sSck'), pin('i2sSd')]
      expect(labels[peripheralSignalPadIndex(wired, 0)], 'WS').toMatch(/^(WS|LRCL)$/)
      expect(labels[peripheralSignalPadIndex(wired, 1)], 'SCK').toMatch(/^(SCK|BCLK)$/)
      expect(labels[peripheralSignalPadIndex(wired, 2)], 'SD').toMatch(/^(SD|DOUT)$/)
      // A supply pad that reads VDD is a 3.3 V part, not an unknown one.
      expect(peripheralPowerNet(mic)).toBe('v3v3')
      // And it is drawn from a measured row, not spread evenly across its render.
      const geometry = MODULE_PAD_GEOMETRY[partId]
      expect(geometry, `${partId} has no measured pads`).toBeDefined()
      expect(new Set(geometry!.map(([, y]) => y)).size, 'one row, one y').toBe(1)
      expect(geometry!.every(([, y]) => y > 0.7), 'along the bottom edge').toBe(true)
    },
  )

  // Nothing else has a channel-select pad, and asking by name is what keeps it
  // that way — an OLED's CS pad must not answer to it.
  it('finds no channel-select pad on a module that has none', () => {
    expect(micChannelSelectPadIndex(item('info-display', 'sh1106-oled-128x64'))).toBeNull()
    expect(micChannelSelectPadIndex(item('sd-card', 'microsd-module-5v'))).toBeNull()
  })

  it('still draws the uncatalogued modules that predate the catalogue', () => {
    expect(pads(item('encoder-input', 'encoder-module'))).toEqual(['VCC', 'A', 'B', 'SW', 'GND'])
    expect(pads(item('button-input', 'button-module'))).toEqual(['VCC', 'SIG', 'GND'])
  })
})

describe('the DMX512 transceiver', () => {
  const dmx = () => ({
    ...item('dmx-input', 'max485-rs485-module'),
    pins: [pin('dmxTxPin'), pin('dmxRxPin'), pin('dmxEnablePin')],
  })

  it('lands TX on DI, RX on RO and the enable line on DE', () => {
    const entry = dmx()
    expect([0, 1, 2].map((index) => peripheralPadLabel(entry, peripheralSignalPadIndex(entry, index))))
      .toEqual(['DI', 'RO', 'DE'])
  })

  it('bridges RE to DE, since only DE has a wire', () => {
    const entry = dmx()
    const bridge = transceiverEnableBridgePads(entry)!
    expect(bridge.map((index) => peripheralPadLabel(entry, index))).toEqual(['RE', 'DE'])
    expect(transceiverEnableBridgePads(item('power-monitor-input', 'adafruit-ina219-current-sensor'))).toBeNull()
  })

  // The MAX485 is specified for 4.75-5.25 V, so it takes the 5 V rail; the
  // receive divider (below) is what keeps RO's 5 V off the ESP32's RX pin.
  it('powers the module from 5 V, on its VCC pad, with GND on GND', () => {
    const entry = dmx()
    expect(peripheralPowerNet(entry)).toBe('v5')
    expect(peripheralPadLabel(entry, peripheralPowerPadIndex(entry)!)).toBe('VCC')
    expect(peripheralPadLabel(entry, peripheralGroundPadIndex(entry))).toBe('GND')
  })

  describe('receive divider', () => {
    const layout = () => ({ x: 400, y: 300, item: dmx() }) as unknown as Parameters<typeof receiveDivider>[0]

    it('ends the RX wire on the divider junction, and every other wire on its pad', () => {
      const l = layout()
      const divider = receiveDivider(l)!
      expect(divider.signalIndex).toBe(1)
      expect(peripheralSignalEndPoint(l, 1)).toEqual(divider.junction)
      for (const index of [0, 2]) {
        expect(peripheralSignalEndPoint(l, index))
          .toEqual(peripheralPadPoint(l, peripheralSignalPadIndex(l.item, index)))
      }
    })

    it('starts at RO and runs RO, 1 kΩ, junction, 2 kΩ, ground from right to left below the module', () => {
      const l = layout()
      const divider = receiveDivider(l)!
      expect(divider.roPad).toEqual(peripheralPadPoint(l, pads(l.item).indexOf('RO')))
      expect(divider.y).toBeGreaterThan(l.y + PERIPHERAL_RENDER_H)
      // Series resistor between RO and the junction; shunt beyond the junction.
      expect(divider.seriesX).toBeLessThan(divider.roPad.x)
      expect(divider.junction.x).toBeLessThan(divider.seriesX)
      expect(divider.shuntX).toBeLessThan(divider.junction.x)
      expect(divider.ground.x).toBeLessThan(divider.shuntX)
    })

    it('belongs only to the transceiver', () => {
      const other = { x: 0, y: 0, item: item('power-monitor-input', 'adafruit-ina219-current-sensor') }
      expect(receiveDivider(other as unknown as Parameters<typeof receiveDivider>[0])).toBeNull()
    })
  })
})
