import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { graphConsumesAudio } from '../previewAudioUsage'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: def?.category ?? 'composite',
      properties: props,
      inputs: def?.inputs ?? [],
      outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

describe('graphConsumesAudio', () => {
  it('returns true when a wired FFT contributes to the matrix output', () => {
    expect(graphConsumesAudio(
      [
        node('mic', 'MicInput'),
        node('fft', 'FFTAnalyzer'),
        node('bars', 'SpectrumBars'),
        node('out', 'MatrixOutput'),
      ],
      [
        edge('e1', 'mic', 'audio', 'fft', 'audio'),
        edge('e2', 'fft', 'bass', 'bars', 'bass'),
        edge('e3', 'bars', 'frame', 'out', 'frame'),
      ],
    )).toBe(true)
  })

  it('returns false when the FFT is disconnected from the mic', () => {
    expect(graphConsumesAudio(
      [
        node('mic', 'MicInput'),
        node('fft', 'FFTAnalyzer'),
        node('bars', 'SpectrumBars'),
        node('out', 'MatrixOutput'),
      ],
      [
        edge('e2', 'fft', 'bass', 'bars', 'bass'),
        edge('e3', 'bars', 'frame', 'out', 'frame'),
      ],
    )).toBe(false)
  })

  it('returns true when a Spectrum Visualizer consumes wired audio', () => {
    expect(graphConsumesAudio(
      [node('mic', 'MicInput'), node('spectrum', 'SpectrumVisualizer'), node('out', 'MatrixOutput')],
      [
        edge('e1', 'mic', 'audio', 'spectrum', 'audio'),
        edge('e2', 'spectrum', 'frame', 'out', 'frame'),
      ],
    )).toBe(true)
  })

  it('returns true for a contributing group with a wired audio input', () => {
    const group = node('grp', 'Group', { groupId: 'g' })
    ;(group.data as unknown as { inputs: Array<{ id: string; dataType: string }> }).inputs = [
      { id: 'param0', dataType: 'audio' },
    ]
    expect(graphConsumesAudio(
      [node('mic', 'MicInput'), group, node('out', 'MatrixOutput')],
      [
        edge('e1', 'mic', 'audio', 'grp', 'param0'),
        edge('e2', 'grp', 'frame', 'out', 'frame'),
      ],
    )).toBe(true)
  })

  it('returns true when a Show Engine consumes directly wired audio', () => {
    expect(graphConsumesAudio(
      [
        node('mic', 'MicInput'),
        node('pc', 'PatternCollection'),
        node('pm', 'PatternMaster'),
        node('out', 'MatrixOutput'),
      ],
      [
        edge('e1', 'mic', 'audio', 'pm', 'audio'),
        edge('e2', 'pc', 'patternset', 'pm', 'patternset'),
        edge('e4', 'pm', 'frame', 'out', 'frame'),
      ],
    )).toBe(true)
  })
})
