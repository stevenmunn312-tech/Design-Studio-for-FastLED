import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import {
  buildGraphDiagnostics,
  findOutputRuntimeIssues,
  selectedGenerator,
} from '../../utils/validateGraph'
import type { StudioEdge, StudioNode } from '../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, label?: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: label ?? nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th }) as StudioEdge

describe('fixture versus show dimming', () => {
  it('dims one slideshow fixture without treating the dimmer as show-wide', () => {
    const nodes = [
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      node('show', 'PatternSlideshow'),
      node('out', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 27 }, 'Wash'),
      node('outB', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 26 }, 'House'),
      node('dim', 'PotInput', { pin: 5 }, 'Wash Dimmer'),
    ]
    const edges = [
      edge('set', 'collection', 'patternset', 'show', 'patternset'),
      edge('frame', 'show', 'frame', 'out', 'frame'),
      edge('frameB', 'show', 'frame', 'outB', 'frame'),
      edge('dim', 'dim', 'value', 'out', 'brightness'),
    ]
    expect(selectedGenerator(nodes, edges)).toBe('show')
    expect(findOutputRuntimeIssues(nodes, edges).errors).toEqual([])
    const blocking = buildGraphDiagnostics(nodes, edges).filter((entry) => entry.severity === 'error')
    expect(blocking.map((entry) => entry.title)).toEqual([])
  })

  it('refuses a music-player fixture dimmer and names Control Map instead', () => {
    const nodes = [
      node('master', 'PatternMaster'),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      node('out', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 27, outputBrightness: 0.4 }, 'Wash'),
      node('outB', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 26 }, 'House'),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier'),
    ]
    const edges = [
      edge('set', 'collection', 'patternset', 'master', 'patternset'),
      edge('frame', 'master', 'frame', 'out', 'frame'),
      edge('frameB', 'master', 'frame', 'outB', 'frame'),
    ]
    expect(selectedGenerator(nodes, edges)).toBe('player')
    const { errors } = findOutputRuntimeIssues(nodes, edges)
    expect(errors.join(' ')).toContain('cannot read an LED output')
    expect(errors.join(' ')).toContain('Control Map')
  })
})
