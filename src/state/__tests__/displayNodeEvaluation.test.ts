import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { useDisplayRuntimeStore } from '../displayRuntimeStore'
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
const screen = (props: Record<string, unknown> = {}) => node('screen', 'Display', { displayId: 'panel', ...props }, {
  inputs: [
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

    expect(outputs).toEqual({ 'widget:slider:out': 0, 'widget:button:out': false })
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

    const outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.get('screen')!

    expect(outputs['widget:slider:out']).toBe(0.5)
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

  // A screen is evaluated on publish frames like any other node. It is
  // deliberately NOT a hot root: seeding the hot set from its minted ports put
  // its whole upstream on the 60 fps path to publish values no renderer reads
  // yet. Restore it — and this test — when a panel paints them.
  it('publishes at the preview cadence rather than pulling its upstream every frame', () => {
    const { nodes, edges } = graph()
    expect(evaluateGraphFull(nodes, edges, 1, 8, 8, {}, true).outputs.has('screen')).toBe(true)
    expect(evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false).outputs.has('screen')).toBe(false)
    expect(evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false).outputs.has('title')).toBe(false)
  })
})
