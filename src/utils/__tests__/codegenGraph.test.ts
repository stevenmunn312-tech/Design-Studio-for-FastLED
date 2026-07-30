import { describe, expect, it } from 'vitest'
import { codegenSignature } from '../codegenGraph'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'SolidColor', nodeType: 'SolidColor', category: 'pattern',
      properties, inputs: [], outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
    },
  } as unknown as StudioNode
}

const wire: StudioEdge[] = [
  { id: 'e1', source: 'a', sourceHandle: 'frame', target: 'b', targetHandle: 'frame' } as StudioEdge,
]

describe('codegenSignature', () => {
  it('ignores node positions — a drag must not invalidate the generated sketch', () => {
    const before = [node('a'), node('b')]
    const dragged = before.map((n) => ({ ...n, position: { x: 420, y: 96 }, dragging: true }))

    expect(codegenSignature(dragged, wire)).toBe(codegenSignature(before, wire))
  })

  it('ignores selection and measured geometry', () => {
    const before = [node('a')]
    const after = [{ ...before[0], selected: true, measured: { width: 220, height: 140 } }] as StudioNode[]

    expect(codegenSignature(after, [])).toBe(codegenSignature(before, []))
  })

  it('changes when a property changes', () => {
    expect(codegenSignature([node('a', { r: 255 })], []))
      .not.toBe(codegenSignature([node('a', { r: 254 })], []))
  })

  it('changes when the wiring changes', () => {
    expect(codegenSignature([node('a'), node('b')], wire))
      .not.toBe(codegenSignature([node('a'), node('b')], []))
  })

  it('changes when a node is added or removed', () => {
    expect(codegenSignature([node('a')], [])).not.toBe(codegenSignature([node('a'), node('b')], []))
  })

  it('does not collide across a node-id / field boundary', () => {
    // Naive concatenation can make ["ab", ""] and ["a", "b"] identical.
    expect(codegenSignature([node('ab')], [])).not.toBe(codegenSignature([node('a'), node('b')], []))
  })
})
