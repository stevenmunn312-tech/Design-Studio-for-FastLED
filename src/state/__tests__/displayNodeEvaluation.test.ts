import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateGraphFull } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { useDisplayRuntimeStore } from '../displayRuntimeStore'
import { useTransportDisplayTouchStore } from '../transportDisplayTouchStore'
import { fixedTransportGeometry } from '../transportDisplay'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(
  id: string,
  nodeType: string,
  props: Record<string, unknown> = {},
  ports: { inputs?: unknown[]; outputs?: unknown[] } = {},
): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'output', properties: props,
      inputs: ports.inputs ?? def?.inputs ?? [],
      outputs: ports.outputs ?? def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, target, sourceHandle, targetHandle } as unknown as StudioEdge
}

// One screen carrying a widget with two roles (a synchronized Slider), a
// read-only Text and a Button, so the case cannot pass by assuming one value
// per widget.
const screen = (props: Record<string, unknown> = {}) => node('screen', 'TransportDisplay', {
  displayId: 'panel', partId: 'st7789v-xpt2046-touch-240x320', ...props,
}, {
  inputs: [
    { id: 'display', label: 'Display', dataType: 'display' },
    { id: 'enabled', label: 'Enabled', dataType: 'bool' },
    { id: 'widget:text:value', label: 'Title', dataType: 'string' },
    { id: 'widget:slider:set', label: 'Volume Set', dataType: 'float' },
  ],
  outputs: [
    { id: 'widget:slider:out', label: 'Volume Output', dataType: 'float' },
    { id: 'widget:button:out', label: 'Skip', dataType: 'bool' },
  ],
})

const graph = () => ({
  nodes: [
    screen(),
    node('title', 'TextValue', { text: 'Aurora Drift' }),
    node('level', 'Math', { mathOp: 'add', a: 0.5, b: 0.25 }),
  ],
  edges: [
    edge('e-title', 'title', 'text', 'screen', 'widget:text:value'),
    edge('e-level', 'level', 'result', 'screen', 'widget:slider:set'),
  ],
})

const runtime = () => useDisplayRuntimeStore.getState()

describe('custom Display node evaluation', () => {
  beforeEach(() => {
    runtime().resetDisplayRuntime()
  })

  it('publishes wired input roles into the runtime store and samples output roles', () => {
    const { nodes, edges } = graph()
    runtime().touchDisplayWidget('panel', 'slider', 0.25)

    const outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.get('screen')!

    expect(runtime().readDisplayWidget('panel', 'text')?.roleValues.get('value')).toBe('Aurora Drift')
    expect(runtime().readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe(0.75)
    expect(outputs['widget:slider:out']).toBe(0.25)
    expect(outputs['widget:button:out']).toBe(false)
  })

  it('rests an untouched control at its type value and leaves unwired roles unpublished', () => {
    const outputs = evaluateGraphFull([screen()], [], 1, 8, 8, {}, true).outputs.get('screen')!

    // The panel's own readings ride on the same object, so the widget values
    // are checked by name rather than by comparing the whole output.
    expect(outputs['widget:slider:out']).toBe(0)
    expect(outputs['widget:button:out']).toBe(false)
    expect(runtime().readDisplayWidget('panel', 'text')).toBeUndefined()
    expect(runtime().readDisplayWidget('panel', 'slider')).toBeUndefined()
  })

  it('returns to a wired authoritative value after a pending touch intent is sampled', () => {
    const { nodes, edges } = graph()
    runtime().touchDisplayWidget('panel', 'slider', 0.25)
    runtime().releaseDisplayWidget('panel', 'slider')

    const first = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.get('screen')!
    const second = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.get('screen')!

    expect(first['widget:slider:out']).toBe(0.25)
    expect(second['widget:slider:out']).toBe(0.75)
  })

  it('publishes nothing and touches nothing while the screen is disabled', () => {
    const { nodes, edges } = graph()
    nodes[0] = screen({ enabled: false })
    runtime().touchDisplayWidget('panel', 'slider', 0.25)

    const outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.get('screen')!

    expect(outputs['widget:slider:out']).toBe(0)
    expect(runtime().readDisplayWidget('panel', 'text')).toBeUndefined()
  })

  /*
   * A loop back into the same screen is the normal shape, not an error: the
   * Now Playing template's buttons drive a player whose readings come back to
   * its own text. Resolving inputs re-enters the node, so the value the loop
   * carries must be the finger's, not the fallback the recursion guard would
   * hand back.
   */
  it('carries the sampled touch value around a loop through one screen', () => {
    const nodes = [
      screen(),
      // Wired to the slider's own Set: the registry's synchronized control.
      node('sync', 'Math', { mathOp: 'add', a: 0, b: 0.25 }),
      // Wired to a different widget: an ordinary panel loop, equally valid.
      node('cross', 'Math', { mathOp: 'add', a: 0, b: 1 }),
    ]
    const edges = [
      edge('e-out', 'screen', 'widget:slider:out', 'sync', 'a'),
      edge('e-set', 'sync', 'result', 'screen', 'widget:slider:set'),
      edge('e-cross-in', 'screen', 'widget:button:out', 'cross', 'a'),
      edge('e-cross-out', 'cross', 'result', 'screen', 'widget:text:value'),
    ]
    runtime().touchDisplayWidget('panel', 'slider', 0.5)
    const originalSample = runtime().sampleDisplayWidgetOutput
    const sample = vi.fn(originalSample)
    useDisplayRuntimeStore.setState({ sampleDisplayWidgetOutput: sample })
    let outputs: Record<string, unknown>
    try {
      outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.get('screen')!
    } finally {
      useDisplayRuntimeStore.setState({ sampleDisplayWidgetOutput: originalSample })
    }

    expect(outputs['widget:slider:out']).toBe(0.5)
    expect(sample.mock.calls.map(([, widgetId]) => widgetId)).toEqual(['slider', 'button'])
    // 0.75 is the touch value plus 0.25. The recursion guard would have fed
    // Math its own unwired default instead and published 0.25.
    expect(runtime().readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe(0.75)
    expect(runtime().readDisplayWidget('panel', 'text')?.roleValues.get('value')).toBe(1)
  })

  it('resolves a loop that closes through a second screen', () => {
    const first = screen()
    const second: StudioNode = {
      ...first,
      id: 'screen-b',
      data: { ...first.data, properties: { displayId: 'deck' } },
    }
    const nodes = [first, second, node('link', 'Math', { mathOp: 'add', a: 0, b: 0 })]
    const edges = [
      edge('e-a-out', 'screen', 'widget:slider:out', 'link', 'a'),
      edge('e-b-set', 'link', 'result', 'screen-b', 'widget:slider:set'),
      edge('e-b-out', 'screen-b', 'widget:slider:out', 'screen', 'widget:slider:set'),
    ]
    runtime().touchDisplayWidget('panel', 'slider', 0.4)
    runtime().touchDisplayWidget('deck', 'slider', 0.9)

    evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true)

    expect(runtime().readDisplayWidget('deck', 'slider')?.roleValues.get('set')).toBe(0.4)
    expect(runtime().readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe(0.9)
  })

  /*
   * A widget reading the panel's source publishes without a cable.
   *
   * The values were already on this node — the source is wired here for the
   * fixed layouts to draw — so the readings a Now Playing screen wants needed
   * five cables from a player already plugged in beside it. `widgetSources` is
   * the graph store's projection of which widget reads which field, and the
   * roles come from the widget's own ports rather than being assumed to be
   * `value`: a Slider shows its reading on `set`.
   */
  it('publishes a bound widget from the source wired into the panel', () => {
    const nodes = [
      node('screen', 'TransportDisplay', {
        displayId: 'panel', partId: 'st7789v-xpt2046-touch-240x320',
        widgetSources: {
          text: { field: 'time', roles: ['value'] },
          slider: { field: 'second', roles: ['set'] },
        },
      }, { inputs: [{ id: 'display', label: 'Display', dataType: 'display' }], outputs: [] }),
      node('rtc', 'RTCInput'),
    ]
    const edges = [edge('e-clock', 'rtc', 'display', 'screen', 'display')]
    evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true)
    const time = runtime().readDisplayWidget('panel', 'text')?.roleValues.get('value')
    expect(typeof time).toBe('string')
    expect(time).toMatch(/^\d\d:\d\d:\d\d$/)
    expect(typeof runtime().readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe('number')
  })

  /*
   * A field the wired source does not carry publishes nothing.
   *
   * Not a zero and not an empty string: a screen drawn against a player and
   * then moved to a clock has to show its own blank where a track title would
   * be, rather than claim the clock is playing something.
   */
  it('publishes nothing for a field this source does not carry', () => {
    const nodes = [
      node('screen', 'TransportDisplay', {
        displayId: 'panel', partId: 'st7789v-xpt2046-touch-240x320',
        widgetSources: { text: { field: 'title', roles: ['value'] } },
      }, { inputs: [{ id: 'display', label: 'Display', dataType: 'display' }], outputs: [] }),
      node('rtc', 'RTCInput'),
    ]
    const edges = [edge('e-clock', 'rtc', 'display', 'screen', 'display')]
    evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true)
    expect(runtime().readDisplayWidget('panel', 'text')).toBeUndefined()
  })

  /*
   * A panel drawing a screen design reports no fixed-layout touch.
   *
   * The combination is the ordinary one, not a corner case: a design reads the
   * source wired into its panel, so a design sits on a panel with a Music
   * Player on its Display input — exactly the shape whose fixed layout would
   * otherwise resolve and hand back that layout's play/pause region for glass
   * drawing something else. The design owns the touch; its widgets publish on
   * the panel's own outputs.
   *
   * Two panels in one graph, pressed at the same real hit coordinates, rather
   * than one panel read twice. A press is a rising *edge* keyed on the glass,
   * so reading the same panel twice makes the second answer false whatever the
   * rule is — a version of this test written that way passed with the guard
   * disabled, which is no test at all.
   */
  it('reports no fixed-layout touch for a panel drawing a screen design', () => {
    const geometry = fixedTransportGeometry(240, 320)
    const panelProperties = { partId: 'st7789v-xpt2046-touch-240x320', tftLayout: 'Fixed Transport' }
    const nodes = [
      node('plain', 'TransportDisplay', { ...panelProperties, displayId: '' }),
      node('plain-touch', 'TouchInput', { panelId: 'plain' }),
      node('designed', 'TransportDisplay', { ...panelProperties, displayId: 'design' }),
      node('designed-touch', 'TouchInput', { panelId: 'designed' }),
      node('player', 'PatternMaster'),
    ]
    const edges = [
      edge('e-plain', 'player', 'display', 'plain', 'display'),
      edge('e-designed', 'player', 'display', 'designed', 'display'),
    ]
    const press = { pressed: true, x: geometry.playPause.rect.x + 1, y: geometry.playPause.rect.y + 1 }
    useTransportDisplayTouchStore.getState().clear()
    useTransportDisplayTouchStore.getState().setTouch('plain', press)
    useTransportDisplayTouchStore.getState().setTouch('designed', press)

    const outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs
    const controls = (id: string) => outputs.get(id)?.controls as { playPause?: boolean } | undefined

    expect(controls('plain-touch')?.playPause).toBe(true)
    expect(controls('designed-touch')?.playPause).toBe(false)
  })

  // Run mode and the mounted panel thumbnail paint these values now, so a
  // wired display and its upstream inputs are sampled on every preview frame.
  it('publishes wired display readings on every preview frame', () => {
    const { nodes, edges } = graph()
    expect(evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.has('screen')).toBe(true)
    expect(evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false).outputs.has('screen')).toBe(true)
    expect(evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false).outputs.has('title')).toBe(true)
  })
})
