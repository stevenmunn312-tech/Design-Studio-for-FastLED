/*
 * A fixture reporting on itself, in preview and on the glass.
 *
 * The LED output's `Display` output is the one source a status panel can have
 * in a graph with no player and no slideshow in it — a Juggle, a string, and a
 * panel saying how bright it is. That makes it the first display source whose
 * reading is produced by the same node that consumes the render, so the two
 * things worth asserting are that the panel reports the *resolved* state (not
 * the wire feeding it) and that it reads this pass's value rather than last
 * pass's.
 *
 * Both halves are checked here: what the evaluator publishes, and what each
 * generator emits for it. A layout that previews and cannot be generated is
 * the failure the display plan rules out, and it is exactly what this wire
 * produced before the generators learned it — the preview drew LED Status
 * while the device said WAITING FOR A SIGNAL, with nothing reporting the gap.
 */

import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { evaluateGraphFull } from '../../state/graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { findDisplayGeneratorIssues } from '../../utils/validateGraph'
import { isDisplaySignal } from '../../state/displays/displaySignal'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, label?: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: label ?? nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id: `${s}-${sh}-${t}-${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th }) as StudioEdge

/* An LED output titles itself after its form — `nodeDisplayLabel` maps `form`
 * through `LED_OUTPUT_FORM_LABELS` — so the label passed here is deliberately
 * ignored by the status, which is the point of the assertions below. */
const output = (id = 'out', props: Record<string, unknown> = {}, label = 'Stage Wash') =>
  node(id, 'MatrixOutput', { form: 'strip', ledCount: 144, dataPin: 27, ...props }, label)
const fill = node('fill', 'SolidColor')
const oled = node('oled', 'InfoDisplay', {
  partId: 'ssd1306-oled-128x64', sdaPin: 21, sclPin: 22, i2cAddress: '0x3C',
})
const segment = node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display', clkPin: 25, dioPin: 26 })
const tft = node('tft', 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0',
  csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, backlightPin: 4,
})

const loopOf = (cpp: string) => cpp.slice(cpp.indexOf('void loop() {'))

describe('an LED output reporting itself', () => {
  it('publishes the resolved state, not the wires feeding it', () => {
    // A knob at 0.5 and a blackout held on: the panel must say dark, and must
    // say the level the fixture would return to rather than pretending the
    // knob is at zero. Compare with a <= b is a plain false, which is all the
    // blackout needs to be.
    const nodes = [output(), fill, node('knob', 'PotInput', { pin: 33, value: 0.5 }),
      node('off', 'Compare', { a: 0, b: 0.5 })]
    const edges = [edge('fill', 'frame', 'out', 'frame'),
      edge('knob', 'value', 'out', 'brightness'), edge('off', 'result', 'out', 'enabled')]

    const outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.get('out')!
    const signal = outputs.display
    expect(isDisplaySignal(signal)).toBe(true)
    expect(signal).toMatchObject({
      kind: 'ledOutput',
      status: {
        name: 'LED String', formLabel: 'LED String', ledCount: 144,
        enabled: false, brightness: 0.5,
      },
    })
  })

  it('names the output rather than guessing a pattern name from the graph', () => {
    // Two patterns blended into one fixture: there is no single pattern name
    // to report, and picking one of them would be wrong half the time.
    const nodes = [output('out', { form: 'ring', ledCount: 24 }), node('a', 'SolidColor'),
      node('b', 'Noise'), node('mix', 'Blend')]
    const edges = [edge('a', 'frame', 'mix', 'a'), edge('b', 'frame', 'mix', 'b'),
      edge('mix', 'frame', 'out', 'frame')]
    const signal = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.get('out')!.display
    // Its own title, taken the way the canvas takes it — from the form, not
    // from `data.label`, which nothing persists.
    expect(signal).toMatchObject({ kind: 'ledOutput', status: { name: 'LED Ring' } })
  })

  /*
   * The whole reason `Display` is a real output port rather than something the
   * panel reaches back for: a real edge puts the panel after the output in the
   * topological sort, so the level it draws is the one this pass just applied.
   */
  it('emits the same expression the pixels were scaled with, after the output', () => {
    const nodes = [output(), fill, node('knob', 'PotInput', { pin: 33 }), oled, segment]
    const edges = [edge('fill', 'frame', 'out', 'frame'), edge('knob', 'value', 'out', 'brightness'),
      edge('out', 'display', 'oled', 'display'), edge('out', 'display', 'seg', 'display')]
    const loop = loopOf(generateCpp(nodes, edges))

    // Compile-time facts, emitted as literals.
    expect(loop).toContain('"LED String"')
    expect(loop).toContain('"144 LEDS"')
    // The live reading, and it is the same expression the fixture is dimmed by.
    expect(loop).toContain('float _oledLvl_oled = constrain((float)(n_knob_value), 0.0f, 1.0f);')
    expect(loop).toContain('_oledBar(_oled_oled, 2, 26, 124, 7, _oledLvl_oled);')
    expect(loop).toContain('"ON" : "BLACKOUT"')
    // Four digits say the effective level as whole percent.
    expect(loop).toContain('_segIndex(_segBuf_seg, 4, (long)lroundf(_segLvl_seg * 100.0f));')

    // After the block that scaled the pixels, not before it.
    expect(loop.indexOf('{ // LED output run-time controls'))
      .toBeLessThan(loop.indexOf('_oledLvl_oled'))
  })

  it('draws the colour panel through the same layout', () => {
    const nodes = [output(), fill, tft]
    const edges = [edge('fill', 'frame', 'out', 'frame'), edge('out', 'display', 'tft', 'display')]
    const loop = loopOf(generateCpp(nodes, edges))
    expect(loop).toContain('const char *_tftName_tft = "LED String";')
    expect(loop).toContain('const char *_tftFixture_tft = "144 LEDS";')
    expect(loop).toContain('const char *_tftState_tft = _tftLit_tft ? "ON" : "BLACKOUT";')
    expect(loop).toContain('_tftLevel_tft')
  })

  /*
   * The emitters above are new, and an unbalanced block is the one mistake a
   * `toContain` assertion reads as entirely correct. Cheap to check, and it is
   * the difference between a test suite that passes and a sketch that compiles.
   */
  it.each([
    ['oled', [output(), fill, oled], [edge('fill', 'frame', 'out', 'frame'), edge('out', 'display', 'oled', 'display')]],
    ['segment', [output(), fill, segment], [edge('fill', 'frame', 'out', 'frame'), edge('out', 'display', 'seg', 'display')]],
    ['tft', [output(), fill, tft], [edge('fill', 'frame', 'out', 'frame'), edge('out', 'display', 'tft', 'display')]],
  ] as [string, StudioNode[], StudioEdge[]][])('leaves %s braces balanced', (_label, nodes, edges) => {
    const cpp = generateCpp(nodes, edges)
    const open = (cpp.match(/\{/g) ?? []).length
    const close = (cpp.match(/\}/g) ?? []).length
    expect(open).toBe(close)
  })

  it('reports nothing wrong about a graph a normal sketch can fully answer', () => {
    const nodes = [output(), fill, oled]
    const edges = [edge('fill', 'frame', 'out', 'frame'), edge('out', 'display', 'oled', 'display')]
    expect(findDisplayGeneratorIssues(nodes, edges)).toEqual({ errors: [], warnings: [] })
  })

  it('keeps two fixtures independent', () => {
    const second = output('deck', { form: 'ring', ledCount: 60, dataPin: 26 })
    const nodes = [output(), second, fill, node('knob', 'PotInput', { pin: 33 })]
    const edges = [edge('fill', 'frame', 'out', 'frame'), edge('fill', 'frame', 'deck', 'frame'),
      edge('knob', 'value', 'out', 'brightness')]
    const result = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true)
    expect(result.outputs.get('out')!.display).toMatchObject({ status: { name: 'LED String', ledCount: 144 } })
    // The second fixture is undimmed: one output's knob must not read across.
    expect(result.outputs.get('deck')!.display).toMatchObject({
      status: { name: 'LED Ring', ledCount: 60, brightness: 1, enabled: true },
    })
  })

  /*
   * Adding an output socket must not stop the fixture being a terminal.
   *
   * `MatrixOutput` had no outputs at all until now, and both terminal
   * registries — the evaluator's hot set and the generator's reachability walk
   * — are derived from "inputs, and either no outputs or the output category".
   * The second half of that rule is what carries this change; without it the
   * fixture and everything feeding it would be pruned straight out of the
   * sketch, which compiles and uploads cleanly and lights nothing.
   */
  it('stays a codegen terminal now that it has an output', () => {
    const nodes = [output(), fill]
    const cpp = generateCpp(nodes, [edge('fill', 'frame', 'out', 'frame')])
    expect(cpp).toContain('FastLED.show();')
    expect(loopOf(cpp)).toContain('fill_solid(buf_fill')
  })

  it('draws its waiting screen when the Display socket is unwired', () => {
    const nodes = [output(), fill, oled]
    const loop = loopOf(generateCpp(nodes, [edge('fill', 'frame', 'out', 'frame')]))
    expect(loop).toContain('WAITING FOR A SIGNAL')
    expect(loop).not.toContain('"144 LEDS"')
  })
})

/*
 * A template answers for the fixture it actually drives, with the same
 * expressions that scale that fixture's pixels. An output the engine does not
 * reach stays unresolved, the same warning a song wire gets on a show.
 */
describe('a fixture status panel in a template build', () => {
  const groups = {
    pattern: {
      nodes: [node('paint', 'SolidColor'), node('end', 'GroupOutput')],
      edges: [edge('paint', 'frame', 'end', 'frame')],
    },
  }

  it('reports the show output with the latch the pixels already use', () => {
    const nodes = [
      output(), fill,
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      node('show', 'PatternSlideshow'),
      node('knob', 'PotInput', { pin: 33 }),
      node('controls', 'ControlMap'),
      oled,
    ]
    const edges = [
      edge('collection', 'patternset', 'show', 'patternset'),
      edge('show', 'frame', 'out', 'frame'),
      edge('knob', 'value', 'out', 'brightness'),
      edge('controls', 'controls', 'out', 'controls'),
      edge('out', 'display', 'oled', 'display'),
    ]
    expect(findDisplayGeneratorIssues(nodes, edges).warnings).toEqual([])
    const loop = loopOf(generateShowSketch(nodes, edges, groups))
    const level = 'constrain((float)(constrain(n_knob_value, 0.0f, 1.0f) * _ledLevel_out), 0.0f, 1.0f)'
    expect(loop).toContain(`float _oledLvl_oled = ${level};`)
    expect(loop).toContain('"ON" : "BLACKOUT"')
    expect(loop).toContain('"LED String"')
    expect(loop).toContain('"144 LEDS"')
    expect(loop.indexOf('_ledOn_out = !_ledOn_out')).toBeGreaterThan(-1)
    expect(loop.indexOf('_ledOn_out = !_ledOn_out')).toBeLessThan(loop.indexOf('_oledLvl_oled'))
    expect(loop.indexOf('constrain(n_knob_value, 0.0f, 1.0f) * _ledLevel_out'))
      .toBeLessThan(loop.indexOf('_oledLvl_oled'))
  })

  it('leaves an output the show does not render unresolved', () => {
    const nodes = [
      output(), output('deck', { dataPin: 26 }), fill,
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      node('show', 'PatternSlideshow'),
      oled,
    ]
    const edges = [
      edge('collection', 'patternset', 'show', 'patternset'),
      edge('show', 'frame', 'out', 'frame'),
      edge('deck', 'display', 'oled', 'display'),
    ]
    const warnings = findDisplayGeneratorIssues(nodes, edges).warnings.join('\n')
    expect(warnings).toContain('cannot read')
    expect(warnings).toContain('stays blank')
  })

  it('reports the player output from its own fields, not the player brightness', () => {
    const nodes = [
      output('out', { outputBrightness: 0.5, dataPin: 4 }),
      node('master', 'PatternMaster'),
      node('card', 'SDCard'),
      node('amp', 'Amplifier', { i2sBclk: 14, i2sLrc: 15, i2sDout: 16 }),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      oled,
    ]
    const edges = [
      edge('collection', 'patternset', 'master', 'patternset'),
      edge('master', 'frame', 'out', 'frame'),
      edge('card', 'storage', 'master', 'storage'),
      edge('master', 'audio', 'amp', 'audio'),
      edge('out', 'display', 'oled', 'display'),
    ]
    expect(findDisplayGeneratorIssues(nodes, edges).warnings).toEqual([])
    const loop = loopOf(buildShowPlayer(nodes, edges, groups, { bakedAudio: false, preferredTrack: '' }))
    const level = loop.split('\n').find((line) => line.includes('_oledLvl_oled'))
    expect(level).toContain('constrain((float)(0.500f), 0.0f, 1.0f)')
    expect(level).not.toContain('playerBrightness')
  })
})

/*
 * Every form, because the socket is on the node rather than on one shape.
 *
 * The count is whatever that form means by it — a run length for the linear
 * forms, a grid total for the two 2-D ones — and it comes from the shared
 * `outputLedTotal` rather than being read off `ledCount` here, so a status
 * panel on a HUB75 wall reports the wall rather than the number 60 sitting
 * unused in a property.
 */
describe('a fixture of each form reports itself', () => {
  it.each([
    ['strip', { form: 'strip', ledCount: 144 }, 'LED String', 144],
    ['matrix', { form: 'matrix', width: 16, height: 16 }, 'LED Matrix', 256],
    ['ring', { form: 'ring', ledCount: 24 }, 'LED Ring', 24],
    ['corkscrew', { form: 'corkscrew', ledCount: 90 }, 'LED Corkscrew', 90],
    ['hub75', { form: 'hub75', width: 64, height: 32 }, 'HUB75 Panel', 2048],
  ] as [string, Record<string, unknown>, string, number][])('%s', (_form, props, formLabel, ledCount) => {
    const nodes = [output('out', props), fill]
    const signal = evaluateGraphFull(nodes, [edge('fill', 'frame', 'out', 'frame')], 1, 8, 8, {}, true)
      .outputs.get('out')!.display
    expect(signal).toMatchObject({ kind: 'ledOutput', status: { formLabel, ledCount } })
  })
})
