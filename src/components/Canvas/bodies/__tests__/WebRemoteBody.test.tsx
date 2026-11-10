import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import WebRemoteBody from '../WebRemoteBody'
import { useGraphStore, ROOT_GRAPH_ID, rootGraphNodes, type StudioNode } from '../../../../state/graphStore'
import { NODE_LIBRARY } from '../../../../state/nodeLibrary'
import { normalizeWebRemoteControls } from '../../../../state/peripherals/webRemote'
import { readWebRemoteControl, resetWebRemoteRuntime } from '../../../../state/peripherals/webRemoteRuntime'
import { RANGE_TRAVEL_STEPS, rangePosition } from '../../../../state/rangeScale'

// React Flow's <Handle> needs flow context; a plain stand-in is enough here.
vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>()
  return {
    ...actual,
    useUpdateNodeInternals: () => vi.fn(),
    Handle: ({ id }: { id: string }) => <span data-handle={id} />,
  }
})

function remote(controls: unknown[]): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === 'WebRemoteInput')!
  return {
    id: 'remote', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: def.label, nodeType: 'WebRemoteInput', category: def.category, properties: { controls }, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const savedControls = () => normalizeWebRemoteControls(
  (rootGraphNodes(useGraphStore.getState()).find((node) => node.id === 'remote')!.data.properties as Record<string, unknown>).controls,
)

describe('Web Remote body', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [remote([
        { id: 'trail', type: 'Slider', label: 'Trail', properties: { min: 0.1, max: 120, step: 0.1, initial: 14.4, scale: 'log' } },
      ])],
      edges: [], activeGraphId: ROOT_GRAPH_ID, graphData: {}, trusted: true,
    } as never)
  })

  afterEach(() => resetWebRemoteRuntime())

  it('slides a log control along its travel and holds seconds', () => {
    render(<WebRemoteBody nodeId="remote" />)
    const slider = screen.getByLabelText('Trail') as HTMLInputElement
    expect(slider.max).toBe(String(RANGE_TRAVEL_STEPS))
    expect(Number(slider.value)).toBe(Math.round(rangePosition(14.4, 0.1, 120, 'log') * RANGE_TRAVEL_STEPS))
    fireEvent.change(slider, { target: { value: String(RANGE_TRAVEL_STEPS / 2) } })
    expect(readWebRemoteControl('remote', 'trail', 0)).toBe(3.5)
  })

  it('lets a slider\'s scale be chosen in Edit, and keeps it with the control', () => {
    render(<WebRemoteBody nodeId="remote" />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const scale = screen.getByLabelText('Trail scale') as HTMLSelectElement
    expect(scale.value).toBe('log')
    fireEvent.change(scale, { target: { value: 'linear' } })
    expect(savedControls()[0].properties.scale).toBe('linear')
  })
})
