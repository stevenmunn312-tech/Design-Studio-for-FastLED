import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PartIdentity from '../PartIdentity'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { resolvePartIdentity } from '../../../state/partOptions'

function part(nodeType: string, properties: Record<string, unknown>): StudioNode {
  return {
    id: 'part', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

describe('PartIdentity', () => {
  // The SH1106 I2C module carries six catalogue notes, which is what made the
  // hardware menu tall enough to push its own actions out of reach.
  const properties = { partId: 'sh1106-oled-128x64-i2c' }
  const identity = resolvePartIdentity('InfoDisplay', properties)!

  it('leads with what the module is and folds the rest behind a count', () => {
    expect(identity.notes.length).toBeGreaterThan(2)
    useGraphStore.setState({
      nodes: [part('InfoDisplay', properties)], edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<PartIdentity nodeId="part" nodeType="InfoDisplay" />)

    // The header order is the detail worth reading with a jumper in hand, so it
    // stays unfolded beside the first notes.
    expect(screen.getByText('Header, left to right')).toBeTruthy()
    for (const note of identity.notes.slice(0, 2)) expect(screen.getByText(note)).toBeTruthy()

    const summary = screen.getByText(`${identity.notes.length - 2} more about this module`)
    expect(summary.closest('details')?.hasAttribute('open')).toBe(false)
    // Folded, not dropped: every note is still reachable without leaving here.
    for (const note of identity.notes.slice(2)) expect(screen.getByText(note)).toBeTruthy()
  })

  it('shows no disclosure for a module with little to say', () => {
    const brief = resolvePartIdentity('InfoDisplay', properties)!
    if (brief.notes.length <= 2) return
    useGraphStore.setState({
      nodes: [part('MatrixOutput', {})], edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<PartIdentity nodeId="part" nodeType="MatrixOutput" />)
    expect(screen.queryByText(/more about this module/)).toBeNull()
  })
})
