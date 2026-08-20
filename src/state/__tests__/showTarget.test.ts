import { describe, expect, it } from 'vitest'
import { resolveShowTarget, showTargetLabel } from '../showTarget'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}, label?: string) =>
  ({ id, data: { nodeType, properties, ...(label ? { label } : {}) } })

const frameEdge = (source: string, target: string) =>
  ({ source, target, sourceHandle: 'frame', targetHandle: 'frame' })

describe('resolveShowTarget', () => {
  it('follows the generator frame edge to the output the show plays on', () => {
    const nodes = [
      node('pg', 'PerformanceGenerator'),
      node('a', 'MatrixOutput', { width: 16, height: 16 }),
      node('b', 'MatrixOutput', { width: 8, height: 32 }),
    ]
    const { target, problem } = resolveShowTarget(nodes, [frameEdge('pg', 'b')])
    expect(target?.id).toBe('b')
    expect(problem).toBeNull()
  })

  it('never picks an output the graph did not point at', () => {
    // The regression this exists for. It used to be
    // `nodes.find(n => nodeType === 'MatrixOutput')` — array order — so the
    // player configured itself from whichever output happened to come first,
    // and the user had no way to see which, let alone choose.
    const nodes = [
      node('pg', 'PerformanceGenerator'),
      node('first', 'MatrixOutput', { width: 16, height: 16, dataPin: 5 }),
      node('wired', 'MatrixOutput', { width: 60, height: 1, dataPin: 16 }),
    ]
    const { target } = resolveShowTarget(nodes, [frameEdge('pg', 'wired')])
    expect(target?.id).toBe('wired')
  })

  it('reports an unwired generator instead of finding an output anyway', () => {
    const nodes = [node('pg', 'PerformanceGenerator'), node('a', 'MatrixOutput')]
    const { target, problem } = resolveShowTarget(nodes, [])
    expect(target).toBeNull()
    expect(problem).toBe('unconnected')
  })

  it('reports two outputs rather than half-honouring the request', () => {
    // The player allocates one LED array and one controller. Driving two is a
    // real thing to want and not a thing it can do, so it is said out loud.
    const nodes = [
      node('pg', 'PerformanceGenerator'),
      node('a', 'MatrixOutput'),
      node('b', 'MatrixOutput'),
    ]
    const { target, reached, problem } = resolveShowTarget(nodes, [frameEdge('pg', 'a'), frameEdge('pg', 'b')])
    expect(target).toBeNull()
    expect(reached).toHaveLength(2)
    expect(problem).toBe('ambiguous')
  })

  it('ignores edges that are not the generator driving an output', () => {
    const nodes = [
      node('pg', 'PerformanceGenerator'),
      node('lib', 'MusicLibrary'),
      node('a', 'MatrixOutput'),
    ]
    const edges = [
      { source: 'lib', target: 'pg', sourceHandle: 'music', targetHandle: 'music' },
      // A pattern feeding the same output is somebody else's wire.
      frameEdge('sc', 'a'),
    ]
    expect(resolveShowTarget(nodes, edges).problem).toBe('unconnected')
  })

  it('names an output by its label and size for the error text', () => {
    expect(showTargetLabel(node('a', 'MatrixOutput', { width: 60, height: 1 }, 'LED String')))
      .toBe('LED String · 60×1')
  })
})
