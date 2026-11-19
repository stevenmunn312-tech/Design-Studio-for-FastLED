import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { Node, NodeProps } from '@xyflow/react'
import StudioNode from '../StudioNode'
import { useGraphStore } from '../../../state/graphStore'
import type { StudioNode as StudioNodeT, StudioNodeData } from '../../../state/graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../../state/nodeLibrary'
import { PART_CATALOGUE, type PartCatalogueEntry } from '../../../build/parts/partCatalogue'

vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>()
  return {
    ...actual,
    useUpdateNodeInternals: () => vi.fn(),
    Handle: ({ type, id, style, ...rest }: { type: string; id: string; style?: React.CSSProperties } & React.HTMLAttributes<HTMLSpanElement>) => (
      <span data-handle={`${type}:${id}`} style={style} {...rest} />
    ),
  }
})

function openAllGroups(container: HTMLElement) {
  for (const header of container.querySelectorAll('button[aria-expanded="false"]:not([aria-haspopup])')) {
    fireEvent.click(header)
  }
}

function outputNode(props: Record<string, unknown>): StudioNodeT {
  const def = NODE_LIBRARY.find((n) => n.type === 'MatrixOutput')!
  return {
    id: 'n1', type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType: 'MatrixOutput', category: def.category,
      properties: { ...libraryDefaults('MatrixOutput'), ...props }, inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNodeT
}

function renderOutput(props: Record<string, unknown>) {
  const n = outputNode(props)
  useGraphStore.setState({ nodes: [n], edges: [] })
  const nodeProps = { id: n.id, data: n.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
  const view = render(<StudioNode {...nodeProps} />)
  openAllGroups(view.container)
  // The canvas hands the node its new data after every store write; do the same.
  const refresh = () => {
    const current = useGraphStore.getState().nodes.find((entry) => entry.id === 'n1')!
    view.rerender(<StudioNode {...({ id: current.id, data: current.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>)} />)
  }
  return { ...view, refresh }
}

const stored = () => useGraphStore.getState().nodes.find((n) => n.id === 'n1')!.data.properties as Record<string, unknown>
const partSelect = (container: HTMLElement) => container.querySelector('select[aria-label="LED part"]') as HTMLSelectElement
const countInput = (container: HTMLElement) => container.querySelector('input[aria-label="LED count value"]') as HTMLInputElement
const chipsetSelect = (container: HTMLElement) => container.querySelector('select[aria-label="chipset value"]') as HTMLSelectElement
const orderSelect = (container: HTMLElement) => container.querySelector('select[aria-label="color order value"]') as HTMLSelectElement | null

beforeEach(() => localStorage.clear())
afterEach(() => { delete PART_CATALOGUE['test-cut-3-strip'] })

describe('LED part picker on the LED output node', () => {
  it('starts Custom, with nothing locked and no Make custom button', () => {
    const { container, queryByText } = renderOutput({ form: 'strip', ledCount: 60 })
    expect(partSelect(container).value).toBe('')
    expect(partSelect(container).selectedOptions[0].textContent).toBe('Custom')
    expect(chipsetSelect(container).disabled).toBe(false)
    expect(queryByText('Make custom')).toBeNull()
    expect(stored().partId ?? '').toBe('')
  })

  it('stamps and locks a ring when it is picked, leaving colour order editable', () => {
    const { container, getByText, refresh } = renderOutput({ form: 'strip', ledCount: 60, chipset: 'APA102' })
    fireEvent.change(partSelect(container), { target: { value: 'ws2812b-ring-24' } })
    refresh()
    expect(stored()).toMatchObject({ partId: 'ws2812b-ring-24', form: 'ring', chipset: 'WS2812B', ledCount: 24 })
    expect(chipsetSelect(container).disabled).toBe(true)
    expect(countInput(container).disabled).toBe(true)
    const order = orderSelect(container)
    expect(order).not.toBeNull()
    expect(order!.disabled).toBe(false)
    expect(chipsetSelect(container).closest('div')!.getAttribute('title')).toContain('Set by the part')
    expect(getByText(/Set by the part:/)).toBeTruthy()
  })

  it('unlocks on Make custom and keeps the stamped values', () => {
    const { container, getByText, refresh } = renderOutput({ form: 'strip', ledCount: 60, chipset: 'APA102' })
    fireEvent.change(partSelect(container), { target: { value: 'ws2812b-ring-24' } })
    refresh()
    fireEvent.click(getByText('Make custom'))
    refresh()
    expect(stored().partId ?? '').toBe('')
    expect(stored()).toMatchObject({ form: 'ring', chipset: 'WS2812B', ledCount: 24 })
    expect(partSelect(container).value).toBe('')
    expect(chipsetSelect(container).disabled).toBe(false)
    expect(countInput(container).disabled).toBe(false)
  })

  it('returns to Custom when Custom is picked from the list', () => {
    const { container, refresh } = renderOutput({ form: 'strip', ledCount: 60 })
    fireEvent.change(partSelect(container), { target: { value: 'ws2812b-ring-12' } })
    refresh()
    fireEvent.change(partSelect(container), { target: { value: '' } })
    refresh()
    expect(stored().partId ?? '').toBe('')
    expect(chipsetSelect(container).disabled).toBe(false)
  })

  it('clamps a cuttable strip to its reel and says the bounds', () => {
    const { container, getByText, refresh } = renderOutput({ form: 'strip', ledCount: 60 })
    fireEvent.change(partSelect(container), { target: { value: 'ws2812b-strip' } })
    refresh()
    const input = countInput(container)
    expect(input.disabled).toBe(false)
    expect(getByText(/1 to 240 LEDs/)).toBeTruthy()
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.blur(input)
    refresh()
    expect(stored().ledCount).toBe(240)
  })

  it('snaps a strip cut in threes to a multiple of three', () => {
    const source = PART_CATALOGUE['ws2812b-strip'] as PartCatalogueEntry
    PART_CATALOGUE['test-cut-3-strip'] = {
      ...source, partId: 'test-cut-3-strip', label: 'Test 12 V strip',
      ledOutput: { ...source.ledOutput!, cutEvery: 3, maxCount: 300 },
    }
    const { container, getByText, refresh } = renderOutput({ form: 'strip', ledCount: 60 })
    fireEvent.change(partSelect(container), { target: { value: 'test-cut-3-strip' } })
    refresh()
    expect(getByText(/3 to 300 LEDs, cut every 3/)).toBeTruthy()
    const input = countInput(container)
    fireEvent.change(input, { target: { value: '100' } })
    fireEvent.blur(input)
    refresh()
    expect(stored().ledCount).toBe(99)
  })

  it('keeps and names a saved part this version lacks', () => {
    const { container, getByText } = renderOutput({ form: 'strip', ledCount: 10, partId: 'acme-future-strip' })
    expect(partSelect(container).value).toBe('acme-future-strip')
    expect(getByText(/does not have that LED part/)).toBeTruthy()
    expect(stored().partId).toBe('acme-future-strip')
  })
})
