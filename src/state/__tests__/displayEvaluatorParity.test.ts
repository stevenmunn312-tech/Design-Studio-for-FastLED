import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { useDisplayRuntimeStore } from '../displayRuntimeStore'
import { useGraphStore } from '../graphStore'
import type { StudioEdge, StudioNode } from '../graphStore'

function node(
  id: string,
  nodeType: string,
  properties: Record<string, unknown> = {},
  ports: { inputs?: unknown[]; outputs?: unknown[] } = {},
): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: definition?.category ?? 'output',
      properties,
      inputs: ports.inputs ?? definition?.inputs ?? [],
      outputs: ports.outputs ?? definition?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as unknown as StudioEdge
}

function screen(id = 'screen', displayId = 'panel'): StudioNode {
  return node(id, 'Display', { displayId }, {
    inputs: [
      { id: 'widget:title:value', label: 'Title', dataType: 'string' },
      { id: 'widget:slider:set', label: 'Set', dataType: 'float' },
    ],
    outputs: [
      { id: 'widget:button:out', label: 'Button', dataType: 'bool' },
      { id: 'widget:slider:out', label: 'Slider', dataType: 'float' },
    ],
  })
}


describe('display evaluator parity', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useDisplayRuntimeStore.getState().resetDisplayRuntime()
  })

  afterEach(() => {
    // This suite creates one temporary graph group to exercise the same
    // boundary migration a user gets from the canvas. Do not leave it around
    // for tests that inspect the singleton graph store afterwards.
    useGraphStore.setState({ nodes: [], edges: [], graphData: {}, activeGraphId: 'root' } as never)
  })

  // A fixed panel no longer takes arbitrary text: seventeen content ports
  // became one envelope, and wiring a graph reading onto a panel is what the
  // custom Display is for. So this is now about the custom panel only, and
  // the fixed one is checked against a real source below.
  it('carries one formatted string through the evaluator into a custom panel', () => {
    const format = node('format', 'FormatNumber', {
      value: 42.5,
      decimals: 1,
      padWidth: 3,
      showSign: true,
      suffix: ' BPM',
    })
    const custom = screen()
    const result = evaluateGraphFull(
      [format, custom],
      [edge('custom-title', 'format', 'text', 'screen', 'widget:title:value')],
      0,
      8,
      8,
    )

    expect(result.outputs.get('format')?.text).toBe('+042.5 BPM')
    expect(useDisplayRuntimeStore.getState().readDisplayWidget('panel', 'title')?.roleValues.get('value'))
      .toBe('+042.5 BPM')
  })

  it('updates each fixed layout through its declared evaluator contract', () => {
    const rtc = node('rtc', 'RTCInput', { timeSource: 'Manual', startYear: 2026, startMonth: 9, startDay: 6, startHour: 9, startMinute: 5 })
    const info = node('info', 'InfoDisplay', { partId: 'sh1106-oled-128x64' })
    const segment = node('segment', 'SegmentDisplay', { partId: 'tm1637-4digit-display' })
    // The colour panel needs its own source: an RTC has no colour layout, so
    // pointing all three at the clock would only prove the TFT waits.
    const slideshow = node('slideshow', 'PatternSlideshow')
    const transport = node('transport', 'TransportDisplay', {})
    const result = evaluateGraphFull(
      [rtc, info, segment, slideshow, transport],
      [
        edge('clock-info', 'rtc', 'display', 'info', 'display'),
        edge('clock-segment', 'rtc', 'display', 'segment', 'display'),
        edge('show-transport', 'slideshow', 'display', 'transport', 'display'),
      ],
      0,
      8,
      8,
    )

    expect(result.outputs.get('info')).toMatchObject({ lit: true, layout: 'Clock' })
    expect(result.outputs.get('info')?.surface).toMatchObject({ width: 128, height: 64 })
    expect(result.outputs.get('segment')?.segment).toMatchObject({ digits: '0905', lit: true })
    expect(result.outputs.get('transport')).toMatchObject({ lit: true, layout: 'Show Status' })
    expect(result.outputs.get('transport')?.surface).toMatchObject({ width: 240, height: 240 })
  })

  it('samples every declared widget output while publishing each wired role', () => {
    const custom = screen()
    const title = node('title', 'TextValue', { text: 'MIDNIGHT DRIVE' })
    const level = node('level', 'Math', { mathOp: 'add', a: 0.5, b: 0.25 })
    const runtime = useDisplayRuntimeStore.getState()
    runtime.touchDisplayWidget('panel', 'button', true)
    runtime.touchDisplayWidget('panel', 'slider', 0.4)

    const result = evaluateGraphFull(
      [custom, title, level],
      [
        edge('title', 'title', 'text', 'screen', 'widget:title:value'),
        edge('level', 'level', 'result', 'screen', 'widget:slider:set'),
      ],
      0,
      8,
      8,
    )

    expect(result.outputs.get('screen')).toMatchObject({
      'widget:button:out': true,
      'widget:slider:out': 0.4,
    })
    expect(runtime.readDisplayWidget('panel', 'title')?.roleValues.get('value')).toBe('MIDNIGHT DRIVE')
    expect(runtime.readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe(0.75)
  })

  it('keeps a synchronized control touch-owned for one pass, then releases it to the graph', () => {
    const custom = screen()
    const level = node('level', 'Math', { mathOp: 'add', a: 0.5, b: 0.25 })
    const edges = [edge('level', 'level', 'result', 'screen', 'widget:slider:set')]
    const runtime = useDisplayRuntimeStore.getState()
    runtime.touchDisplayWidget('panel', 'slider', 0.4)

    const held = evaluateGraphFull([custom, level], edges, 0, 8, 8).outputs.get('screen')!
    expect(held['widget:slider:out']).toBe(0.4)
    // Input roles are deliberately published after output sampling: the
    // graph cannot overwrite a finger in the same pass.
    expect(runtime.readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe(0.75)

    runtime.releaseDisplayWidget('panel', 'slider')
    const released = evaluateGraphFull([custom, level], edges, 1, 8, 8).outputs.get('screen')!
    expect(released['widget:slider:out']).toBe(0.75)
  })

  it('preserves the string type when grouping a display-facing connection', () => {
    const source = node('source', 'TextValue', { text: 'TITLE' })
    // Hardware-owned displays remain at the root by design. This is the same
    // display-facing string input shape the group migration needs to preserve,
    // represented by an ordinary node so the test exercises that boundary
    // rather than bypassing the root-ownership rule.
    const consumer = node('consumer', 'FormatNumber')
    consumer.data.inputs = [{ id: 'title', label: 'Title', dataType: 'string' }]
    useGraphStore.setState({
      nodes: [source, consumer],
      edges: [edge('title', 'source', 'text', 'consumer', 'title')],
      graphData: {},
      activeGraphId: 'root',
    } as never)

    const groupId = useGraphStore.getState().createGroup('Panel content', ['consumer'])
    const group = useGraphStore.getState().nodes.find((entry) => entry.data.nodeType === 'Group')!
    const groupInput = useGraphStore.getState().graphData[groupId].nodes
      .find((entry) => entry.data.nodeType === 'GroupInput')!

    expect((group.data.inputs as Array<{ dataType: string }>)).toEqual([
      expect.objectContaining({ dataType: 'string' }),
    ])
    expect((groupInput.data.outputs as Array<{ dataType: string }>)).toEqual([
      expect.objectContaining({ dataType: 'string' }),
    ])
  })

  it('returns sampled control values around a feedback cycle instead of the recursion fallback', () => {
    const custom = screen()
    const add = node('add', 'Math', { mathOp: 'add', a: 0, b: 0.25 })
    useDisplayRuntimeStore.getState().touchDisplayWidget('panel', 'slider', 0.5)

    const result = evaluateGraphFull(
      [custom, add],
      [
        edge('out', 'screen', 'widget:slider:out', 'add', 'a'),
        edge('set', 'add', 'result', 'screen', 'widget:slider:set'),
      ],
      0,
      8,
      8,
    )

    expect(result.outputs.get('screen')?.['widget:slider:out']).toBe(0.5)
    expect(useDisplayRuntimeStore.getState().readDisplayWidget('panel', 'slider')?.roleValues.get('set')).toBe(0.75)
  })
})
