/*
 * Which bus a colour panel speaks, and the controller behind it.
 *
 * Both answers are derived rather than listed - the transport from the
 * catalogue's own declared interface, the controller from its declared
 * controller string - so the thing worth pinning is that the derivation still
 * gives every *shipped* module the answer it needs. A catalogue re-import that
 * rewords an interface then fails here rather than on a bench, which is the
 * same guarantee `oledTransportsMatchCatalogue` gives the OLED family.
 */

import { describe, it, expect } from 'vitest'
import {
  TFT_CONTROLLERS, TFT_TRANSPORTS, tftControllerFor, tftTransportFor,
} from '../tftSurface'
import { catalogueDisplays, partById } from '../partCatalogue'

const XC4630 = 'ili9341-xc4630-parallel-touch-320x240'
const DFROBOT = 'ili9341-xpt2046-touch-320x240'
const ST7789V = 'st7789v-xpt2046-touch-240x320'
const ST7789 = 'st7789-tft-240x240'

describe('tftTransportFor', () => {
  it('reads each shipped colour module off its catalogue interface', () => {
    const transportOf = (partId: string) =>
      tftTransportFor(partById(partId)?.display?.interface)

    // The one parallel board, and the three that are not.
    expect(transportOf(XC4630), XC4630).toBe('parallel')
    expect(transportOf(DFROBOT), DFROBOT).toBe('spi')
    expect(transportOf(ST7789V), ST7789V).toBe('spi')
    expect(transportOf(ST7789), ST7789).toBe('spi')
  })

  it('finds the word rather than the leading token', () => {
    // The OLED sibling matches its leading token because an OLED breakout
    // leads with what it is. "8-bit parallel" leads with the bus width, so a
    // leading-token match would call this SPI and emit four-wire writes onto
    // eight data lines.
    expect(tftTransportFor('8-bit parallel')).toBe('parallel')
    expect(tftTransportFor('8-bit parallel (shield)')).toBe('parallel')
    expect(tftTransportFor('4-wire SPI')).toBe('spi')
    expect(tftTransportFor('SPI')).toBe('spi')
  })

  it('treats an unknown or missing interface as SPI', () => {
    // The safer wrong answer: an unexpected SPI panel stays dark, while eight
    // data strobes aimed at a four-wire panel land on pins another part owns.
    expect(tftTransportFor(undefined)).toBe('spi')
    expect(tftTransportFor('')).toBe('spi')
    expect(tftTransportFor('something new')).toBe('spi')
  })

  it('answers with a declared transport for every catalogued colour panel', () => {
    const colour = catalogueDisplays().filter(
      (entry) => tftControllerFor(entry.display?.controller) !== null,
    )
    expect(colour.length).toBeGreaterThanOrEqual(4)
    for (const entry of colour) {
      const transport = tftTransportFor(entry.display?.interface)
      expect(TFT_TRANSPORTS, entry.partId).toContain(transport)
    }
  })
})

describe('the ILI9341 descriptor', () => {
  it('resolves by name without colliding with the ST7789s', () => {
    expect(tftControllerFor('ILI9341')?.id).toBe('ILI9341')
    expect(tftControllerFor('ST7789')?.id).toBe('ST7789')
    // Longest-match-first still holds with a third entry in the table.
    expect(tftControllerFor('ST7789V')?.id).toBe('ST7789V')
  })

  it('states native portrait geometry, as the descriptor contract requires', () => {
    const ili = TFT_CONTROLLERS.ILI9341
    expect([ili.width, ili.height]).toEqual([240, 320])
    expect([ili.ramWidth, ili.ramHeight]).toEqual([240, 320])
    // The glass matches the frame memory, so neither offset applies at
    // rotation 0; `tftWindowOrigin` still derives the flipped rotations.
    expect([ili.columnOffset, ili.rowOffset]).toEqual([0, 0])
  })

  it('differs from the ST7789s on both fields a panel gets silently wrong', () => {
    // Subpixel order and inversion are the two that produce a plausible but
    // wrong picture rather than a dark one, which is why they are per
    // controller rather than assumed.
    expect(TFT_CONTROLLERS.ILI9341.colorOrder).toBe('BGR')
    expect(TFT_CONTROLLERS.ST7789.colorOrder).toBe('RGB')
    expect(TFT_CONTROLLERS.ILI9341.invert).toBe(false)
    expect(TFT_CONTROLLERS.ST7789.invert).toBe(true)
  })

  it('covers both catalogued ILI9341 modules regardless of their bus', () => {
    // One SPI breakout and one parallel shield resolve to the same controller:
    // a controller is not a transport, and the pair proves the two axes are
    // genuinely independent.
    for (const partId of [DFROBOT, XC4630]) {
      expect(tftControllerFor(partById(partId)?.display?.controller)?.id, partId)
        .toBe('ILI9341')
    }
    expect(tftTransportFor(partById(DFROBOT)?.display?.interface))
      .not.toBe(tftTransportFor(partById(XC4630)?.display?.interface))
  })
})
