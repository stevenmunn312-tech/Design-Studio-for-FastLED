import { describe, it, expect } from 'vitest'
import { LED_OUTPUT_GAMMA_OFF, applyLedOutputRuntime, ledOutputGamma } from '../ledOutputRuntime'
import { ledOutputGammaExpr, ledOutputRuntimeCpp } from '../../../codegen/output/ledOutputRuntimeCpp'
import { gammaVideoTable } from '../../../nodes/composite/gamma'
import { evaluateGraphFull } from '../../graphEvaluator'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults } from '../../nodeLibrary'
import { generateCpp } from '../../../codegen/cppGenerator'
import { generateShowSketch } from '../../../codegen/showGenerator'
import { generatePlayerSketch, playerConfigFromGraph } from '../../../codegen/playerSketchGenerator'
import type { GroupRegistry } from '../../graphEvaluator'
import type { Frame } from '../../palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../graphStore'

// The LED output's Gamma field: the curve a trailing Gamma node applied, set
// on the output, applied before its dimmers on every side, and nothing at all
// while it is off.

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const output = (props: Record<string, unknown> = {}, id = 'out') => node(id, 'MatrixOutput', {
  form: 'matrix', width: 4, height: 4, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5, serpentine: false, ...props,
})
// Every level a 4x4 frame can show differs, so the whole curve is exercised.
const ramp = node('ramp', 'GradientFrame', { rA: 0, gA: 3, bA: 40, rB: 255, gB: 140, bB: 9, angle: 90 })

function rendered(nodes: StudioNode[], edges: StudioEdge[], id = 'out'): Frame {
  return evaluateGraphFull(nodes, edges, 0, 4, 4).outputs.get(id)?.frame as Frame
}

describe('the field', () => {
  it('is off on a new output, and off is the identity', () => {
    expect(libraryDefaults('MatrixOutput').outputGamma).toBe(LED_OUTPUT_GAMMA_OFF)
    expect(ledOutputGamma(libraryDefaults('MatrixOutput'))).toBe(LED_OUTPUT_GAMMA_OFF)
    expect(ledOutputGamma(undefined)).toBe(LED_OUTPUT_GAMMA_OFF)
    expect(ledOutputGamma({ outputGamma: 'x' })).toBe(LED_OUTPUT_GAMMA_OFF)
  })

  it('holds a value to the slider and to hundredths', () => {
    expect(ledOutputGamma({ outputGamma: 2.2 })).toBe(2.2)
    expect(ledOutputGamma({ outputGamma: 9 })).toBe(3.5)
    expect(ledOutputGamma({ outputGamma: 0.4 })).toBe(1)
    expect(ledOutputGamma({ outputGamma: 2.2349 })).toBe(2.23)
    expect(ledOutputGammaExpr({ outputGamma: 2.2349 })).toBe('2.23f')
    expect(ledOutputGammaExpr({ outputGamma: 1 })).toBeNull()
  })

  // A HUB75 driver brightens through a curve of its own.
  it('is hidden on a HUB75 panel and reads as off there', () => {
    expect(isPropertyEnabled('MatrixOutput', 'outputGamma', { form: 'matrix' })).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'outputGamma', { form: 'hub75' })).toBe(false)
    expect(ledOutputGamma({ form: 'hub75', outputGamma: 2.2 })).toBe(LED_OUTPUT_GAMMA_OFF)
  })
})

describe('the preview', () => {
  it('leaves the frame alone while off', () => {
    const f: Frame = [[{ r: 200, g: 100, b: 50 }]]
    expect(applyLedOutputRuntime(f, { enabled: true, brightness: 1 })).toBe(f)
    expect(applyLedOutputRuntime(f, { enabled: true, brightness: 1 }, LED_OUTPUT_GAMMA_OFF)).toBe(f)
  })

  it('curves through the table the board applies, before the dimmer, and copies', () => {
    const f: Frame = [[{ r: 200, g: 100, b: 5 }]]
    const table = gammaVideoTable(2.2)
    expect(applyLedOutputRuntime(f, { enabled: true, brightness: 1 }, 2.2)[0][0])
      .toEqual({ r: table[200], g: table[100], b: table[5] })
    expect(applyLedOutputRuntime(f, { enabled: true, brightness: 0.5 }, 2.2)[0][0])
      .toEqual({ r: table[200] * 0.5, g: table[100] * 0.5, b: table[5] * 0.5 })
    expect(f[0][0]).toEqual({ r: 200, g: 100, b: 5 })
  })

  // The point of the field: a finished graph drops its last node and looks the same.
  it('shows what a trailing Gamma node showed, dimmed or not', () => {
    for (const outputBrightness of [1, 0.4]) {
      const withNode = rendered(
        [ramp, node('g', 'Gamma', { gamma: 2.4 }), output({ outputBrightness })],
        [edge('e1', 'ramp', 'frame', 'g', 'frame'), edge('e2', 'g', 'frame', 'out', 'frame')],
      )
      const withField = rendered(
        [ramp, output({ outputBrightness, outputGamma: 2.4 })],
        [edge('e1', 'ramp', 'frame', 'out', 'frame')],
      )
      expect(withField).toEqual(withNode)
    }
  })
})

describe('the sketches', () => {
  const plain = (props: Record<string, unknown> = {}) =>
    generateCpp([ramp, output(props)], [edge('e1', 'ramp', 'frame', 'out', 'frame')])

  it('emits nothing while off', () => {
    expect(plain()).not.toContain('napplyGamma_video')
    expect(plain({ outputGamma: 1 })).not.toContain('napplyGamma_video')
    expect(plain({ form: 'hub75', chipset: 'HUB75', outputGamma: 2.2 })).not.toContain('napplyGamma_video')
  })

  it('curves the physical array after the blit and before the dimmer and the show', () => {
    const cpp = plain({ outputGamma: 2.2, outputBrightness: 0.5 })
    const loop = cpp.slice(cpp.indexOf('void loop()'))
    const gamma = loop.indexOf('napplyGamma_video(leds, NUM_LEDS, 2.20f);  // LED output gamma')
    expect(gamma).toBeGreaterThan(0)
    expect(gamma).toBeLessThan(loop.indexOf('nscale8_video(_outLevel_out)'))
    expect(gamma).toBeLessThan(loop.lastIndexOf('FastLED.show();'))
    // Alone, with the dimmer untouched, it is the one line.
    expect(plain({ outputGamma: 2.2 })).not.toContain('LED output run-time controls')
  })

  it('emits the gamma line in front of the run-time block it joins', () => {
    expect(ledOutputRuntimeCpp({ id: 'o', array: 'leds', count: 'NUM_LEDS', enabledExpr: null, brightnessExpr: null }))
      .toEqual([])
    const lines = ledOutputRuntimeCpp({
      id: 'o', array: 'leds', count: 'NUM_LEDS', enabledExpr: 'on', brightnessExpr: null, gammaExpr: '2.80f',
    })
    expect(lines).toEqual([
      '  napplyGamma_video(leds, NUM_LEDS, 2.80f);  // LED output gamma',
      '  if (!(on)) fill_solid(leds, NUM_LEDS, CRGB::Black);',
    ])
  })

  // With several outputs the blit scales each pixel by the Board's level
  // itself, so the curve has to go in there, ahead of that scale.
  it('curves each pixel ahead of the Board level when there are several outputs', () => {
    const cpp = generateCpp([
      ramp, output({ outputGamma: 2.2 }), output({ dataPin: 6 }, 'out2'),
    ], [edge('e1', 'ramp', 'frame', 'out', 'frame'), edge('e2', 'ramp', 'frame', 'out2', 'frame')])
    expect(cpp).toContain('napplyGamma_video(_c, 2.20f); _c.nscale8_video(')
    expect(cpp.split('napplyGamma_video(').length - 1).toBe(1)
    expect(cpp).not.toContain('// LED output gamma')
  })

  const showGroups = {
    still: {
      nodes: [ramp, node('go', 'GroupOutput')],
      edges: [edge('1', 'ramp', 'frame', 'go', 'frame')],
    },
  } as unknown as GroupRegistry
  const show = (outputs: StudioNode[]) => generateShowSketch([
    node('pc', 'PatternCollection', { patternIds: ['still'] }), node('pm', 'PatternSlideshow'), ...outputs,
  ], [
    edge('a', 'pc', 'patternset', 'pm', 'patternset'),
    ...outputs.map((out) => edge(`b_${out.id}`, 'pm', 'frame', out.id, 'frame')),
  ], showGroups)

  it('curves a show controller\'s output the way a normal sketch does', () => {
    expect(show([output()])).not.toContain('napplyGamma_video')
    const cpp = show([output({ outputGamma: 2.5, outputBrightness: 0.5 })])
    expect(cpp).toContain('napplyGamma_video(leds, NUM_LEDS, 2.50f);  // LED output gamma')
    expect(cpp.indexOf('napplyGamma_video(leds')).toBeLessThan(cpp.indexOf('nscale8_video(_outLevel_out)'))
    const multi = show([output({ outputGamma: 2.5 }), output({ dataPin: 6 }, 'out2')])
    expect(multi).toContain('napplyGamma_video(_c, 2.50f); _c.nscale8_video(')
  })

  describe('the SD player', () => {
    const generator = { id: 'pg', data: { nodeType: 'PerformanceGenerator', properties: {} } }
    const config = (properties: Record<string, unknown>) => playerConfigFromGraph([
      generator, { id: 'mo', data: { nodeType: 'MatrixOutput', properties: { width: 8, height: 8, ...properties } } },
    ], [{ source: 'pg', target: 'mo', sourceHandle: 'frame', targetHandle: 'frame' }])

    it('carries the field and emits nothing while it is off', () => {
      expect(config({ outputGamma: 2.2 }).outputGamma).toBe(2.2)
      expect(generatePlayerSketch(config({}))).not.toContain('napplyGamma_video')
    })

    // The curve follows the audio fade and the chain behind the player, as it
    // follows them at the output in the preview, and the dimmer follows it.
    it('curves the strip after the frame is finished and before the dimmer and the show', () => {
      const sketch = generatePlayerSketch(config({ outputGamma: 2.2, outputBrightness: 0.4 }))
      const loop = sketch.slice(sketch.indexOf('void loop()'))
      const gamma = loop.indexOf('napplyGamma_video(leds, NUM_LEDS, 2.20f);  // LED output gamma')
      expect(gamma).toBeGreaterThan(0)
      expect(loop.split('nscale8_video(_outLevel_player)').length - 1).toBe(1)
      expect(gamma).toBeLessThan(loop.indexOf('nscale8_video(_outLevel_player)'))
      expect(loop.indexOf('nscale8_video(_outLevel_player)')).toBeLessThan(loop.indexOf('FastLED.show();'))
    })
  })
})
