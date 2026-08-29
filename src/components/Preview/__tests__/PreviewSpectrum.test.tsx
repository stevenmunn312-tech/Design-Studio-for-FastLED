import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioStore } from '../../../state/audioStore'
import { useDecoderAudioStore } from '../../../state/decoderAudioStore'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import PreviewSpectrum from '../PreviewSpectrum'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: definition?.category ?? 'hardware',
      properties,
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

describe('PreviewSpectrum source polling', () => {
  const clearRect = vi.fn()
  const gradient = { addColorStop: vi.fn() }
  const context = new Proxy({
    clearRect,
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D, {
    get(target, property) {
      const existing = Reflect.get(target, property)
      return existing ?? vi.fn()
    },
    set(target, property, value) {
      Reflect.set(target, property, value)
      return true
    },
  })

  beforeEach(() => {
    clearRect.mockClear()
    gradient.addColorStop.mockClear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 320, height: 100, top: 0, right: 320, bottom: 100, left: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    useAudioStore.setState({ active: false, micActive: false, previewSpectrum: Array(32).fill(0) })
    useDecoderAudioStore.setState({ active: false, previewSpectrum: Array(32).fill(0) })
  })

  it('polls and paints the selected decoder bus without subscribing the LED path', async () => {
    useAudioStore.setState({ active: true, previewSpectrum: Array(32).fill(0.05) })
    useDecoderAudioStore.setState({ active: true, previewSpectrum: Array(32).fill(0.75) })
    render(
      <PreviewSpectrum
        audioVisualizerLive={false}
        audioSourceKind="decoder"
        mode="bars"
      />,
    )

    await waitFor(() => {
      const calls = (context.createLinearGradient as ReturnType<typeof vi.fn>).mock.calls
      const heights = calls.slice(-32).map((args) => Number(args[3]) - Number(args[1]))
      expect(Math.max(...heights)).toBeGreaterThan(50)
    })
  })

  it('draws an active decoder spectrum even when graph reachability is false', () => {
    useDecoderAudioStore.setState({ active: true, previewSpectrum: Array(32).fill(0.8) })
    render(
      <PreviewSpectrum
        audioVisualizerLive={false}
        audioSourceKind="decoder"
        mode="bars"
      />,
    )

    const heights = (context.createLinearGradient as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => Number(args[3]) - Number(args[1]))
    expect(Math.max(...heights)).toBeGreaterThan(2)
  })

  it('leaves the same decoder frame available to LED graph evaluation', () => {
    useDecoderAudioStore.setState({
      active: true,
      detectorSpectrum: Array(32).fill(0.8),
      previewSpectrum: Array(32).fill(0.8),
      spectrum: Array(32).fill(0.8),
    })
    render(
      <PreviewSpectrum
        audioVisualizerLive={false}
        audioSourceKind="decoder"
        mode="bars"
      />,
    )
    const audio = node('audio', 'Audio', { sourceId: 'kind:decoder' })
    const visualizer = node('visualizer', 'SpectrumVisualizer', { smoothing: 0 })
    const output = node('output', 'MatrixOutput')
    const nodes = [
      audio,
      node('sd', 'SDCard'),
      node('amp', 'Amplifier'),
      node('player', 'PatternMaster'),
      visualizer,
      output,
    ]
    const edges = [
      edge('audio-spectrum', audio.id, 'audio', visualizer.id, 'audio'),
      edge('spectrum-output', visualizer.id, 'frame', output.id, 'frame'),
    ]

    const frame = evaluateGraphFull(nodes, edges, 0, 8, 8).frame
    expect(frame?.flat().some((pixel) => pixel.r + pixel.g + pixel.b > 0)).toBe(true)
  })
})
