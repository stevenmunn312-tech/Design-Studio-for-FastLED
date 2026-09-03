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

    const outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false).outputs.get('screen')!

    expect(runtime().readDisplayWidget('panel', 'text')?.roleValues.get('value')).toBe('Aurora Drift')
    expect(runtime().readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe(0.75)
    expect(outputs['widget:slider:out']).toBe(0.25)
    expect(outputs['widget:button:out']).toBe(false)
  })

  it('rests an untouched control at its type value and leaves unwired roles unpublished', () => {
    const outputs = evaluateGraphFull([screen()], [], 1, 8, 8, {}, false).outputs.get('screen')!

    expect(outputs).toEqual({ 'widget:slider:out': 0, 'widget:button:out': false })
    expect(runtime().readDisplayWidget('panel', 'text')).toBeUndefined()
    expect(runtime().readDisplayWidget('panel', 'slider')).toBeUndefined()
  })

  it('publishes nothing and touches nothing while the screen is disabled', () => {
    const { nodes, edges } = graph()
    nodes[0] = screen({ enabled: false })
    runtime().touchDisplayWidget('panel', 'slider', 0.25)

    const outputs = evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false).outputs.get('screen')!

    expect(outputs['widget:slider:out']).toBe(0)
    expect(runtime().readDisplayWidget('panel', 'text')).toBeUndefined()
  })

  it('stays hot on ports its library entry cannot declare', () => {
    const { nodes, edges } = graph()
    // auxNodes false is the non-publish frame: a screen the graph feeds must
    // still be evaluated, or a wired readout would crawl at the publish cadence.
    expect(evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false).outputs.has('screen')).toBe(true)
    expect(evaluateGraphFull(nodes, edges, 1, 8, 8, {}, false).outputs.has('title')).toBe(true)
  })
})
