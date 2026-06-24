import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { NodeProps, Node } from '@xyflow/react'
import StudioNode from '../StudioNode'
import { useGraphStore } from '../../../state/graphStore'
import type { StudioNode as StudioNodeT, StudioNodeData } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'

// React Flow's <Handle> needs flow context; stub it — these tests cover the
// node body (labels + inline property controls), not handle behaviour.
vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>()
  return { ...actual, Handle: () => null }
})

function makeNode(nodeType: string, props: Record<string, unknown>): StudioNodeT {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)!
  return {
    id: 'n1', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: def.label, nodeType, category: def.category, properties: props, inputs: def.inputs, outputs: def.outputs },
  } as unknown as StudioNodeT
}

function renderNode(n: StudioNodeT) {
  useGraphStore.setState({ nodes: [n], edges: [] })
  const props = { id: n.id, data: n.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
  return render(<StudioNode {...props} />)
}

describe('StudioNode', () => {
  beforeEach(() => useGraphStore.setState({ nodes: [], edges: [] }))

  it('renders the node label and port labels', () => {
    const { getByText } = renderNode(makeNode('SolidColor', { r: 255, g: 0, b: 128 }))
    expect(getByText('Solid Color')).toBeTruthy()   // header
    expect(getByText('Color')).toBeTruthy()          // input port label
  })

  it('shows a colour swatch for r/g/b properties', () => {
    const { container } = renderNode(makeNode('SolidColor', { r: 255, g: 0, b: 128 }))
    const color = container.querySelector('input[type="color"]') as HTMLInputElement
    expect(color).toBeTruthy()
    expect(color.value).toBe('#ff0080')
  })

  it('editing a plain number field updates the node property in the store', () => {
    // Circle's `radius` has no PROPERTY_META entry, so it stays a number input.
    const { container } = renderNode(makeNode('Circle', { cx: 4, cy: 4, radius: 3, filled: false, r: 255, g: 0, b: 0 }))
    const num = container.querySelector('input[type="number"]') as HTMLInputElement
    expect(num).toBeTruthy()
    fireEvent.change(num, { target: { value: '5' } })
    // First number field is `cx` (property iteration order).
    expect(useGraphStore.getState().nodes[0].data.properties.cx).toBe(5)
  })

  it('renders a slider for speed and updates the property', () => {
    const { container } = renderNode(makeNode('NoiseField', { speed: 1, scale: 1, palette: 'rainbow' }))
    const range = container.querySelector('input[type="range"]') as HTMLInputElement
    expect(range).toBeTruthy()
    expect(range.min).toBe('0')
    // First slider is `speed` (property iteration order).
    fireEvent.change(range, { target: { value: '2.5' } })
    expect(useGraphStore.getState().nodes[0].data.properties.speed).toBe(2.5)
  })

  it('renders a dropdown for palette with the preset options', () => {
    const { container } = renderNode(makeNode('NoiseField', { speed: 1, scale: 1, palette: 'rainbow' }))
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select).toBeTruthy()
    expect(select.value).toBe('rainbow')
    const opts = Array.from(select.options).map((o) => o.value)
    expect(opts).toContain('ocean')
    expect(opts).toContain('party')
    fireEvent.change(select, { target: { value: 'ocean' } })
    expect(useGraphStore.getState().nodes[0].data.properties.palette).toBe('ocean')
  })

  it('toggling a boolean property renders a checkbox and updates the store', () => {
    const { container } = renderNode(makeNode('Circle', { cx: 4, cy: 4, radius: 3, filled: false, r: 255, g: 0, b: 0 }))
    const check = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(check).toBeTruthy()
    expect(check.checked).toBe(false)
    fireEvent.click(check)
    expect(useGraphStore.getState().nodes[0].data.properties.filled).toBe(true)
  })
})
