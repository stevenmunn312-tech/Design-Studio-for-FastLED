/*
 * A placed node wires itself to a partner only it could mean: a source to
 * the one open input of its kind, a consumer to the one source of its kind.
 * Anything that would need a choice, or would take an input from the source
 * already feeding it, is left for the user.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { autoConnectPlacedNode, useGraphStore, type StudioEdge, type StudioNode } from '../graphStore'
import { dropConnections } from '../dropAutoConnect'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'

function node(id: string, nodeType: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  if (!definition) throw new Error(`No ${nodeType} in the library`)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType) },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

describe('a placed source', () => {
  it('wires an audio source into the only audio input', () => {
    const nodes = [node('beat', 'BeatDetect'), node('mic', 'MicInput')]
    expect(dropConnections('mic', nodes, [])).toEqual([
      { source: 'mic', sourceHandle: 'audio', target: 'beat', targetHandle: 'audio' },
    ])
  })

  it('leaves the choice to the user when two inputs could take it', () => {
    const nodes = [node('beat', 'BeatDetect'), node('fft', 'FFTAnalyzer'), node('mic', 'MicInput')]
    expect(dropConnections('mic', nodes, [])).toEqual([])
  })

  it('never takes an input another source already feeds', () => {
    const nodes = [node('beat', 'BeatDetect'), node('line', 'LineInput'), node('mic', 'MicInput')]
    const wired = [edge('e1', 'line', 'audio', 'beat', 'audio')]
    expect(dropConnections('mic', nodes, wired)).toEqual([])
  })

  it('counts only the open inputs', () => {
    const nodes = [node('beat', 'BeatDetect'), node('fft', 'FFTAnalyzer'), node('line', 'LineInput'), node('mic', 'MicInput')]
    const wired = [edge('e1', 'line', 'audio', 'beat', 'audio')]
    expect(dropConnections('mic', nodes, wired).map((connection) => connection.target)).toEqual(['fft'])
  })

  it.each([
    ['TransitionSet', 'transitions', 'PatternMaster', 'transitions'],
    ['PatternCollection', 'patternset', 'PatternMaster', 'patternset'],
    ['PlayerParticles', 'particleFx', 'PatternMaster', 'particleFx'],
    ['MusicLibrary', 'music', 'PerformanceGenerator', 'music'],
    ['RTCInput', 'dateTime', 'ClockDisplay', 'dateTime'],
    ['DMXInput', 'dmx', 'DMXChannel', 'dmx'],
    ['Image', 'image', 'PaletteFromImage', 'image'],
  ])('wires a %s into the only matching input', (sourceType, sourceHandle, targetType, targetHandle) => {
    const nodes = [node('target', targetType), node('source', sourceType)]
    expect(dropConnections('source', nodes, [])).toEqual([
      { source: 'source', sourceHandle, target: 'target', targetHandle },
    ])
  })
})

describe('a placed consumer', () => {
  it('reaches back to the only source of each kind it takes', () => {
    const nodes = [
      node('mic', 'MicInput'), node('collection', 'PatternCollection'),
      node('pool', 'TransitionSet'), node('particles', 'PlayerParticles'), node('player', 'PatternMaster'),
    ]
    expect(dropConnections('player', nodes, [])).toEqual(expect.arrayContaining([
      { source: 'mic', sourceHandle: 'audio', target: 'player', targetHandle: 'audio' },
      { source: 'collection', sourceHandle: 'patternset', target: 'player', targetHandle: 'patternset' },
      { source: 'pool', sourceHandle: 'transitions', target: 'player', targetHandle: 'transitions' },
      { source: 'particles', sourceHandle: 'particleFx', target: 'player', targetHandle: 'particleFx' },
    ]))
    expect(dropConnections('player', nodes, [])).toHaveLength(4)
  })

  it('shares a source that already feeds something else', () => {
    const nodes = [node('dmx', 'DMXInput'), node('first', 'DMXChannel'), node('second', 'DMXChannel')]
    const wired = [edge('e1', 'dmx', 'dmx', 'first', 'dmx')]
    expect(dropConnections('second', nodes, wired)).toEqual([
      { source: 'dmx', sourceHandle: 'dmx', target: 'second', targetHandle: 'dmx' },
    ])
  })

  it('leaves the choice to the user when two sources could feed it', () => {
    const nodes = [node('mic', 'MicInput'), node('line', 'LineInput'), node('beat', 'BeatDetect')]
    expect(dropConnections('beat', nodes, [])).toEqual([])
  })

  it('ignores every other kind of port', () => {
    const nodes = [node('noise', 'Noise'), node('blur', 'Blur2D')]
    expect(dropConnections('blur', nodes, [])).toEqual([])
  })
})

describe('autoConnectPlacedNode', () => {
  beforeEach(() => useGraphStore.getState().loadGraph([node('player', 'PatternMaster')], []))

  it('draws the wire for a node just added to the canvas', () => {
    useGraphStore.getState().addNode(node('pool', 'TransitionSet'))
    expect(autoConnectPlacedNode('pool')).toBe(1)
    expect(useGraphStore.getState().edges).toEqual([
      expect.objectContaining({ source: 'pool', sourceHandle: 'transitions', target: 'player', targetHandle: 'transitions' }),
    ])
  })
})
