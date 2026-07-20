import { describe, it, expect, vi } from 'vitest'

const mockAudio = vi.hoisted(() => ({
  active: false,
  nativeFastLed: false,
  micActive: false,
  bass: 0,
  mids: 0,
  treble: 0,
  micBass: 0,
  micMids: 0,
  micTreble: 0,
  beat: false,
  bpm: 120,
  spectrum: Array(32).fill(0),
  detectorSpectrum: Array(32).fill(0),
}))

vi.mock('../../../state/audioStore', () => ({
  useAudioStore: {
    getState: () => mockAudio,
  },
}))

import { captureSequence, frameToBytes, applyLoopBlend, loopBlendFrames } from '../recordCapture'
import type { Frame } from '../../../state/graphEvaluator'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../../state/graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category, properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

function solidGraph(r: number, g: number, b: number, outputProps: Record<string, unknown> = {}) {
  return {
    nodes: [
      node('solid', 'SolidColor', 'pattern', { r, g, b }),
      node('out', 'MatrixOutput', 'output', { width: 8, height: 8, ...outputProps }),
    ],
    edges: [edge('e1', 'solid', 'frame', 'out', 'frame')],
  }
}

const bytesFrame = (w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray => {
  const bytes = new Uint8ClampedArray(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    bytes[i * 3] = r; bytes[i * 3 + 1] = g; bytes[i * 3 + 2] = b
  }
  return bytes
}

describe('frameToBytes', () => {
  const px = (r: number, g: number, b: number) => ({ r, g, b })

  it('packs RGB with the master brightness applied', () => {
    const frame: Frame = [[px(255, 100, 0), px(0, 0, 255)]]
    const bytes = frameToBytes(frame, 1, 0.5, 2, 1)
    expect([...bytes]).toEqual([128, 50, 0, 0, 0, 128])
  })

  it('averages supersampled blocks down to one pixel', () => {
    const frame: Frame = [
      [px(255, 0, 0), px(0, 0, 0)],
      [px(0, 0, 0), px(255, 0, 0)],
    ]
    const bytes = frameToBytes(frame, 2, 1, 1, 1)
    expect([...bytes]).toEqual([128, 0, 0])
  })
})

describe('applyLoopBlend', () => {
  it('leans on the continuation at the wrap and returns to the original by the window end', () => {
    // 4 result frames + 2 blend frames, 1 pixel each, encoding a ramp 0..5.
    const raw = [0, 1, 2, 3, 4, 5].map((v) => Uint8ClampedArray.from([v * 40, 0, 0]))
    const out = applyLoopBlend(raw, 4, 2)

    expect(out).toHaveLength(4)
    // i=0: w=1/2 → midway between raw[4] (160) and raw[0] (0) = 80.
    expect(out[0][0]).toBe(80)
    // i=1: w=1 → exactly the original frame, continuous with out[2].
    expect(out[1][0]).toBe(40)
    // Untouched steady-state frames.
    expect(out[2][0]).toBe(80)
    expect(out[3][0]).toBe(120)
  })

  it('spans at most a third of the clip', () => {
    expect(loopBlendFrames(30, 30)).toBe(10)
    expect(loopBlendFrames(300, 30)).toBe(45)
    expect(loopBlendFrames(1, 30)).toBe(0)
  })
})

describe('captureSequence', () => {
  it('renders a deterministic solid-colour clip with default master brightness', async () => {
    const { nodes, edges } = solidGraph(255, 0, 128)
    const frames = await captureSequence({
      nodes, edges, groups: {}, trusted: true,
      gridW: 8, gridH: 8, fps: 10, durationSec: 0.5, seamlessLoop: false,
    })

    expect(frames).toHaveLength(5)
    // Default MatrixOutput brightness is 200 → scale 200/255.
    const expected = bytesFrame(8, 8, Math.round(255 * 200 / 255), 0, Math.round(128 * 200 / 255))
    for (const frame of frames!) expect([...frame]).toEqual([...expected])
  })

  it('reports progress and honours cancellation', async () => {
    const { nodes, edges } = solidGraph(10, 20, 30)
    const seen: number[] = []
    const frames = await captureSequence({
      nodes, edges, groups: {}, trusted: true,
      gridW: 8, gridH: 8, fps: 10, durationSec: 1, seamlessLoop: false,
      onProgress: (done) => seen.push(done),
      isCancelled: () => seen.length >= 3,
    })

    expect(frames).toBeNull()
    expect(seen.length).toBe(3)
  })

  it('falls back to the idle shimmer when the graph has no terminal frame', async () => {
    const frames = await captureSequence({
      nodes: [], edges: [], groups: {}, trusted: true,
      gridW: 8, gridH: 8, fps: 10, durationSec: 0.2, seamlessLoop: false,
    })
    expect(frames).toHaveLength(2)
    // The idle animation is never fully black.
    expect(frames![0].some((v) => v > 0)).toBe(true)
  })
})
