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

import { captureSequence, frameToBytes, applyLoopBlend, gifScaleLimit, loopBlendFrames } from '../recordCapture'
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

describe('gifScaleLimit', () => {
  it('caps a 64x64 225-frame export at 256px to bound finalization memory', () => {
    expect(gifScaleLimit(64, 64, 225, 2048)).toBe(4)
  })

  it('leaves a normal 16x16 clip above the default 12px scale', () => {
    expect(gifScaleLimit(16, 16, 225, 2048)).toBeGreaterThanOrEqual(12)
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

  it('sizes frames from the route, so a 1-row strip has no phantom second row', async () => {
    const { nodes, edges } = solidGraph(255, 255, 255, { width: 10, height: 1 })
    const frames = await captureSequence({
      nodes, edges, groups: {}, trusted: true,
      gridW: 10, gridH: 1, fps: 10, durationSec: 0.2, seamlessLoop: false,
    })

    // 10 LEDs × 3 bytes — not 20 with a black row appended.
    expect(frames![0]).toHaveLength(10 * 3)
    expect([...frames![0]].every((v) => v > 0)).toBe(true)
  })

  it('renders at the requested grid when there is no output route, not the hardcoded 16x16 fallback', async () => {
    // Hardware-agnostic shared pattern: a GroupOutput terminal, no MatrixOutput
    // anywhere, so outputRoutes(nodes) is empty and there's nothing to size
    // the composition against except the caller's own gridW/gridH.
    const nodes = [
      node('solid', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
      node('out', 'GroupOutput', 'output'),
    ]
    const edges = [edge('e1', 'solid', 'frame', 'out', 'frame')]
    const frames = await captureSequence({
      nodes, edges, groups: {}, trusted: true,
      gridW: 32, gridH: 32, fps: 10, durationSec: 0.2, seamlessLoop: false,
    })

    // 32x32 fully lit — not a 16x16 pattern in the corner of an otherwise
    // black 32x32 frame (1024 * 3 bytes, every one of them lit).
    expect(frames![0]).toHaveLength(32 * 32 * 3)
    expect([...frames![0]].every((v) => v > 0)).toBe(true)
  })

  it('drives audio-reactive nodes from the recorded timeline, not the frozen live store', async () => {
    // The mock store is silent, so any reaction can only come from the timeline.
    const nodes = [
      node('fft', 'FFTAnalyzer', 'audio'),
      node('mic', 'MicInput', 'input'),
      node('bars', 'SpectrumBars', 'pattern'),
      node('out', 'MatrixOutput', 'output', { width: 8, height: 8, brightness: 255 }),
    ]
    const edges = [
      edge('e1', 'mic', 'audio', 'fft', 'audio'),
      edge('e2', 'fft', 'bass', 'bars', 'bass'),
      edge('e3', 'fft', 'mids', 'bars', 'mids'),
      edge('e4', 'fft', 'treble', 'bars', 'treble'),
      edge('e5', 'bars', 'frame', 'out', 'frame'),
    ]
    const audioFrame = (level: number) => ({
      active: true, micActive: true, beat: false, bpm: 120,
      bass: level, mids: level, treble: level,
      micBass: level, micMids: level, micTreble: level,
      spectrum: Array(32).fill(level), detectorSpectrum: Array(32).fill(level),
      implicitConnection: false as const,
    })

    const frames = await captureSequence({
      nodes, edges, groups: {}, trusted: true,
      gridW: 8, gridH: 8, fps: 10, durationSec: 0.2, seamlessLoop: false,
      audioTimeline: [audioFrame(0), audioFrame(1)],
    })

    const lit = (frame: Uint8ClampedArray) => [...frame].reduce((sum, v) => sum + v, 0)
    // Silence renders nothing; full level renders bars. A frozen live store
    // would have produced two identical (dark) frames.
    expect(lit(frames![0])).toBe(0)
    expect(lit(frames![1])).toBeGreaterThan(0)
  })

  it('discards warm-up frames but leaves the clip starting on a whole frame', async () => {
    const { nodes, edges } = solidGraph(255, 0, 0)
    const seen: number[] = []
    const frames = await captureSequence({
      nodes, edges, groups: {}, trusted: true,
      gridW: 8, gridH: 8, fps: 10, durationSec: 0.5, seamlessLoop: false,
      warmupSec: 0.3,
      onProgress: (done, total) => { seen.push(done); expect(total).toBe(8) },
    })

    // 3 warm-up + 5 recorded frames rendered; only the 5 are returned.
    expect(seen).toHaveLength(8)
    expect(frames).toHaveLength(5)
  })
})
