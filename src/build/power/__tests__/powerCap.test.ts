import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { CONTROLLER_DRAW_MA } from '../../buildProfile'
import { defaultPowerCapMa, ledSupplyRatingMa, supplyPowerCapMa } from '../powerCap'
import { generateCpp } from '../../../codegen/cppGenerator'

function node(id: string, nodeType: string, properties: Record<string, unknown>, category = 'output'): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const output = (id: string, extra: Record<string, unknown> = {}) =>
  node(id, 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14, ...extra })
const supply = (id: string, voltage: number, ratedCurrentA: number) =>
  node(id, 'PowerSupply', { voltage, ratedCurrentA }, 'hardware')
// 16 x 16 at 60 mA, rounded up to 100 mA as the Board's full-white figure.
const FULL_WHITE_MA = 15400

describe('default power cap', () => {
  it('leaves 85% of the supply less the controller, rounded down to 50 mA', () => {
    // 0.85 x 5000 - 250 = 4000.
    expect(supplyPowerCapMa(5000, 'esp32')).toBe(4000)
    // 0.85 x 10000 - 350 = 8150.
    expect(supplyPowerCapMa(10000, 'esp32-s3')).toBe(8150)
    // 0.85 x 3000 - 200 = 2350.
    expect(supplyPowerCapMa(3000, 'esp8266')).toBe(2350)
    // 0.85 x 2500 - 350 = 1775, rounded down.
    expect(supplyPowerCapMa(2500, 'esp32-c3')).toBe(1750)
  })

  it('stays inside the Board field when the supply barely runs the controller', () => {
    expect(supplyPowerCapMa(500, 'esp32-s3')).toBe(100)
  })

  it('has a controller draw for every board family', () => {
    for (const draw of Object.values(CONTROLLER_DRAW_MA)) expect(draw).toBeGreaterThan(0)
    expect(CONTROLLER_DRAW_MA.unknown).toBe(Math.max(...Object.values(CONTROLLER_DRAW_MA)))
  })

  it('follows the supply, or full white when no supply is entered or it covers full white', () => {
    expect(defaultPowerCapMa([output('a')], 'esp32', FULL_WHITE_MA)).toBe(FULL_WHITE_MA)
    expect(defaultPowerCapMa([supply('p1', 5, 5), output('a')], 'esp32', FULL_WHITE_MA)).toBe(4000)
    expect(defaultPowerCapMa([supply('p1', 5, 30), output('a')], 'esp32', FULL_WHITE_MA)).toBe(FULL_WHITE_MA)
  })

  it('is one global figure over the combined rating of every supply feeding the LEDs', () => {
    const nodes = [
      supply('p1', 5, 5),
      supply('p2', 5, 5),
      output('a', { poweredBy: 'p1' }),
      output('b', { poweredBy: 'p2', dataPin: 15 }),
      supply('spare', 5, 40),
    ]
    // The spare supply feeds nothing, so it does not count.
    expect(ledSupplyRatingMa(nodes)).toBe(10000)
    expect(defaultPowerCapMa(nodes, 'esp32', 2 * FULL_WHITE_MA)).toBe(8250)
  })

  it('ignores a supply at another voltage than the LEDs', () => {
    expect(ledSupplyRatingMa([supply('p1', 12, 5), output('a')])).toBeNull()
  })

  it('reaches the firmware unchanged through the Board', () => {
    const nodes = [supply('p1', 5, 5), output('a')]
    const milliamps = defaultPowerCapMa(nodes, 'esp32', FULL_WHITE_MA)
    const board = node('board', 'Board', { powerLimit: true, milliamps })
    const pattern = node('sc', 'SolidColor', { r: 255, g: 0, b: 0 }, 'pattern')
    const edges = [{ id: 'e', source: 'sc', target: 'a', sourceHandle: 'frame', targetHandle: 'frame' }] as unknown as StudioEdge[]
    const cpp = generateCpp([board, pattern, ...nodes], edges)
    expect(cpp).toContain('FastLED.setMaxPowerInVoltsAndMilliamps(5, 4000);')
  })
})
