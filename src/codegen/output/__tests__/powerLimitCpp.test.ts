import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../../../state/graphStore'
import { heaviestLedMilliwatts, powerLimitLinesCpp, powerLimitSetupCpp } from '../powerLimitCpp'

function node(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}
const strip = (chipset: string, id = 'out') => node(id, 'MatrixOutput', { form: 'strip', ledCount: 60, chipset })
const MODEL_NOTE = '  // full-white draw of this build\'s LEDs'

describe('the power limit', () => {
  // FastLED's default model is a WS2812 at 5 V, 210 mW at full white. The app
  // sizes supplies at 300 mW, so on the default the limiter passed 1.4 times
  // the current the user set.
  it('models a 5 V RGB LED at the draw the app sizes its supply for', () => {
    expect(heaviestLedMilliwatts([strip('WS2812B')])).toBe(300)
    expect(powerLimitSetupCpp([strip('WS2812B')], 5, 2000)).toEqual([
      `  FastLED.setPowerModel(PowerModelRGB(100, 100, 100, 5));${MODEL_NOTE}`,
      '  FastLED.setMaxPowerInVoltsAndMilliamps(5, 2000);',
    ])
  })

  // A 12 V WS2811 pixel is 720 mW, 3.4 times the default model.
  it('models a 12 V WS2811 pixel at 720 mW', () => {
    expect(powerLimitSetupCpp([strip('WS2811')], 12, 5000)[0]).toContain('PowerModelRGB(240, 240, 240, 5)')
  })

  it('takes the heaviest LED when outputs differ, which dims earliest', () => {
    expect(heaviestLedMilliwatts([strip('WS2815', 'a'), strip('WS2811', 'b')])).toBe(720)
  })

  it('leaves the model alone when no LED is throttled', () => {
    expect(powerLimitSetupCpp([], 5, 2000)).toEqual(['  FastLED.setMaxPowerInVoltsAndMilliamps(5, 2000);'])
  })

  // A model channel is a byte. Past 765 mW the rest comes off the budget.
  it('gives up budget for an LED the model cannot state', () => {
    expect(powerLimitLinesCpp(1530, 12, 4000)).toEqual([
      `  FastLED.setPowerModel(PowerModelRGB(255, 255, 255, 5));${MODEL_NOTE}`,
      '  FastLED.setMaxPowerInVoltsAndMilliamps(12, 2000);',
    ])
  })
})
