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

const cpp = tftDisplayHelpersCpp()

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
