import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import NodeGraphCanvas from '../NodeGraphCanvas'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useAudioStore } from '../../../state/audioStore'

const fitViewMock = vi.fn().mockResolvedValue(undefined)
const screenToFlowPositionMock = ({ x, y }: { x: number; y: number }) => ({ x, y })
const flowToScreenPositionMock = ({ x, y }: { x: number; y: number }) => ({ x, y })
const getNodeMock = vi.fn()
const getInternalNodeMock = () => undefined
const setCenterMock = vi.fn()
const getZoomMock = () => 1
const startAudioMock = vi.fn(async () => {})
const { runTidyMock } = vi.hoisted(() => ({ runTidyMock: vi.fn() }))
let reactFlowProps: Record<string, unknown> = {}

vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    ReactFlow: (props: { children: ReactNode }) => {
      reactFlowProps = props as unknown as Record<string, unknown>
      return <div data-testid="react-flow">{props.children}</div>
    },
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useReactFlow: () => ({
      screenToFlowPosition: screenToFlowPositionMock,
      flowToScreenPosition: flowToScreenPositionMock,
      getNode: getNodeMock,
      getInternalNode: getInternalNodeMock,
      setCenter: setCenterMock,
      getZoom: getZoomMock,
      fitView: fitViewMock,
    }),
  }
})

vi.mock('../StudioNode', () => ({ default: () => null }))
vi.mock('../GlowEdge', () => ({ default: () => null }))
vi.mock('../GroupControls', () => ({ default: () => null }))
vi.mock('../NodeContextMenu', () => ({ default: () => null }))
vi.mock('../CanvasContextMenu', () => ({ default: () => null }))
vi.mock('../../../audio/interactionSfx', () => ({
  playNoodleConnectSfx: vi.fn(),
  playNoodleDisconnectSfx: vi.fn(),
}))
vi.mock('../../../utils/tidyGraph', () => ({ runTidy: runTidyMock }))

describe('NodeGraphCanvas start screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNodeMock.mockReturnValue(undefined)
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: vi.fn(() => []) })
    reactFlowProps = {}
    localStorage.clear()
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.temporal.getState().clear()
    useUiStore.setState({
      sidebarOpen: false,
      previewPanelOpen: false,
      uiEffectsEnabled: false,
      reducedMotion: false,
      templatesOpen: false,
      lastStartChoice: null,
      fitViewRequest: { nonce: 0 },
      statusText: 'Ready',
      statusLevel: 'idle',
      testSignal: false,
    })
    startAudioMock.mockClear()
    useAudioStore.setState({ startAudio: startAudioMock })
  })

  it('launches the rainbow starter from the empty-canvas start screen', async () => {
    const { getByRole } = render(<NodeGraphCanvas />)

    fireEvent.click(getByRole('button', { name: 'Start with Rainbow' }))

    await waitFor(() => {
      expect(useGraphStore.getState().nodes).toHaveLength(3)
    })
    expect(useUiStore.getState().lastStartChoice).toBe('rainbow')
    expect(useUiStore.getState().fitViewRequest.nodeIds).toHaveLength(3)
    expect(useGraphStore.getState().nodes.some((node) => node.data.nodeType === 'Comment')).toBe(true)
    await waitFor(() => {
      expect(fitViewMock).toHaveBeenCalled()
    })
  })

  it('launches the audio first patch with its tutorial and live microphone', async () => {
    useUiStore.setState({ testSignal: true })
    localStorage.setItem('design-studio-for-fastled-test-signal', 'true')
    const { getByRole } = render(<NodeGraphCanvas />)

    fireEvent.click(getByRole('button', { name: 'Audio-reactive demo' }))

    await waitFor(() => expect(startAudioMock).toHaveBeenCalledOnce())
    expect(useGraphStore.getState().nodes.map((node) => node.data.nodeType)).toEqual(
      expect.arrayContaining(['MicInput', 'SpectrumVisualizer', 'MatrixOutput', 'Comment']),
    )
    expect(useUiStore.getState().testSignal).toBe(false)
    expect(localStorage.getItem('design-studio-for-fastled-test-signal')).toBe('false')
  })

  it('fits nodes inside both open side panels', async () => {
    render(<NodeGraphCanvas />)

    useUiStore.setState({
      sidebarOpen: true,
      previewPanelOpen: true,
      fitViewRequest: { nonce: 1 },
    })

    await waitFor(() => {
      expect(fitViewMock).toHaveBeenCalledWith(expect.objectContaining({
        padding: {
          top: '32px',
          right: '528px',
          bottom: '32px',
          left: '312px',
        },
      }))
    })

    expect(reactFlowProps.fitViewOptions).toEqual(expect.objectContaining({
      padding: {
        top: '32px',
        right: '528px',
        bottom: '32px',
        left: '312px',
      },
    }))
  })

  it('opens the starter gallery and remembers blank-canvas preference', async () => {
    const { getByRole } = render(<NodeGraphCanvas />)

    fireEvent.click(getByRole('button', { name: 'Browse starter patches' }))
    expect(useUiStore.getState().templatesOpen).toBe(true)

    fireEvent.click(getByRole('button', { name: 'Blank canvas' }))

    await waitFor(() => {
      expect(useUiStore.getState().lastStartChoice).toBe('blank')
    })
    expect(useGraphStore.getState().nodes).toEqual([])
  })

  it('unplugs a connected Field Noise speed input when its input handle is dragged to empty canvas', () => {
    useGraphStore.getState().loadGraph([
      {
        id: 'src',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: {
          nodeType: 'Counter',
          label: 'Counter',
          category: 'signal',
          properties: { rate: 1 },
          inputs: [],
          outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
        },
      },
      {
        id: 'field',
        type: 'studioNode',
        position: { x: 260, y: 0 },
        data: {
          nodeType: 'FieldNoise',
          label: 'Field Noise',
          category: 'field',
          properties: { speed: 0.25, scale: 0.3, octaves: 4 },
          inputs: [
            { id: 'speed', label: 'Speed', dataType: 'float' },
            { id: 'scale', label: 'Scale', dataType: 'float' },
          ],
          outputs: [{ id: 'field', label: 'Field', dataType: 'field' }],
        },
      },
    ], [
      {
        id: 'e-speed',
        source: 'src',
        sourceHandle: 'value',
        target: 'field',
        targetHandle: 'speed',
        type: 'glowEdge',
        reconnectable: 'target',
      },
    ])

    render(<NodeGraphCanvas />)

    const onConnectStart = reactFlowProps.onConnectStart as (event: unknown, params: { nodeId: string; handleId: string; handleType: string }) => void
    const onConnectEnd = reactFlowProps.onConnectEnd as (event: MouseEvent, state: { toHandle: null }) => void
    onConnectStart({}, { nodeId: 'field', handleId: 'speed', handleType: 'target' })
    onConnectEnd(new MouseEvent('mouseup', { clientX: 10, clientY: 10 }), { toHandle: null })

    expect(useGraphStore.getState().edges).toEqual([])
    expect(useUiStore.getState().statusText).toBe('Noodle unplugged')
  })

  it('tidies after an existing loose node is spliced into a connection', () => {
    useGraphStore.getState().loadGraph([
      {
        id: 'source', type: 'studioNode', position: { x: 0, y: 0 },
        data: {
          nodeType: 'SolidColor', label: 'Solid Color', category: 'pattern', properties: {}, inputs: [],
          outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
        },
      },
      {
        id: 'invert', type: 'studioNode', position: { x: 300, y: 0 },
        data: {
          nodeType: 'Invert', label: 'Invert', category: 'composite', properties: {},
          inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
          outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
        },
      },
      {
        id: 'output', type: 'studioNode', position: { x: 600, y: 0 },
        data: {
          nodeType: 'MatrixOutput', label: 'Matrix Output', category: 'output', properties: {},
          inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }], outputs: [],
        },
      },
    ], [{
      id: 'edge', source: 'source', sourceHandle: 'frame', target: 'output', targetHandle: 'frame',
      type: 'glowEdge',
    }])
    getNodeMock.mockImplementation((id: string) => useGraphStore.getState().nodes.find((node) => node.id === id))

    render(<NodeGraphCanvas />)

    const onNodeDragStop = reactFlowProps.onNodeDragStop as (event: unknown, node: ReturnType<typeof getNodeMock>) => void
    onNodeDragStop({}, useGraphStore.getState().nodes.find((node) => node.id === 'invert'))

    expect(useGraphStore.getState().edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'source', target: 'invert' }),
      expect.objectContaining({ source: 'invert', target: 'output' }),
    ]))
    expect(runTidyMock).toHaveBeenCalledOnce()
  })
})
