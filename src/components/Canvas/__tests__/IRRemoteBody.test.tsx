import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import IRRemoteBody from '../IRRemoteBody'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../../state/graphStore'
import { useHardwareInputStore } from '../../../state/hardwareInputStore'
import { useUiStore } from '../../../state/uiStore'
import { irRemoteButtonHandle } from '../../../state/irRemote'

vi.mock('@xyflow/react', async () => {
  const React = await import('react')
  return {
    useUpdateNodeInternals: () => () => {},
    Position: { Right: 'right' },
    Handle: (props: { id?: string }) => React.createElement('div', { 'data-handle': props.id }),
  }
})

function node(properties: Record<string, unknown>): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === 'IRRemoteInput')!
  return {
    id: 'ir', type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType: def.type, category: def.category,
      properties: { ...libraryDefaults('IRRemoteInput'), ...properties },
      inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

const edge = (id: string, handle: string): StudioEdge =>
  ({ id, source: 'ir', sourceHandle: handle, target: 'step', targetHandle: 'increase' }) as unknown as StudioEdge

const power = { id: 'power', label: 'Power', protocol: 'NEC', address: 0, command: 69, repeat: 'once' as const }

describe('IR remote node body', () => {
  beforeEach(() => {
    useHardwareInputStore.setState({ button: new Map(), pot: new Map(), encoder: new Map() })
    useGraphStore.setState({
      nodes: [node({ buttons: [power] })],
      edges: [],
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},
    } as never)
  })

  it('presses a key into the transient hardware store and releases it', () => {
    render(<IRRemoteBody nodeId="ir" />)
    const press = screen.getByRole('button', { name: 'Press Power' })
    fireEvent.pointerDown(press)
    expect(useHardwareInputStore.getState().button.get('ir:power')).toBe(true)
    fireEvent.pointerUp(press)
    expect(useHardwareInputStore.getState().button.get('ir:power')).toBe(false)
  })

  it('renames a key without changing its output handle', () => {
    render(<IRRemoteBody nodeId="ir" />)
    const name = screen.getByRole('textbox', { name: 'Power name' })
    fireEvent.change(name, { target: { value: 'On / Off' } })
    fireEvent.blur(name)
    const buttons = useGraphStore.getState().nodes[0].data.properties.buttons as Array<{ id: string; label: string }>
    expect(buttons[0]).toMatchObject({ id: 'power', label: 'On / Off' })
    expect((useGraphStore.getState().nodes[0].data.outputs as Array<{ id: string }>)[0].id).toBe(irRemoteButtonHandle('power'))
  })

  it('asks before removing a key that has a wire, and leaves it when cancelled', () => {
    useGraphStore.setState({ edges: [edge('e1', irRemoteButtonHandle('power'))] } as never)
    const confirm = vi.spyOn(useUiStore.getState(), 'requestConfirm').mockResolvedValue(false)
    render(<IRRemoteBody nodeId="ir" />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Power' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(useGraphStore.getState().nodes[0].data.properties.buttons).toEqual([power])
    expect(useGraphStore.getState().edges).toHaveLength(1)
  })
})
