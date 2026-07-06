import { describe, expect, it, vi } from 'vitest'
import { applyShowPlaybackSignal } from '../showPlaybackSignal'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import type { ShowFile } from '../../../types/showFile'

vi.mock('../../../state/audioStore', () => ({
  useAudioStore: { getState: () => ({ active: false, bass: 0, mids: 0, treble: 0, beat: false, bpm: 120, spectrum: Array(16).fill(0) }) },
}))

function node(id: string, nodeType: string): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: nodeType === 'MatrixOutput' ? 'output' : 'show',
      properties: {},
      inputs: nodeType === 'MatrixOutput' ? [{ id: 'frame', label: 'Frame', dataType: 'frame' }] : [],
      outputs: nodeType === 'PerformanceGenerator' ? [{ id: 'frame', label: 'Frame', dataType: 'frame' }] : [],
    },
  } as unknown as StudioNode
}

const litShow: ShowFile = {
  version: 1,
  songTitle: 'Lit',
  durationMs: 1000,
  bpm: 120,
  events: [
    { t: 0, cmd: 'SET_PATTERN', params: { name: 'SolidColor' } },
    { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
  ],
}

describe('applyShowPlaybackSignal', () => {
  it('publishes the live show frame back onto the generator output when wired to MatrixOutput', () => {
    const outputs = new Map<string, Record<string, unknown>>([
      ['pg', { frame: [[{ r: 0, g: 0, b: 0 }]] }],
    ])
    const nodes = [node('pg', 'PerformanceGenerator'), node('out', 'MatrixOutput')]
    const edges = [{ id: 'e1', source: 'pg', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }] as StudioEdge[]

    const frame = applyShowPlaybackSignal(
      [[{ r: 0, g: 0, b: 0 }]],
      outputs,
      nodes,
      edges,
      { nodeId: 'pg', show: litShow, posMs: 0, useGroupInputs: false },
      1,
      1,
      {},
    )

    const rendered = frame[0][0]
    const published = (outputs.get('pg')!.frame as { r: number; g: number; b: number }[][])[0][0]
    expect(rendered.r + rendered.g + rendered.b).toBeGreaterThan(0)
    expect(published.r + published.g + published.b).toBeGreaterThan(0)
  })

  it('leaves the original frame untouched when the generator is not wired to MatrixOutput', () => {
    const original = [[{ r: 1, g: 2, b: 3 }]]
    const outputs = new Map<string, Record<string, unknown>>([
      ['pg', { frame: original }],
    ])

    const frame = applyShowPlaybackSignal(
      original,
      outputs,
      [node('pg', 'PerformanceGenerator'), node('out', 'MatrixOutput')],
      [],
      { nodeId: 'pg', show: litShow, posMs: 0, useGroupInputs: false },
      1,
      1,
      {},
    )

    expect(frame).toBe(original)
    expect(outputs.get('pg')!.frame).toBe(original)
  })
})
