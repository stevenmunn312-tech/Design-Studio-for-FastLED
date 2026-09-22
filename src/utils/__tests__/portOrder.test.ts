import { describe, expect, it } from 'vitest'
import { orderPorts, untanglePortOrders } from '../portOrder'

const port = (id: string) => ({ id, label: id, dataType: 'float' as const })

describe('orderPorts', () => {
  it('keeps a saved permutation and appends ports the library grew later', () => {
    const canonical = [port('a'), port('b'), port('c'), port('d')]
    expect(orderPorts(canonical, [port('c'), port('a'), port('b')]).map((p) => p.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('leaves library order alone when nothing was saved', () => {
    expect(orderPorts([port('a'), port('b')], undefined).map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe('untanglePortOrders', () => {
  it('reverses the source when its ports run opposite the node they feed', () => {
    const changed = untanglePortOrders(
      [
        { id: 'src', nodeType: 'Source', inputs: [], outputs: [port('a'), port('b'), port('c')] },
        { id: 'dst', nodeType: 'Sink', inputs: [port('c'), port('b'), port('a')], outputs: [] },
      ],
      [
        { source: 'src', sourceHandle: 'a', target: 'dst', targetHandle: 'a' },
        { source: 'src', sourceHandle: 'b', target: 'dst', targetHandle: 'b' },
        { source: 'src', sourceHandle: 'c', target: 'dst', targetHandle: 'c' },
      ],
    )
    expect(changed.get('src')?.outputs.map((p) => p.id)).toEqual(['c', 'b', 'a'])
    expect(changed.has('dst')).toBe(false)
  })

  it('reorders the fed node when the source ports are also wired elsewhere', () => {
    const changed = untanglePortOrders(
      [
        { id: 'src', nodeType: 'Source', inputs: [], outputs: [port('a'), port('b')] },
        { id: 'dst', nodeType: 'Sink', inputs: [port('b'), port('a')], outputs: [] },
        { id: 'other', nodeType: 'Sink', inputs: [port('a'), port('b')], outputs: [] },
      ],
      [
        { source: 'src', sourceHandle: 'a', target: 'dst', targetHandle: 'a' },
        { source: 'src', sourceHandle: 'b', target: 'dst', targetHandle: 'b' },
        { source: 'src', sourceHandle: 'a', target: 'other', targetHandle: 'a' },
        { source: 'src', sourceHandle: 'b', target: 'other', targetHandle: 'b' },
      ],
    )
    // src→other is already parallel. Swapping src would cross that pair, so dst flips instead.
    expect(changed.has('src')).toBe(false)
    expect(changed.get('dst')?.inputs.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('leaves a bundle that already runs in parallel', () => {
    const changed = untanglePortOrders(
      [
        { id: 'src', nodeType: 'Source', inputs: [], outputs: [port('a'), port('b')] },
        { id: 'dst', nodeType: 'Sink', inputs: [port('a'), port('b')], outputs: [] },
      ],
      [
        { source: 'src', sourceHandle: 'a', target: 'dst', targetHandle: 'a' },
        { source: 'src', sourceHandle: 'b', target: 'dst', targetHandle: 'b' },
      ],
    )
    expect(changed.size).toBe(0)
  })
})
