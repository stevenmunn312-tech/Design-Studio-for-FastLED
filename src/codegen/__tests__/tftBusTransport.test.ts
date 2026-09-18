/*
 * One bus abstraction, and nothing writing around it.
 *
 * The colour driver gained a second transport, and the way that goes wrong is
 * not a compile error: a writer that keeps calling SPI directly still builds,
 * still works on every SPI panel, and silently pushes bytes down a bus a
 * parallel shield has not got. That is exactly what happened while this was
 * being written - the artwork blitter `_tftArt` was missed on a first reading
 * because it sits four hundred lines below the other three writers - so the
 * check below derives the rule from the emitted text rather than listing the
 * writers it knows about.
 */

import { describe, it, expect } from 'vitest'
import { tftDisplayHelpersCpp } from '../tftDisplayCpp'
import {
  customDisplayPanelFromProps, customDisplayPanelHelpersCpp, customDisplayPanelSetupCpp,
} from '../customDisplayPanelCpp'

const cpp = tftDisplayHelpersCpp()

/*
 * The screen-design driver is the *second* driver that can draw a panel, and
 * it had this rule wrong outright: every one of its writers named SPI, so a
 * design mounted on a parallel shield emitted an SPI.begin on pins the module
 * has not got and then pushed every command down a bus it does not speak. The
 * panel stayed dark, and on a board whose SPI defaults name a GPIO that does
 * not exist the sketch did not survive setup at all. The same derivation is
 * applied to it here rather than trusting that one driver's fix taught the
 * other.
 */
const parallelEmit = customDisplayPanelFromProps('panel', {
  partId: 'ili9341-xc4630-parallel-touch-320x240',
  csPin: 7, dcPin: 8, resetPin: 9, wrPin: 10, rdPin: 11,
  d0Pin: 5, d1Pin: 6, d2Pin: 12, d3Pin: 13, d4Pin: 14, d5Pin: 15, d6Pin: 16, d7Pin: 17,
})
const parallelPanel = customDisplayPanelHelpersCpp(parallelEmit)
const parallelSetup = customDisplayPanelSetupCpp(parallelEmit).join('\n')
const CD_PRIMITIVES = ['_cdTxnBegin_panel', '_cdTxnEnd_panel', '_cdWrite8_panel']

/** The bodies of the three functions allowed to name SPI. */
const PRIMITIVES = ['_tftTxnBegin', '_tftTxnEnd', '_tftWrite8']

/** Every emitted line, paired with the function it sits inside. */
function linesByFunction(source: string): { fn: string; line: string; n: number }[] {
  const out: { fn: string; line: string; n: number }[] = []
  let fn = '<file scope>'
  source.split('\n').forEach((line, index) => {
    const declaration = /^static (?:inline )?[\w*&]+ (_\w+)\s*\(/.exec(line)
    if (declaration) fn = declaration[1]
    out.push({ fn, line, n: index + 1 })
  })
  return out
}

describe('the colour driver speaks through one bus abstraction', () => {
  it('names SPI only inside the three bus primitives', () => {
    const offenders = linesByFunction(cpp)
      .filter(({ line }) => /\bSPI\.(transfer|beginTransaction|endTransaction)\b/.test(line))
      .filter(({ fn }) => !PRIMITIVES.includes(fn))
      .map(({ fn, n }) => `${fn} (line ${n})`)

    expect(offenders, 'these write to SPI directly instead of _tftWrite8/_tftTxn*').toEqual([])
  })

  it('still routes every writer through the abstraction', () => {
    // The inverse of the check above: proves the emitted driver actually has
    // writers, so the assertion above cannot pass by the text having changed
    // shape and matching nothing.
    const callers = new Set(
      linesByFunction(cpp)
        .filter(({ line }) => /_tftWrite8\(/.test(line))
        .map(({ fn }) => fn)
        .filter((fn) => !PRIMITIVES.includes(fn)),
    )
    // Command, command+data, colour run, and the artwork blit.
    expect(callers.size).toBeGreaterThanOrEqual(4)
    for (const required of ['_tftCommand', '_tftCommandData', '_tftRun', '_tftArt']) {
      expect(callers, `${required} must write through _tftWrite8`).toContain(required)
    }
  })

  it('drives eight data lines and latches on a rising write strobe', () => {
    const write8 = cpp.slice(cpp.indexOf('static inline void _tftWrite8'))
      .slice(0, cpp.slice(cpp.indexOf('static inline void _tftWrite8')).indexOf('\n}\n'))
    // Least-significant bit first, one line per bit.
    expect(write8).toMatch(/for \(uint8_t b = 0; b < 8; b\+\+\) digitalWrite\(p\.d\[b\], \(value >> b\) & 1\)/)
    // WR falls then rises: the controller latches on the rising edge, so the
    // pulse has to close before the next byte is set up.
    const fall = write8.indexOf('digitalWrite(p.wr, LOW)')
    const rise = write8.indexOf('digitalWrite(p.wr, HIGH)')
    expect(fall, 'WR must be pulsed low').toBeGreaterThan(-1)
    expect(rise, 'WR must return high').toBeGreaterThan(fall)
  })

  it('holds the screen-design driver to the same rule', () => {
    const offenders = linesByFunction(parallelPanel)
      .filter(({ line }) => /\bSPI\.(transfer|beginTransaction|endTransaction)\b/.test(line))
      .filter(({ fn }) => !CD_PRIMITIVES.includes(fn))
      .map(({ fn, n }) => `${fn} (line ${n})`)
    expect(offenders, 'these bypass _cdWrite8_/_cdTxn*').toEqual([])
  })

  it('routes every screen-design writer through the abstraction', () => {
    // The inverse check, so the one above cannot pass by matching nothing.
    const callers = new Set(
      linesByFunction(parallelPanel)
        .filter(({ line }) => /_cdWrite8_panel\(/.test(line))
        .map(({ fn }) => fn)
        .filter((fn) => !CD_PRIMITIVES.includes(fn)),
    )
    // Command, command+data, and the pixel flush.
    for (const required of ['_cdPanelCmd_panel', '_cdPanelCmdData_panel', '_cdFlush_panel']) {
      expect(callers, `${required} must write through _cdWrite8_panel`).toContain(required)
    }
  })

  it('starts no serial bus for a screen design on a parallel panel', () => {
    // The bug this exists for: the module has no SCK or MOSI to name, so the
    // emitter fell back to SPI defaults — pins either in use by the panel's own
    // data lines or absent from the board, which is a dead sketch rather than
    // just a dark screen.
    expect(parallelSetup).not.toContain('SPI.begin')
    expect(parallelSetup).toContain('_cdPanel_panel.parallel = true;')
    expect(parallelSetup).toContain('_cdPanel_panel.wr = 10; _cdPanel_panel.rd = 11;')
    // Data low and WR high at rest, so the first strobe is a real edge, and RD
    // driven high so the controller never drives the bus back.
    expect(parallelSetup).toMatch(/digitalWrite\(_cdPanel_panel\.d\[b\], LOW\)/)
    expect(parallelSetup).toContain('digitalWrite(_cdPanel_panel.wr, HIGH)')
    expect(parallelSetup).toContain('digitalWrite(_cdPanel_panel.rd, HIGH)')
  })

  it('keeps an SPI screen design exactly as it was', () => {
    const spi = customDisplayPanelSetupCpp(customDisplayPanelFromProps('panel', {
      partId: 'st7789v-xpt2046-touch-240x320',
    })).join('\n')
    expect(spi).toContain('SPI.begin(')
    expect(spi).toContain('_cdPanel_panel.parallel = false;')
  })

  it('holds RD high so the panel never drives the bus back', () => {
    // Floating or low, the controller drives the data lines and every write
    // collides with its output - a fault that reads as a dead panel.
    expect(cpp).toMatch(/pinMode\(p\.rd, OUTPUT\); digitalWrite\(p\.rd, HIGH\)/)
  })

  it('starts the SPI peripheral only for a panel that has one', () => {
    // A parallel panel owns its pins outright and has no peripheral to start;
    // calling SPI.begin for one would claim SCK and MOSI it never uses.
    expect(cpp).toMatch(/if \(p\.parallel\) \{[\s\S]*?\} else if \(!_tftSpiStarted\) \{/)
  })

  it('defaults to SPI when a caller says nothing about data lines', () => {
    // Every existing emitter calls _tftBegin without the parallel arguments,
    // so the default decides what those panels are. A panel that does not name
    // eight data lines has not got them.
    expect(cpp).toMatch(/const uint8_t \*dataPins = nullptr/)
    expect(cpp).toMatch(/p\.parallel = \(dataPins != nullptr\)/)
  })
})
