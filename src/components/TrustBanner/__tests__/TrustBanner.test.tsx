import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import TrustBanner from '../TrustBanner'
import { useGraphStore, ROOT_GRAPH_ID } from '../../../state/graphStore'
import type { GraphContent, StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function setWorkspace(nodes: StudioNode[], opts: { trusted?: boolean; graphData?: Record<string, GraphContent> } = {}) {
  useGraphStore.setState({
    nodes,
    edges: [],
    graphData: opts.graphData ?? {},
    selectedNodeId: null,
    activeGraphId: ROOT_GRAPH_ID,
    trusted: opts.trusted ?? false,
  } as never)
}

describe('TrustBanner', () => {
  beforeEach(() => setWorkspace([]))

  it('says nothing when the untrusted workspace holds nothing gated', () => {
    // The ordinary shape of a shared pattern. Warning here describes a block
    // that isn't happening, which is how people learn to dismiss the banner.
    setWorkspace([node('p', 'Plasma'), node('o', 'MatrixOutput')])
    const { queryByRole } = render(<TrustBanner />)
    expect(queryByRole('alert')).toBeNull()
  })

  it('warns when the workspace holds a formula node', () => {
    setWorkspace([node('cf', 'CustomFormula'), node('o', 'MatrixOutput')])
    const { getByRole } = render(<TrustBanner />)
    expect(getByRole('alert').textContent).toMatch(/Formula and Code node preview logic won’t run/)
  })

  it('warns about a formula buried in a group subgraph', () => {
    setWorkspace([node('g', 'Group', { groupId: 'grp' })], {
      graphData: { grp: { nodes: [node('cf', 'FieldFormula')], edges: [] } },
    })
    expect(render(<TrustBanner />).getByRole('alert')).toBeTruthy()
  })

  it('names the Art-Net listener when that is the only thing held', () => {
    setWorkspace([node('d', 'DMXInput', { inputMode: 'Art-Net' })])
    const text = render(<TrustBanner />).getByRole('alert').textContent ?? ''
    expect(text).toMatch(/No Art-Net listener will open/)
    expect(text).not.toMatch(/Formula and Code/)
  })

  it('names both when both are held', () => {
    setWorkspace([node('cf', 'Code'), node('d', 'DMXInput', { inputMode: 'Art-Net' })])
    const text = render(<TrustBanner />).getByRole('alert').textContent ?? ''
    expect(text).toMatch(/Formula and Code node preview logic won’t run/)
    expect(text).toMatch(/no Art-Net listener will open/)
  })

  it('stays silent once the workspace is trusted', () => {
    setWorkspace([node('cf', 'CustomFormula')], { trusted: true })
    expect(render(<TrustBanner />).queryByRole('alert')).toBeNull()
  })

  it('appears as soon as gated content is added to a silent untrusted workspace', () => {
    // Staying quiet is only about what is *said* — the workspace is still
    // untrusted, so adding a formula node must surface the banner immediately.
    setWorkspace([node('p', 'Plasma')])
    const view = render(<TrustBanner />)
    expect(view.queryByRole('alert')).toBeNull()

    setWorkspace([node('p', 'Plasma'), node('cf', 'CustomFormula')])
    view.rerender(<TrustBanner />)
    expect(view.getByRole('alert')).toBeTruthy()
  })

  it('trusts the workspace when the button is used', () => {
    setWorkspace([node('cf', 'CustomFormula')])
    const { getByRole } = render(<TrustBanner />)
    fireEvent.click(getByRole('button', { name: 'Trust and run' }))
    expect(useGraphStore.getState().trusted).toBe(true)
  })
})
