import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { NodeProps, Node } from '@xyflow/react'
import StudioNode from '../StudioNode'
import { useEscapeLayer } from '../../../hooks/useEscapeLayer'
import { useGraphStore } from '../../../state/graphStore'
import type { StudioNode as StudioNodeT, StudioNodeData } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'

// React Flow's <Handle> needs flow context; a DOM stand-in is enough here.
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

function makeNode(nodeType: string, props: Record<string, unknown>): StudioNodeT {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)!
  return {
    id: 'n1', type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: def.label, nodeType, category: def.category, properties: props, inputs: def.inputs, outputs: def.outputs },
  } as unknown as StudioNodeT
}

// Whatever is open above the canvas: a group editor, the Build Diagram, Help.
function Host({ node, onEscape }: { node: StudioNodeT; onEscape: () => void }) {
  useEscapeLayer(onEscape)
  const props = { id: node.id, data: node.data, selected: false } as unknown as NodeProps<Node<StudioNodeData>>
  return <StudioNode {...props} />
}

describe('StudioNode slider value editor', () => {
  it('abandons a typed value on Escape without closing the layer beneath', () => {
    const node = makeNode('Juggle', { speed: 0.5, count: 4, fade: 0.22, palette: 'rainbow' })
    useGraphStore.setState({ nodes: [node], edges: [] })
    const onEscape = vi.fn()
    const view = render(<Host node={node} onEscape={onEscape} />)
    fireEvent.doubleClick(view.getByLabelText('fade value'))
    const editor = view.getByLabelText('fade value') as HTMLInputElement
    expect(editor.type).toBe('text')
    fireEvent.change(editor, { target: { value: '0.9' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect((view.getByLabelText('fade value') as HTMLInputElement).type).toBe('range')
    expect(onEscape).not.toHaveBeenCalled()
  })
})
