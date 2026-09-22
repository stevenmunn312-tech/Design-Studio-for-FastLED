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
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { buildShowPlayer } from '../../utils/showUpload'
import { generateCpp } from '../cppGenerator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

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

/*
 * Every generator that can draw a parallel panel must read it as a sheet.
 *
 * `tftTouchServiceCpp` has always branched on `resistive`, and the normal
 * sketch has always populated it — but the SD-player walk resolved touch from
 * `touchCsPin` and friends, which a bare sheet does not have. So a player build
 * with an XC4630 compiled an XPT2046 on the library defaults 15/2/18/23/19,
 * which on a parallel shield are the panel's own register-select and data
 * lines, the amplifier's word clock and (on an S3) USB D-. It read nothing and
 * drove pins the graph never claimed, so no pin check could see it.
 *
 * Derived from the electrode map rather than hand-listing pin numbers, and run
 * over both generators, so teaching only one fails here.
 */
function resistiveGraph(): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const node = (id: string, type: string, properties: Record<string, unknown> = {}): StudioNode => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === type)
    return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
      label: type, nodeType: type, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(type), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    } } as StudioNode
  }
  const edge = (s: string, sh: string, t: string, th: string): StudioEdge =>
    ({ id: `${s}-${sh}-${t}-${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th }) as StudioEdge
  return {
    nodes: [
      node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
      node('out', 'MatrixOutput', { form: 'strip', ledCount: 32, dataPin: 1 }),
      node('sd', 'SDCard', { sdCsPin: 10, sdMosiPin: 11, sdSckPin: 12, sdMisoPin: 13 }),
      node('amp', 'Amplifier', { i2sDout: 16, i2sBclk: 17, i2sLrc: 18 }),
      node('panel', 'TransportDisplay', {
        partId: 'ili9341-xc4630-parallel-touch-320x240', tftRotation: '0',
        csPin: 2, dcPin: 4, d0Pin: 5, d1Pin: 6, resetPin: 7, wrPin: 8, rdPin: 9,
        d2Pin: 14, d3Pin: 15, d4Pin: 21, d5Pin: 38, d6Pin: 39, d7Pin: 40,
      }),
      node('panel-touch', 'TouchInput', { panelId: 'panel' }),
      node('audio', 'Audio', { sourceId: 'kind:decoder' }),
      node('collection', 'PatternCollection', { patternIds: [] }),
      node('player', 'PatternMaster'),
      node('fill', 'SolidColor'),
    ],
    edges: [
      edge('audio', 'audio', 'player', 'audio'),
      edge('collection', 'patternset', 'player', 'patternset'),
      edge('player', 'frame', 'out', 'frame'),
      edge('player', 'display', 'panel', 'display'),
      edge('panel-touch', 'controls', 'player', 'controls'),
    ],
  }
}

describe('a bare sheet is read as one by every generator that draws it', () => {
  const { nodes, edges } = resistiveGraph()
  const panel = nodes.find((entry) => entry.id === 'panel')!.data.properties as Record<string, number>
  // The pins _resPoint must be handed, in its own parameter order.
  const expected = [
    panel[PARALLEL_TOUCH_ELECTRODES.xp], panel[PARALLEL_TOUCH_ELECTRODES.xm],
    panel[PARALLEL_TOUCH_ELECTRODES.yp], panel[PARALLEL_TOUCH_ELECTRODES.ym],
  ].join(', ')

  const sketches: Array<[string, string]> = [
    ['SD player', buildShowPlayer(nodes, edges, {}, {} as never)],
    // The same panel without the player: touch leaves through the Touch node
    // into the LED output's Controls, which is how a normal sketch routes it.
    ['normal sketch', generateCpp(
      nodes.filter((entry) => !['player', 'audio', 'sd', 'amp', 'collection'].includes(entry.id)),
      [
        { id: 'f', source: 'fill', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
        { id: 'c', source: 'panel-touch', sourceHandle: 'controls', target: 'out', targetHandle: 'controls' },
      ] as StudioEdge[],
    )],
  ]

  for (const [name, sketch] of sketches) {
    it(`${name}: samples the panel's own electrodes`, () => {
      expect(sketch, `${name} emitted no _resPoint call`).toContain(`_resPoint(${expected},`)
    })

    it(`${name}: never reaches for a digitiser the panel has not got`, () => {
      // The definition is allowed — `_resPoint` needs `_touchMap` from that
      // block — but nothing may *call* it for this panel.
      expect(sketch).not.toMatch(/_xptPoint\(\s*\d/)
    })

    it(`${name}: defines the helpers it calls`, () => {
      expect(sketch).toContain('_resPoint(uint8_t xp')
      expect(sketch).toMatch(/bool _touchMap\(/)
    })
  }
})
