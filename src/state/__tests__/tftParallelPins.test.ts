/*
 * What a parallel colour panel wires, and why four of its lines are special.
 *
 * The ADC rule below is the one worth a test rather than a comment: a touch
 * sheet placed on the ESP32-S3's ADC2 works perfectly on a bench and goes dead
 * the moment anything enables Wi-Fi. Nothing in a preview or a compile can show
 * that, so it has to be held here.
 */

import { describe, it, expect } from 'vitest'
import {
  TFT_TRANSPORT_PINS, PARALLEL_TOUCH_ELECTRODES, PARALLEL_TOUCH_PIN_KEYS,
} from '../tftSurface'
import {
  isGpioPinProperty, isPropertyEnabled, gpioRequirementForProperty, libraryDefaults,
  transportDisplayPinKeysForProps, tftTransportForProps,
} from '../nodeLibrary'
import { BOARD_GPIO_BY_FQBN, pinSupports, pinWarningForCapability } from '../boardGpio'
import { catalogueDisplays, displayHasTouch, partById as catPart, partPinLabelForProperty } from '../partCatalogue'

const XC4630 = 'ili9341-xc4630-parallel-touch-320x240'
const ST7789V = 'st7789v-xpt2046-touch-240x320'
const S3 = 'esp32:esp32:esp32s3'

const props = (partId: string) => ({ ...libraryDefaults('TransportDisplay'), partId })

describe('a parallel panel wires its own lines and no others', () => {
  it('shows thirteen parallel lines and none of the SPI ones', () => {
    const keys = transportDisplayPinKeysForProps(props(XC4630))
    expect(tftTransportForProps(props(XC4630))).toBe('parallel')
    expect(keys.length).toBe(13)
    expect(keys).toEqual([...TFT_TRANSPORT_PINS.parallel])
    // No clock, no data-out, no touch header: the sheet has no lines of its own.
    for (const spiOnly of ['sckPin', 'mosiPin', 'misoPin', 'touchCsPin', 'touchSckPin']) {
      expect(keys, spiOnly).not.toContain(spiOnly)
    }
  })

  it("leaves an SPI panel's pins exactly as they were", () => {
    const keys = transportDisplayPinKeysForProps(props(ST7789V))
    expect(tftTransportForProps(props(ST7789V))).toBe('spi')
    expect(keys).toContain('sckPin')
    for (const parallelOnly of ['wrPin', 'rdPin', 'd0Pin', 'd7Pin']) {
      expect(keys, parallelOnly).not.toContain(parallelOnly)
    }
  })

  it("hides the other transport's fields rather than leaving them editable", () => {
    // The gate is derived from the transport map; listing groups by hand left
    // the parallel lines uncovered and showing on every SPI panel.
    for (const key of ['wrPin', 'rdPin', 'd0Pin', 'd3Pin', 'd7Pin']) {
      expect(isGpioPinProperty('TransportDisplay', key), key).toBe(true)
      expect(isPropertyEnabled('TransportDisplay', key, props(ST7789V)), key).toBe(false)
      expect(isPropertyEnabled('TransportDisplay', key, props(XC4630)), key).toBe(true)
    }
    expect(isPropertyEnabled('TransportDisplay', 'sckPin', props(XC4630))).toBe(false)
  })

  it('carries a default for every line it claims', () => {
    const defaults = libraryDefaults('TransportDisplay')
    for (const key of TFT_TRANSPORT_PINS.parallel) {
      expect(defaults[key], key).toBeTypeOf('number')
    }
  })
})

describe('the four shared touch electrodes', () => {
  it('are panel pins, not a second claim on them', () => {
    // Each electrode names a line the panel already declares - there is no
    // extra wire, which is why no collision check has to learn about this.
    for (const key of PARALLEL_TOUCH_PIN_KEYS) {
      expect(TFT_TRANSPORT_PINS.parallel, key).toContain(key)
    }
    expect(Object.keys(PARALLEL_TOUCH_ELECTRODES).sort()).toEqual(['xm', 'xp', 'ym', 'yp'])
  })

  it('require analog input, which the other nine do not', () => {
    for (const key of PARALLEL_TOUCH_PIN_KEYS) {
      expect(gpioRequirementForProperty('TransportDisplay', key, props(XC4630)), key)
        .toEqual({ capability: 'analogInput', pullup: false })
    }
    const plain = TFT_TRANSPORT_PINS.parallel.filter((k) => !PARALLEL_TOUCH_PIN_KEYS.includes(k))
    expect(plain.length).toBe(9)
    for (const key of plain) {
      expect(gpioRequirementForProperty('TransportDisplay', key, props(XC4630))?.capability, key)
        .toBe('digitalOutput')
    }
  })

  it('does not impose analog on the same property for an SPI panel', () => {
    // csPin and dcPin exist on both transports and are ordinary outputs on SPI.
    for (const key of ['csPin', 'dcPin']) {
      expect(gpioRequirementForProperty('TransportDisplay', key, props(ST7789V))?.capability, key)
        .toBe('digitalOutput')
    }
  })

  it('defaults onto ADC1, where the radio cannot disable the reading', () => {
    const board = BOARD_GPIO_BY_FQBN[S3]
    const defaults = libraryDefaults('TransportDisplay')
    for (const key of PARALLEL_TOUCH_PIN_KEYS) {
      const pin = board.recommended.find((note) => note.pin === defaults[key])
      expect(pin, `${key} -> GPIO${defaults[key]} is not a usable S3 pin`).toBeDefined()
      expect(pinSupports(pin!, 'analogInput'), `${key} must read analog`).toBe(true)
      expect(pinSupports(pin!, 'digitalOutput'), `${key} must also drive`).toBe(true)
      // An ADC2 pin carries the Wi-Fi caveat; ADC1 carries none.
      expect(pinWarningForCapability(pin!, 'analogInput'), `${key} defaults onto ADC2`)
        .toBeUndefined()
    }
  })

  it('leaves the board table free to disagree, and fails loudly if it does', () => {
    // Proves the check above is reading real capability data rather than
    // asserting against itself: an ADC2 pin must trip the same caveat.
    const adc2 = BOARD_GPIO_BY_FQBN[S3].recommended.find((note) => note.pin === 15)
    expect(pinSupports(adc2!, 'analogInput')).toBe(true)
    expect(pinWarningForCapability(adc2!, 'analogInput')).toMatch(/Wi-Fi/)
  })
})

describe('parallel pin labels', () => {
  it('resolve to the names the board actually prints', () => {
    // The shield silkscreens LCD_RS for what an SPI board prints DC, and the
    // data lines as LCD_D0..LCD_D7.
    expect(partPinLabelForProperty(XC4630, 'dcPin')).toBe('LCD_RS')
    expect(partPinLabelForProperty(XC4630, 'csPin')).toBe('LCD_CS')
    expect(partPinLabelForProperty(XC4630, 'wrPin')).toBe('LCD_WR')
    expect(partPinLabelForProperty(XC4630, 'rdPin')).toBe('LCD_RD')
    expect(partPinLabelForProperty(XC4630, 'd0Pin')).toBe('LCD_D0')
    expect(partPinLabelForProperty(XC4630, 'd7Pin')).toBe('LCD_D7')
  })
})

describe('a panel can have touch without naming a digitiser', () => {
  it('reports touch for a bare sheet, which has no controller to name', () => {
    // The whole point of the distinction: this board's `touchController` is
    // honestly null, and a reader that asked only that treated it as having no
    // touch at all - which is what stopped the hardware view pairing a Touch
    // node with it and stopped the generator emitting the read.
    expect(catPart(XC4630)?.display?.touchController).toBeNull()
    expect(catPart(XC4630)?.display?.touchSurface).toBe('resistive-shared')
    expect(displayHasTouch(XC4630)).toBe(true)
  })

  it('still reports touch for a panel that does name one', () => {
    expect(catPart(ST7789V)?.display?.touchController).toBe('XPT2046')
    expect(displayHasTouch(ST7789V)).toBe(true)
  })

  it('reports none for a panel with neither', () => {
    expect(displayHasTouch('st7789-tft-240x240')).toBe(false)
    expect(displayHasTouch('ssd1306-oled-128x64')).toBe(false)
    expect(displayHasTouch('not-a-part')).toBe(false)
  })

  it('is the only way the question is asked', () => {
    // Ten readers asked `display.touchController` directly and answered "no
    // touch" for a controller-less sheet. Two may still ask the narrow
    // question - the pin gate needs a digitiser before an SPI panel has a
    // touch *header*, and the manifest records the controller's identity -
    // and every other caller goes through the predicate.
    const touched = catalogueDisplays().filter((entry) => displayHasTouch(entry.partId))
    expect(touched.map((entry) => entry.partId).sort()).toEqual([
      'ili9341-xc4630-parallel-touch-320x240',
      'ili9341-xpt2046-touch-320x240',
      'st7789v-xpt2046-touch-240x320',
    ])
  })
})
