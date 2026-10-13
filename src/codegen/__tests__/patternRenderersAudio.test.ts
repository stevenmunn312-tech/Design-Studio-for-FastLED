import { describe, expect, it } from 'vitest'
import { buildPatternRenderers } from '../showGenerator'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}, outputs: { id: string; dataType: string }[] = []): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: id, nodeType, category, properties: props, inputs: [], outputs },
  } as unknown as StudioNode
}
function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

const chain = (extra: StudioNode[] = []) => ({
  nodes: [node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 }), ...extra, node('go', 'GroupOutput', 'output')],
  edges: [edge('e', 'sc', 'frame', 'go', 'frame')],
})

describe('buildPatternRenderers audio flags', () => {
  it('marks a pattern that listens, by analyzer or audio group input, and not one that does not', () => {
    const groups = {
      deaf: chain(),
      analyzer: chain([node('fft', 'FFTAnalyzer', 'audio', { gain: 1, smoothing: 0 })]),
      exposed: chain([node('gi', 'GroupInput', 'composite', { paramId: 'param0' }, [{ id: 'out', dataType: 'audio' }])]),
    } as unknown as GroupRegistry
    const r = buildPatternRenderers(['deaf', 'analyzer', 'exposed'], groups)
    expect(r.audioReactive).toEqual([false, true, true])
  })

  it('answers false for a pattern the registry does not hold', () => {
    const r = buildPatternRenderers(['missing'], {} as GroupRegistry)
    expect(r.audioReactive).toEqual([false])
  })
})
