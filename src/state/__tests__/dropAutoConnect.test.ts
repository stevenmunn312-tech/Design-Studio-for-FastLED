/*
 * A source dropped onto a graph with exactly one open input of its kind wires
 * itself; anything that would need a choice, or would take an input from the
 * source already feeding it, is left for the user.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { autoConnectPlacedNode, useGraphStore, type StudioEdge, type StudioNode } from '../graphStore'
import { soleDropConnection } from '../dropAutoConnect'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'

function node(id: string, nodeType: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType) },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

describe('soleDropConnection', () => {
  it('wires an audio source into the only audio input', () => {
    const nodes = [node('beat', 'BeatDetect'), node('mic', 'MicInput')]
    expect(soleDropConnection('mic', nodes, [])).toEqual({
      source: 'mic', sourceHandle: 'audio', target: 'beat', targetHandle: 'audio',
    })
  })

  it('leaves the choice to the user when two inputs could take it', () => {
    const nodes = [node('beat', 'BeatDetect'), node('fft', 'FFTAnalyzer'), node('mic', 'MicInput')]
    expect(soleDropConnection('mic', nodes, [])).toBeNull()
  })

  it('never takes an input another source already feeds', () => {
    const nodes = [node('beat', 'BeatDetect'), node('line', 'LineInput'), node('mic', 'MicInput')]
    const wired = [edge('e1', 'line', 'audio', 'beat', 'audio')]
    expect(soleDropConnection('mic', nodes, wired)).toBeNull()
  })

  it('counts only the open inputs', () => {
    const nodes = [node('beat', 'BeatDetect'), node('fft', 'FFTAnalyzer'), node('line', 'LineInput'), node('mic', 'MicInput')]
    const wired = [edge('e1', 'line', 'audio', 'beat', 'audio')]
    expect(soleDropConnection('mic', nodes, wired)?.target).toBe('fft')
  })

  it.each([
    ['TransitionSet', 'transitions', 'PatternMaster', 'transitions'],
    ['PatternCollection', 'patternset', 'PatternMaster', 'patternset'],
    ['PlayerParticles', 'particleFx', 'PatternMaster', 'particleFx'],
    ['MusicLibrary', 'music', 'PerformanceGenerator', 'music'],
  ])('wires a %s into the only matching input', (sourceType, sourceHandle, targetType, targetHandle) => {
    const nodes = [node('target', targetType), node('source', sourceType)]
    expect(soleDropConnection('source', nodes, [])).toEqual({
      source: 'source', sourceHandle, target: 'target', targetHandle,
    })
  })

  it('does nothing for a node that is not one of these sources', () => {
    const nodes = [node('fft', 'FFTAnalyzer'), node('beat', 'BeatDetect')]
    expect(soleDropConnection('beat', nodes, [])).toBeNull()
  })
})

describe('autoConnectPlacedNode', () => {
  beforeEach(() => useGraphStore.getState().loadGraph([node('player', 'PatternMaster')], []))

  it('draws the wire for a node just added to the canvas', () => {
    useGraphStore.getState().addNode(node('pool', 'TransitionSet'))
    expect(autoConnectPlacedNode('pool')).toBe(true)
    expect(useGraphStore.getState().edges).toEqual([
      expect.objectContaining({ source: 'pool', sourceHandle: 'transitions', target: 'player', targetHandle: 'transitions' }),
    ])
  })
})
