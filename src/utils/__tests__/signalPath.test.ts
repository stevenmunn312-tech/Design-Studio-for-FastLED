import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import { traceSignalPath } from '../signalPath'

const edge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
})

describe('traceSignalPath', () => {
  const edges = [
    edge('source', 'left'),
    edge('source', 'right'),
    edge('left', 'mix'),
    edge('right', 'other'),
    edge('mix', 'output'),
    edge('other', 'output'),
  ]

  it('includes ancestors and descendants of the selected node', () => {
    expect([...traceSignalPath(edges, 'left')].sort()).toEqual([
      'left', 'mix', 'output', 'source',
    ])
  })

  it('does not pull in sibling branches that only share an ancestor', () => {
    const path = traceSignalPath(edges, 'left')
    expect(path.has('right')).toBe(false)
    expect(path.has('other')).toBe(false)
  })

  it('returns no focus path when nothing is selected', () => {
    expect(traceSignalPath(edges, null).size).toBe(0)
  })

  it('terminates safely when the graph contains a cycle', () => {
    expect([...traceSignalPath([edge('a', 'b'), edge('b', 'a')], 'a')].sort()).toEqual(['a', 'b'])
  })
})
