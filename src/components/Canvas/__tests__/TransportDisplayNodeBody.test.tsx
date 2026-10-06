import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import TransportDisplayNodeBody from '../TransportDisplayNodeBody'
import { NODE_LIBRARY, tftControllerForProps } from '../../../state/nodeLibrary'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { usePreviewStore } from '../../../state/previewStore'
import { useTransportDisplayTouchStore } from '../../../state/transportDisplayTouchStore'
import { addDisplayWidget, createDisplayDocument } from '../../../state/displayEditor'
import { useDisplayRuntimeStore } from '../../../state/displayRuntimeStore'
import { useUiStore } from '../../../state/uiStore'
import { createTftSurfaceFor } from '../../../state/tftSurface'
import { blankSurfaceUrl } from '../../Preview/useSurfacePicture'

if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}

function display(properties: Record<string, unknown>): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
  return {
    id: 'tft', type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType: def.type, category: def.category,
      properties, inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

describe('TransportDisplayNodeBody', () => {
  beforeEach(() => {
    usePreviewStore.getState().clear()
    useTransportDisplayTouchStore.getState().clear()
    useDisplayRuntimeStore.getState().resetDisplayRuntime()
  })

  it('keeps the exact mounted panel aspect ratio before the first preview frame', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90', tftLayout: 'Custom design' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    const panel = screen.getByRole('img', { name: 'Transport display preview, 320 by 240 pixels' })
    expect(panel.getAttribute('width')).toBe('320')
    expect(panel.getAttribute('height')).toBe('240')
  })

  it('uses the square module native ratio at rotation zero', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789-tft-240x240', tftRotation: '0' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    expect(screen.getByRole('img', { name: 'Transport display preview, 240 by 240 pixels' })).toBeTruthy()
  })

  it('shows the panel dark once its surface goes away', () => {
    // A panel switched off by Enabled evaluates to no surface. The preview once
    // kept its last lit frame, showing a clock while the glass was dark — the
    // preview contradicting the firmware on the one signal whose entire
    // meaning is whether the panel is lit.
    vi.useFakeTimers()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,LIT')
    try {
      const properties = { partId: 'st7789-tft-240x240', tftRotation: '0' }
      useGraphStore.setState({ nodes: [display(properties)], edges: [], activeGraphId: ROOT_GRAPH_ID } as never)
      const surface = createTftSurfaceFor(tftControllerForProps(properties)!, '0')
      usePreviewStore.getState().setOutputs(new Map([['tft', { lit: true, surface }]]))
      render(<TransportDisplayNodeBody nodeId="tft" />)
      const panel = screen.getByRole('img', { name: 'Transport display preview, 240 by 240 pixels' })
      expect(panel.getAttribute('src')).toBe('data:image/png;base64,LIT')
      // Not a live canvas: a visible one leaks renderer memory every frame.
      expect(panel.tagName).toBe('IMG')

      act(() => {
        usePreviewStore.getState().setOutputs(new Map([['tft', { lit: false, surface: null }]]))
        vi.advanceTimersByTime(200)
      })
      expect(panel.getAttribute('src')).toBe(blankSurfaceUrl(240, 240))
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it('maps pointer positions into mounted pixels for a touch module', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    const panel = screen.getByRole('img', { name: 'Transport display preview, 240 by 320 pixels' })
    panel.getBoundingClientRect = () => ({
      x: 10, y: 20, left: 10, top: 20, right: 130, bottom: 180,
      width: 120, height: 160, toJSON: () => ({}),
    })

    fireEvent.pointerDown(panel, { pointerId: 1, clientX: 70, clientY: 100 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')).toEqual({
      pressed: true, x: 120, y: 160,
    })
    act(() => usePreviewStore.getState().setOutputs(new Map([['tft', { lit: false }]])))
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(false)
    fireEvent.pointerDown(panel, { pointerId: 2, clientX: 70, clientY: 100 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(false)
    act(() => usePreviewStore.getState().setOutputs(new Map([['tft', { lit: true }]])))
    fireEvent.pointerDown(panel, { pointerId: 3, clientX: 70, clientY: 100 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(true)
    fireEvent.pointerUp(panel, { pointerId: 1 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(false)
  })

  it('shows the missing-document notice instead of the panel picture when a design is wired', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: 'Custom design', displayId: 'missing' })],
      edges: [],
      activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    expect(screen.getByRole('img', { name: 'Driven by a wired Screen Design' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Transport display preview/ })).toBeNull()
  })

  it.each([true, false])('renders its own screen design with saved Enabled=%s and follows live values', (enabled) => {
    const document = addDisplayWidget(createDisplayDocument('panel', 320, 240), 'Text')
    useGraphStore.setState({
      nodes: [display({
        partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90', enabled, tftLayout: 'Custom design', displayId: 'panel',
      })],
      edges: [],
      displayDocuments: { panel: document },
      activeGraphId: ROOT_GRAPH_ID,
    } as never)

    render(<TransportDisplayNodeBody nodeId="tft" />)
    expect(screen.getByRole('img', { name: `${enabled ? 'Live' : 'Disabled'} custom display preview, 320 by 240 pixels` })).toBeTruthy()
    if (!enabled) expect(screen.queryByText('Text')).toBeNull()
    // A live wire can light a panel whose saved property is false.
    act(() => usePreviewStore.getState().setOutputs(new Map([['tft', { lit: true }]])))
    expect(screen.getByRole('img', { name: 'Live custom display preview, 320 by 240 pixels' })).toBeTruthy()
    expect(screen.getByText('Text')).toBeTruthy()

    act(() => useDisplayRuntimeStore.getState().publishDisplayRoleValue('panel', 'text', 'value', 'MIDNIGHT DRIVE'))
    expect(screen.getByText('MIDNIGHT DRIVE')).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Transport display preview/ })).toBeNull()

    // A wired Enabled value is published on the physical panel, separately
    // from the document's live roles. Off must hide the whole themed surface.
    act(() => usePreviewStore.getState().setOutputs(new Map([['tft', { lit: false }]])))
    const dark = screen.getByRole('img', { name: 'Disabled custom display preview, 320 by 240 pixels' })
    expect(dark.childElementCount).toBe(0)
    expect(screen.queryByText('MIDNIGHT DRIVE')).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit screen design' }).hasAttribute('disabled')).toBe(false)

    act(() => useDisplayRuntimeStore.getState().publishDisplayRoleValue('panel', 'text', 'value', 'NEXT TRACK'))
    act(() => usePreviewStore.getState().setOutputs(new Map([['tft', { lit: true }]])))
    expect(screen.getByRole('img', { name: 'Live custom display preview, 320 by 240 pixels' })).toBeTruthy()
    expect(screen.getByText('NEXT TRACK')).toBeTruthy()
  })

  it('creates a screen design already sized to the panel it is made from', () => {
    // The panel is the only thing that knows the size, and it keeps the design
    // it makes: nothing appears on the canvas and nothing is wired, because the
    // screen belongs to this glass.
    useGraphStore.getState().loadGraph([display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90', tftLayout: 'Custom design' })], [])
    useUiStore.setState({ designWorkspaceView: { kind: 'graph' } })

    render(<TransportDisplayNodeBody nodeId="tft" />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Create screen design' })) })

    const state = useGraphStore.getState()
    // No node minted and no cable drawn: the panel simply gained a screen.
    expect(state.edges).toHaveLength(0)
    expect(state.nodes.find((node) => node.id === 'tft')!.data.properties.displayId).toBe('tft')
    const document = state.displayDocuments.tft
    expect(document.designSize).toEqual({ width: 320, height: 240 })
    expect(document.orientation).toBe('90')
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'display', displayId: 'tft' })
  })

  it('undoes the whole design in one step', () => {
    vi.useFakeTimers()
    try {
      useGraphStore.getState().loadGraph([display({ partId: 'st7789-tft-240x240', tftRotation: '0', tftLayout: 'Custom design' })], [])
      // Loading does not clear the undo stack — callers do — and the push is
      // debounced, so let the load's own entry settle before clearing. Without
      // this the undo below steps back past the load into an empty workspace,
      // where every assertion passes for the wrong reason.
      act(() => { vi.advanceTimersByTime(400) })
      act(() => { useGraphStore.temporal.getState().clear() })
      render(<TransportDisplayNodeBody nodeId="tft" />)
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Create screen design' })) })
      act(() => { vi.advanceTimersByTime(400) })
      expect(useGraphStore.getState().displayDocuments.tft).toBeTruthy()

      act(() => { useGraphStore.temporal.getState().undo() })

      const state = useGraphStore.getState()
      // The panel is still there; only the screen it was given has gone.
      expect(state.nodes.find((node) => node.id === 'tft')!.data.properties.displayId).toBe('')
      expect(state.displayDocuments.tft).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })


  // The fixed wire used to be dropped because the design arrived on a second,
  // exclusive input. A design is not a wire any more, so the Display cable is
  // left alone — the design simply takes precedence over the layout it draws.
  it('leaves a fixed content wire alone, because a design is not a competing input', () => {
    const player = {
      id: 'player', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: 'Music Player', nodeType: 'PatternMaster', category: 'output', properties: {}, inputs: [], outputs: [] },
    } as unknown as StudioNode
    useGraphStore.getState().loadGraph(
      [player, display({ partId: 'st7789-tft-240x240', tftRotation: '0', tftLayout: 'Custom design' })],
      [{ id: 'fixed', source: 'player', sourceHandle: 'display', target: 'tft', targetHandle: 'display' } as never],
    )

    render(<TransportDisplayNodeBody nodeId="tft" />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Create screen design' })) })

    const edges = useGraphStore.getState().edges
    expect(edges).toHaveLength(1)
    expect(edges[0].targetHandle).toBe('display')
    expect(useGraphStore.getState().displayDocuments.tft).toBeTruthy()
  })

  /*
   * The Layout dropdown gates the design. On a fixed layout the button is
   * there, disabled, with the one step that enables it beside it — and a
   * design set aside keeps its document for when Custom design returns.
   */
  it('disables the design button on a fixed layout and says how to enable it', () => {
    act(() => {
      useGraphStore.setState({
        nodes: [display({ partId: 'st7789-tft-240x240', tftRotation: '0', tftLayout: 'Now Playing', displayId: 'panel' })],
        edges: [],
        displayDocuments: { panel: createDisplayDocument('panel', 240, 240) },
      })
    })
    const view = render(<TransportDisplayNodeBody nodeId="tft" />)
    expect((view.getByRole('button', { name: 'Edit screen design' }) as HTMLButtonElement).disabled).toBe(true)
    expect(view.getByText('Set Layout to Custom design to edit.')).toBeTruthy()
    expect(view.queryByRole('button', { name: 'Create screen design' })).toBeNull()
    expect(useGraphStore.getState().displayDocuments.panel).toBeDefined()
  })

  it('offers the design it already has for editing instead of a second one', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789-tft-240x240', tftRotation: '0', tftLayout: 'Custom design', displayId: 'panel' })],
      edges: [],
      displayDocuments: { panel: createDisplayDocument('panel', 240, 240) },
      activeGraphId: ROOT_GRAPH_ID,
    } as never)
    useUiStore.setState({ designWorkspaceView: { kind: 'graph' } })

    render(<TransportDisplayNodeBody nodeId="tft" />)
    expect(screen.queryByRole('button', { name: 'Create screen design' })).toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Edit screen design' })) })
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'display', displayId: 'panel' })
  })

  it('does not make the non-touch module interactive', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789-tft-240x240', tftRotation: '0' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    const panel = screen.getByRole('img', { name: 'Transport display preview, 240 by 240 pixels' })
    fireEvent.pointerDown(panel, { pointerId: 1, clientX: 20, clientY: 20 })
    expect(useTransportDisplayTouchStore.getState().touches.has('tft')).toBe(false)
  })
})
