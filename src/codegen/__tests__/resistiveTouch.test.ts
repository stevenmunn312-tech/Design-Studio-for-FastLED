/*
 * Reading a touch sheet that is wired to the LCD bus.
 *
 * The load-bearing rule is not the maths, it is the borrowing: all four pins
 * are LCD lines the rest of the frame drives as outputs, so every exit from the
 * read has to hand them back. Miss one and the next panel write goes out with a
 * pin still configured as an input - and because this panel keeps no
 * framebuffer, the corrupted write stays on the glass until that field happens
 * to change. That is a fault you would chase on hardware for an hour and never
 * reproduce in a preview, so it is pinned here.
 */

import { describe, it, expect } from 'vitest'
import { RESISTIVE_TOUCH_CPP_HELPERS, TFT_TOUCH_CPP_HELPERS } from '../tftTouchCpp'
import { PARALLEL_TOUCH_ELECTRODES } from '../../state/tftSurface'

/** The body of one emitted C++ function. */
function body(source: string, name: string): string {
  const start = source.indexOf(`static bool ${name}(`) >= 0
    ? source.indexOf(`static bool ${name}(`)
    : source.indexOf(`static void ${name}(`)
  expect(start, `${name} is not emitted`).toBeGreaterThan(-1)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1)
  }
  throw new Error(`unbalanced braces in ${name}`)
}

const resPoint = body(RESISTIVE_TOUCH_CPP_HELPERS, '_resPoint')

describe('the resistive read hands its pins back', () => {
  it('releases the bus on every path out of the read', () => {
    // Split on each `return`, and require a release between the start of the
    // function (or the previous return) and this one. Derived from the emitted
    // text rather than counting known branches, so a future early-exit added
    // without a release fails here.
    const segments = resPoint.split(/\breturn\b/)
    // Last segment is whatever follows the final return, not a path.
    const paths = segments.slice(0, -1)
    expect(paths.length, 'expected at least the pressure bail and the normal exit')
      .toBeGreaterThanOrEqual(2)
    paths.forEach((path, index) => {
      expect(path, `return #${index + 1} leaves the pins as inputs`)
        .toMatch(/_resRelease\(/)
    })
  })

  it('drives all four pins as outputs when it releases them', () => {
    const release = body(RESISTIVE_TOUCH_CPP_HELPERS, '_resRelease')
    for (const pin of ['xp', 'xm', 'yp', 'ym']) {
      expect(release, `${pin} must be restored to OUTPUT`)
        .toMatch(new RegExp(`pinMode\\(${pin}, OUTPUT\\)`))
      // Driven to a known level, not left floating at whatever the read left.
      expect(release, `${pin} must be driven, not left floating`)
        .toMatch(new RegExp(`digitalWrite\\(${pin}, LOW\\)`))
    }
  })

  it('checks pressure before measuring a position', () => {
    // Measuring first and testing after would report a coordinate for a sheet
    // nobody is touching.
    const zRead = resPoint.indexOf('TOUCH_Z_MIN')
    const xRead = resPoint.indexOf('rawX =')
    expect(zRead).toBeGreaterThan(-1)
    expect(xRead).toBeGreaterThan(zRead)
  })

  it('settles after every direction change before sampling', () => {
    // A resistive sheet does not switch instantly and the ADC is faster than it
    // is, so a sample taken immediately reads the previous level.
    const samples = [...resPoint.matchAll(/analogRead\(/g)].length
    const settles = [...resPoint.matchAll(/delayMicroseconds\(TOUCH_SETTLE_US\)/g)].length
    expect(samples).toBeGreaterThanOrEqual(3)
    expect(settles, 'each sample needs its own settle').toBeGreaterThanOrEqual(samples)
  })
})

describe('both touch paths agree about what a reading means', () => {
  it('map raw counts through one shared helper', () => {
    // A digitiser chip and a bare sheet disagree about how a reading is
    // obtained and agree completely about what it means once obtained. Two
    // copies of the calibration span is exactly how a flipped axis gets fixed
    // on one path and not the other.
    expect(TFT_TOUCH_CPP_HELPERS).toMatch(/static bool _touchMap\(/)
    expect(body(TFT_TOUCH_CPP_HELPERS, '_xptPoint')).toMatch(/_touchMap\(/)
    expect(resPoint).toMatch(/_touchMap\(/)
    // Neither reader may do its own rotation or span arithmetic.
    for (const [name, text] of [['_xptPoint', body(TFT_TOUCH_CPP_HELPERS, '_xptPoint')], ['_resPoint', resPoint]] as const) {
      expect(text, `${name} must not rotate on its own`).not.toMatch(/rotation == 1/)
      expect(text, `${name} must not map spans on its own`).not.toMatch(/rawXTo - rawXFrom/)
    }
  })

  it('keeps the reversed-axis handling in the shared half', () => {
    const map = body(TFT_TOUCH_CPP_HELPERS, '_touchMap')
    // An empty span is refused; a descending one is not, because a flip is the
    // same linear map with its endpoints swapped.
    expect(map).toMatch(/rawXTo == rawXFrom \|\| rawYTo == rawYFrom/)
    expect(map).toMatch(/rotation == 1/)
  })
})

describe('the electrodes the emitter reads', () => {
  it('are named by the panel properties they borrow', () => {
    // _resPoint takes xp/xm/yp/ym in that role order; the electrode map says
    // which panel pin plays each part, so a caller cannot pass them shuffled
    // without contradicting this table.
    expect(PARALLEL_TOUCH_ELECTRODES).toEqual({
      xp: 'd0Pin', ym: 'd1Pin', yp: 'csPin', xm: 'dcPin',
    })
    expect(RESISTIVE_TOUCH_CPP_HELPERS)
      .toMatch(/_resPoint\(uint8_t xp, uint8_t xm, uint8_t yp, uint8_t ym,/)
  })
})
