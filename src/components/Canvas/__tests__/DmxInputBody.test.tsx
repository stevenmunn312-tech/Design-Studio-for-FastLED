import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DmxInputBody from '../DmxInputBody'
import { useGraphStore, ROOT_GRAPH_ID } from '../../../state/graphStore'
import { useDmxStore } from '../../../state/dmxStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import type { StudioNode } from '../../../state/graphStore'

// Opening the Art-Net listener makes the local helper bind a UDP socket on
// every interface, on a port carried inside the graph itself. A shared or
// imported project must not be able to do that before the user trusts it.

function dmxNode(id: string, properties: Record<string, unknown>): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === 'DMXInput')
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'DMX / Art-Net', nodeType: 'DMXInput', category: def?.category ?? 'input',
      properties, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const configure = vi.fn(async () => {})
const stop = vi.fn(async () => {})

function reset(trusted: boolean) {
  useGraphStore.setState({
    nodes: [dmxNode('dmx', { inputMode: 'Art-Net', previewPort: 6454, universe: 0 })],
    edges: [], selectedNodeId: null, activeGraphId: ROOT_GRAPH_ID, trusted,
  } as never)
  useDmxStore.setState({ configure, stop } as never)
  configure.mockClear()
  stop.mockClear()
}

describe('DmxInputBody Art-Net trust gate', () => {
  beforeEach(() => reset(true))

  it('opens the listener once the workspace is trusted', () => {
    render(<DmxInputBody nodeId="dmx" />)
    expect(configure).toHaveBeenCalledWith({ listenPort: 6454, universe: 0 })
  })

  it('holds the listener closed while the workspace is untrusted', () => {
    reset(false)
    render(<DmxInputBody nodeId="dmx" />)
    expect(configure).not.toHaveBeenCalled()
  })

  it('explains on the node why no listener is running', () => {
    reset(false)
    render(<DmxInputBody nodeId="dmx" />)
    expect(screen.getByText(/LISTENER HELD — UNTRUSTED/)).toBeTruthy()
    expect(screen.getByText(/isn’t trusted yet/)).toBeTruthy()
  })

  it('does not open a listener on an attacker-chosen port from an untrusted graph', () => {
    reset(false)
    useGraphStore.setState({
      nodes: [dmxNode('dmx', { inputMode: 'Art-Net', previewPort: 22, universe: 0 })],
    } as never)
    render(<DmxInputBody nodeId="dmx" />)
    expect(configure).not.toHaveBeenCalled()
  })
})
