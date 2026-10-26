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
    const nodes = [node('remote', 'WebRemoteInput'), node('ff', 'FormulaField', { formulaType: 'rose' }), node('fill', 'SolidColor', { r: 0, g: 255, b: 0 })]
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
    const outcome = connectWireFirstControl('remote', 'ff', 'petals')
    expect(outcome).toMatchObject({ ok: true, remote: true, placed: false })
    const [control] = controls()
    expect(control).toMatchObject({ id: 'slider', type: 'Slider', label: 'Petals', properties: { min: 1, max: 12, step: 1 } })
    expect(useGraphStore.getState().edges.at(-1)).toMatchObject({
      source: 'remote', sourceHandle: 'remote:slider', target: 'ff', targetHandle: 'petals',
    })
    expect((remoteNode().data.outputs as { id: string; dataType: string }[])[0]).toEqual({ id: 'remote:slider', label: 'Petals', dataType: 'float' })
    expect(useGraphStore.getState().nodes.find((entry) => entry.id === 'ff')!.data.exposedInputs).toContain('petals')
    expect(readWebRemoteControl('remote', 'slider', 0)).toBe(5)
    // Kept as the control's own start, which the firmware, the page and a
    // board link read: the preview's value alone left a board starting at 1.
    expect(control.properties.initial).toBe(5)
  })

  it('starts a control wired by hand where the property is, and keeps a start already chosen', () => {
    addWebRemoteControl('remote', 'Slider')
    updateWebRemoteControl('remote', 'slider', { properties: { min: 1, max: 12, step: 1 } })
    useGraphStore.getState().onConnect({ source: 'remote', sourceHandle: 'remote:slider', target: 'ff', targetHandle: 'petals' })
    expect(controls()[0].properties.initial).toBe(5)

    const second = addWebRemoteControl('remote', 'Slider')!
    updateWebRemoteControl('remote', second, { properties: { min: 1, max: 12, step: 1, initial: 9 } })
    useGraphStore.getState().onConnect({ source: 'remote', sourceHandle: `remote:${second}`, target: 'ff', targetHandle: 'petals' })
    expect(controls()[1].properties.initial).toBe(9)
  })

  it('makes a Colour Picker for a colour, and refuses a second control on one value', () => {
    expect(connectWireFirstControl('remote', 'fill', 'color').ok).toBe(true)
    expect(controls()[0]).toMatchObject({ type: 'Colour Picker', properties: { initial: 120 } })
    const second = connectWireFirstControl('remote', 'fill', 'color')
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.refusal.code).toBe('already-driven')
  })

  it('takes one undo to remove the control and its wire', () => {
    connectWireFirstControl('remote', 'ff', 'petals')
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().edges).toHaveLength(0)
    expect(controls()).toHaveLength(0)
  })

  it('keeps the property row a remote for the control driving it', () => {
    connectWireFirstControl('remote', 'ff', 'petals')
    expect(isControlDriverPort('remote:slider')).toBe(true)
    expect(isControlDriverPort('value')).toBe(false)
    writeControlDriverValue({ srcId: 'remote', srcPort: 'remote:slider' }, useGraphStore.getState().nodes, 40)
    expect(readWebRemoteControl('remote', 'slider', 0)).toBe(12)
  })

  it('adds, renames and removes controls with their wires', () => {
    expect(addWebRemoteControl('remote', 'Toggle')).toBe('toggle')
    updateWebRemoteControl('remote', 'toggle', { label: 'Power', properties: { onLabel: 'LIT' } })
    expect(controls()[0]).toMatchObject({ id: 'toggle', label: 'Power', properties: { onLabel: 'LIT' } })
    connectWireFirstControl('remote', 'ff', 'petals')
    removeWebRemoteControl('remote', 'slider')
    expect(controls().map((control) => control.id)).toEqual(['toggle'])
    expect(useGraphStore.getState().edges).toHaveLength(0)
  })
})
