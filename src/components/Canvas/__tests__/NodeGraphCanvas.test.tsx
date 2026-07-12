import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import NodeGraphCanvas from '../NodeGraphCanvas'
import { useGraphStore } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'

const fitViewMock = vi.fn().mockResolvedValue(undefined)
const screenToFlowPositionMock = ({ x, y }: { x: number; y: number }) => ({ x, y })
const flowToScreenPositionMock = ({ x, y }: { x: number; y: number }) => ({ x, y })
const getNodeMock = () => undefined
const getInternalNodeMock = () => undefined
const setCenterMock = vi.fn()
const getZoomMock = () => 1

vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    ReactFlow: ({ children }: { children: ReactNode }) => <div data-testid="react-flow">{children}</div>,
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

describe('NodeGraphCanvas start screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    })
  })

  it('launches the rainbow starter from the empty-canvas start screen', async () => {
    const { getByRole } = render(<NodeGraphCanvas />)

    fireEvent.click(getByRole('button', { name: 'Start with Rainbow' }))

    await waitFor(() => {
      expect(useGraphStore.getState().nodes).toHaveLength(2)
    })
    expect(useUiStore.getState().lastStartChoice).toBe('rainbow')
    expect(useUiStore.getState().fitViewRequest.nodeIds).toHaveLength(2)
    await waitFor(() => {
      expect(fitViewMock).toHaveBeenCalled()
    })
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
})
