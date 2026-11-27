import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addWebRemoteControl,
  connectWireFirstControl,
  removeWebRemoteControl,
  ROOT_GRAPH_ID,
  updateWebRemoteControl,
  useGraphStore,
  type StudioNode,
} from '../../graphStore'
import { NODE_LIBRARY } from '../../nodeLibrary'
import { isControlDriverPort, writeControlDriverValue } from '../../player/wireFirstControls'
import { normalizeWebRemoteControls } from '../webRemote'
import { readWebRemoteControl, resetWebRemoteRuntime } from '../webRemoteRuntime'
import { TOUCH_CONTROL_ADD_HANDLE } from '../../displays/displayRegistry'

/*
 * Creating a Web Remote control by wiring it: the Touch node's wire-first
 * gesture, with the phone page as the screen. The property names the control,
 * one set mints it and its wire, and the row it drives stays a remote for it.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...definition.defaultProperties, ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

const remoteNode = () => useGraphStore.getState().nodes.find((entry) => entry.id === 'remote')!
const controls = () => normalizeWebRemoteControls((remoteNode().data.properties as Record<string, unknown>).controls)

describe('Web Remote wire-first controls', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.setState({
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},
    } as never)
    const nodes = [node('remote', 'WebRemoteInput'), node('ff', 'GeometryField', { formulaType: 'goldenTiling' }), node('fill', 'SolidColor', { r: 0, g: 255, b: 0 }), node('ct', 'ColorTrails')]
    useGraphStore.getState().loadGraph(nodes, [], { nodes, edges: [], displayDocuments: {} } as never)
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetWebRemoteRuntime()
  })

  it('starts with only the invitation', () => {
    expect((remoteNode().data.outputs as { id: string }[]).map((port) => port.id)).toEqual([TOUCH_CONTROL_ADD_HANDLE])
  })

  it('mints a ranged control and its wire in one step, starting at the property value', () => {
    const outcome = connectWireFirstControl('remote', 'ff', 'density')
    expect(outcome).toMatchObject({ ok: true, remote: true, placed: false })
    const [control] = controls()
    expect(control).toMatchObject({ id: 'slider', type: 'Slider', label: 'Density', properties: { min: 2, max: 40, step: 1 } })
    expect(useGraphStore.getState().edges.at(-1)).toMatchObject({
      source: 'remote', sourceHandle: 'remote:slider', target: 'ff', targetHandle: 'density',
    })
    expect((remoteNode().data.outputs as { id: string; dataType: string }[])[0]).toEqual({ id: 'remote:slider', label: 'Density', dataType: 'float' })
    expect(useGraphStore.getState().nodes.find((entry) => entry.id === 'ff')!.data.exposedInputs).toContain('density')
    expect(readWebRemoteControl('remote', 'slider', 0)).toBe(12)
    // Kept as the control's own start, which the firmware, the page and a
    // board link read: the preview's value alone left a board starting at 1.
    expect(control.properties.initial).toBe(12)
  })

  it('gives a phone slider on a log property the same log travel, in seconds', () => {
    expect(connectWireFirstControl('remote', 'ct', 'trailLength').ok).toBe(true)
    const [control] = controls()
    expect(control).toMatchObject({ type: 'Slider', properties: { min: 0.1, max: 120, step: 0.1, scale: 'log' } })
    expect(readWebRemoteControl('remote', control.id, 0)).toBe(14.4)
  })

  it('starts a control wired by hand where the property is, and keeps a start already chosen', () => {
    addWebRemoteControl('remote', 'Slider')
    updateWebRemoteControl('remote', 'slider', { properties: { min: 1, max: 12, step: 1 } })
    useGraphStore.getState().onConnect({ source: 'remote', sourceHandle: 'remote:slider', target: 'ff', targetHandle: 'density' })
    expect(controls()[0].properties.initial).toBe(12)

    const second = addWebRemoteControl('remote', 'Slider')!
    updateWebRemoteControl('remote', second, { properties: { min: 1, max: 12, step: 1, initial: 9 } })
    useGraphStore.getState().onConnect({ source: 'remote', sourceHandle: `remote:${second}`, target: 'ff', targetHandle: 'density' })
    expect(controls()[1].properties.initial).toBe(9)
  })

  it('makes a Colour Picker for a colour, and a second control replaces the first one\'s wire', () => {
    expect(connectWireFirstControl('remote', 'fill', 'color').ok).toBe(true)
    expect(controls()[0]).toMatchObject({ type: 'Colour Picker', properties: { initial: 120 } })
    expect(connectWireFirstControl('remote', 'fill', 'color').ok).toBe(true)
    const onRow = useGraphStore.getState().edges.filter((e) => e.target === 'fill' && e.targetHandle === 'color')
    expect(onRow).toHaveLength(1)
  })

  it('replaces the wire on an already-driven row, as every other source does', () => {
    const old = { id: 'old', source: 'ct', sourceHandle: 'frame', target: 'ff', targetHandle: 'density', type: 'glowEdge' }
    useGraphStore.setState({ edges: [old] } as never)
    expect(connectWireFirstControl('remote', 'ff', 'density').ok).toBe(true)
    const onRow = useGraphStore.getState().edges.filter((e) => e.target === 'ff' && e.targetHandle === 'density')
    expect(onRow).toHaveLength(1)
    expect(onRow[0].source).toBe('remote')
    expect(controls()).toHaveLength(1)
  })

  it('follows the hand-wire rule on an action row too: one source per input, the newest wins', () => {
    const nodes = [...useGraphStore.getState().nodes, node('ir', 'IRRemoteInput'), node('pc', 'ControlMap')]
    useGraphStore.getState().loadGraph(nodes, [], { nodes, edges: [], displayDocuments: {} } as never)
    const into = () => useGraphStore.getState().edges.filter((e) => e.target === 'pc' && e.targetHandle === 'patternNext')
    useGraphStore.getState().onConnect({ source: 'ir', sourceHandle: 'button-kit-right', target: 'pc', targetHandle: 'patternNext' })
    // The reference: a second hand-drawn wire replaces the first.
    useGraphStore.getState().onConnect({ source: 'ct', sourceHandle: 'frame', target: 'pc', targetHandle: 'patternNext' })
    expect(into().map((e) => e.source)).toEqual(['ct'])
    useGraphStore.getState().onConnect({ source: 'ir', sourceHandle: 'button-kit-right', target: 'pc', targetHandle: 'patternNext' })
    expect(connectWireFirstControl('remote', 'pc', 'patternNext').ok).toBe(true)
    expect(into().map((e) => e.source)).toEqual(['remote'])
    expect(controls()).toHaveLength(1)
  })

  it('takes one undo to remove the control and its wire', () => {
    connectWireFirstControl('remote', 'ff', 'density')
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().edges).toHaveLength(0)
    expect(controls()).toHaveLength(0)
  })

  it('keeps the property row a remote for the control driving it', () => {
    connectWireFirstControl('remote', 'ff', 'density')
    expect(isControlDriverPort('remote:slider')).toBe(true)
    expect(isControlDriverPort('value')).toBe(false)
    writeControlDriverValue({ srcId: 'remote', srcPort: 'remote:slider' }, useGraphStore.getState().nodes, 99)
    expect(readWebRemoteControl('remote', 'slider', 0)).toBe(40)
  })

  it('adds, renames and removes controls with their wires', () => {
    expect(addWebRemoteControl('remote', 'Toggle')).toBe('toggle')
    updateWebRemoteControl('remote', 'toggle', { label: 'Power', properties: { onLabel: 'LIT' } })
    expect(controls()[0]).toMatchObject({ id: 'toggle', label: 'Power', properties: { onLabel: 'LIT' } })
    connectWireFirstControl('remote', 'ff', 'density')
    removeWebRemoteControl('remote', 'slider')
    expect(controls().map((control) => control.id)).toEqual(['toggle'])
    expect(useGraphStore.getState().edges).toHaveLength(0)
  })
})
