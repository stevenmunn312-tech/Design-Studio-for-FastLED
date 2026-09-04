import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { DEFAULT_BUTTON_EDGE_SETTINGS } from '../../state/transportBridge'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: def?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
  } } as StudioNode
}
const edge = (s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id: `${s}-${sh}-${t}-${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th }) as StudioEdge
const panel = (properties = {}) => node('touch-panel', 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Show Status', ...properties,
})
const output = (id = 'out', properties = {}) => node(id, 'MatrixOutput', {
  width: 8, height: 8, dataPin: 5, ...properties,
})
const groups = {
  p: { nodes: [node('solid', 'SolidColor'), node('go', 'GroupOutput')],
    edges: [edge('solid', 'frame', 'go', 'frame')] },
}
const show = [node('collection', 'PatternCollection', { patternIds: ['p'] }), node('show', 'PatternSlideshow')]
const frameEdges = [edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame')]
const direct = edge('touch-panel', 'controls', 'out', 'controls')
const build = (nodes: StudioNode[], edges: StudioEdge[]) => generateShowSketch([...show, ...nodes], [...frameEdges, ...edges], groups)
const count = (cpp: string, text: string) => cpp.split(text).length - 1

describe('fixed touch routing in generative shows', () => {
  it('samples once before the latch and render, then draws after shipping pixels', () => {
    const cpp = build([output(), panel()], [direct])
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    const sample = loop.indexOf('_xptPoint(')
    const latch = loop.indexOf('if (n_touch_panel_controls.ledToggle) _ledOn_out = !_ledOn_out;')
    const render = loop.indexOf('renderPattern(0, now)')
    const runtime = loop.indexOf('if (!(_ledOn_out))')
    expect(count(loop, '_xptPoint(')).toBe(1)
    expect(sample).toBeGreaterThan(0)
    expect(latch).toBeGreaterThan(sample)
    expect(render).toBeGreaterThan(latch)
    expect(runtime).toBeGreaterThan(render)
    expect(loop.indexOf('FastLED.show();')).toBeGreaterThan(runtime)
    expect(loop.indexOf('{ // Transport Display')).toBeGreaterThan(loop.indexOf('FastLED.show();'))
    expect(loop).toMatch(/_touchDown_touch_panel && !_touchPrev_touch_panel.*ledToggle = true/)
    expect(loop).toMatch(/_touchDown_touch_panel && \(_touchX_.*hasBrightness = true/)
    expect(cpp).not.toMatch(/audio\.pauseResume|changePlayerTrack|applyPlayerBrightness|playerVolume/)
  })

  it('shares the normal sketch bundle and GPIO emitters across chained controls', () => {
    const controls = [node('last', 'PlayerControls', { brightnessStep: 0.125 }), node('first', 'PlayerControls')]
    const knob = node('knob', 'PotInput', { pin: 33 })
    const button = node('button', 'ButtonInput', { pin: 32 })
    const nodes = [output(), ...controls, knob, button, panel()]
    const edges = [edge('touch-panel', 'controls', 'first', 'controlsIn'),
      edge('first', 'controls', 'last', 'controlsIn'), edge('last', 'controls', 'out', 'controls'),
      edge('knob', 'value', 'last', 'brightness'), edge('button', 'pressed', 'last', 'brightnessDown')]
    const normal = generateCpp([...nodes, node('solid', 'SolidColor')], [...edges, edge('solid', 'frame', 'out', 'frame')])
    const generated = build(nodes, edges)
    const { debounceMs, repeatDelayMs, repeatIntervalMs } = DEFAULT_BUTTON_EDGE_SETTINGS
    for (const cpp of [normal, generated]) {
      expect(cpp).toContain('n_first_controls = n_touch_panel_controls;')
      expect(cpp).toContain('n_last_controls = n_first_controls;')
      expect(cpp).toContain('float n_knob_value = analogRead(33) / 4095.0f;')
      expect(cpp).toContain('pinMode(32, INPUT_PULLUP);')
      expect(cpp).toContain(`.update(n_button_pressed, _pcNow_last, true, ${debounceMs}u, ${repeatDelayMs}u, ${repeatIntervalMs}u)`)
      expect(cpp).toContain('n_last_controls.brightnessDelta -= 0.125f;')
      expect(cpp).toContain('n_last_controls.brightness = constrain(n_knob_value, 0.0f, 1.0f);')
      expect(cpp).toContain('if (n_last_controls.hasBrightness) _ledLevel_out = constrain(n_last_controls.brightness, 0.0f, 1.0f);')
      expect(cpp).toContain('if (n_last_controls.ledToggle) _ledOn_out = !_ledOn_out;')
      expect(cpp.indexOf('PlayerControlsValue n_first_controls;')).toBeLessThan(cpp.indexOf('PlayerControlsValue n_last_controls;'))
    }
  })

  it('fans out one sample to independent physical arrays without dimming the shared frame', () => {
    const cpp = build([panel(), output(), output('other', { dataPin: 6 })], [direct,
      edge('show', 'frame', 'other', 'frame'), edge('touch-panel', 'controls', 'other', 'controls')])
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    expect(count(loop, '_xptPoint(')).toBe(1)
    for (const id of ['out', 'other']) {
      expect(cpp).toContain(`static bool _ledOn_${id} = true;`)
      expect(loop).toContain(`fill_solid(leds_${id}, 64, CRGB::Black);`)
      expect(loop).toContain(`leds_${id}[_i].nscale8_video(_outLevel_${id});`)
    }
    expect(loop).not.toContain('fill_solid(leds, NUM_LEDS, CRGB::Black);')
  })

  it('dims HUB75 through the driver before its blit', () => {
    const cpp = build([panel(), output('out', { chipset: 'HUB75' })], [direct])
    const loop = cpp.slice(cpp.indexOf('void loop() {'))
    expect(loop).toContain('dma_display->setBrightness8(_outLevel_out);')
    expect(loop.indexOf('setBrightness8(_outLevel_out)')).toBeLessThan(loop.indexOf('drawPixel'))
  })

  it('keeps read-only panels idle, disabled panels inert and Diagnostics sampling', () => {
    expect(build([panel(), output()], [])).not.toContain('_xptPoint(')
    const disabled = build([panel({ enabled: false }), output()], [direct])
    expect(disabled).toContain('_touchDown_touch_panel = false && _xptPoint(')
    const diagnostic = build([panel({ tftLayout: 'Diagnostics' }), output()], [])
    expect(diagnostic).toContain('_xptPoint(')
    expect(diagnostic).not.toContain('PlayerControlsValue')
  })

  it('refuses arbitrary graph bindings rather than emitting a partial control chain', () => {
    expect(() => build([panel(), output(), node('pc', 'PlayerControls'), node('wave', 'Wave')], [
      edge('touch-panel', 'controls', 'pc', 'controlsIn'), edge('pc', 'controls', 'out', 'controls'),
      edge('wave', 'value', 'pc', 'brightness'),
    ])).toThrow('cannot evaluate the wire feeding brightness')
  })
})
