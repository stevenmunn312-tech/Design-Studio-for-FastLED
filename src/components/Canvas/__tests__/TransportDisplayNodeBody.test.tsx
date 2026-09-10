import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import TransportDisplayNodeBody from '../TransportDisplayNodeBody'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { usePreviewStore } from '../../../state/previewStore'
import { useTransportDisplayTouchStore } from '../../../state/transportDisplayTouchStore'
import { addDisplayWidget, createDisplayDocument } from '../../../state/displayEditor'
import { useDisplayRuntimeStore } from '../../../state/displayRuntimeStore'
import { useUiStore } from '../../../state/uiStore'

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
      nodes: [display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    const canvas = screen.getByRole('img', { name: 'Transport display preview, 320 by 240 pixels' })
    expect(canvas.getAttribute('width')).toBe('320')
    expect(canvas.getAttribute('height')).toBe('240')
  })

  it('uses the square module native ratio at rotation zero', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789-tft-240x240', tftRotation: '0' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    expect(screen.getByRole('img', { name: 'Transport display preview, 240 by 240 pixels' })).toBeTruthy()
  })

  it('paints the panel dark once its surface goes away', () => {
    // A panel switched off by Enabled evaluates to no surface. Skipping the
    // draw left the last lit frame on the canvas, so the preview kept showing a
    // clock while the glass was dark — the preview contradicting the firmware on
    // the one signal whose entire meaning is whether the panel is lit.
    const fills: string[] = []
    const rects: number[][] = []
    const context = {
      fillStyle: '',
      fillRect: (...args: number[]) => { fills.push(context.fillStyle); rects.push(args) },
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
    }
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => context) as never
    try {
      useGraphStore.setState({
        nodes: [display({ partId: 'st7789-tft-240x240', tftRotation: '0' })],
        edges: [], activeGraphId: ROOT_GRAPH_ID,
      } as never)
      render(<TransportDisplayNodeBody nodeId="tft" />)
      expect(fills).toEqual(['#000'])
      expect(rects).toEqual([[0, 0, 240, 240]])
    } finally {
      HTMLCanvasElement.prototype.getContext = original
    }
  })

  it('maps pointer positions into mounted pixels for a touch module', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    const canvas = screen.getByRole('img', { name: 'Transport display preview, 240 by 320 pixels' })
    canvas.getBoundingClientRect = () => ({
      x: 10, y: 20, left: 10, top: 20, right: 130, bottom: 180,
      width: 120, height: 160, toJSON: () => ({}),
    })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 70, clientY: 100 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')).toEqual({
      pressed: true, x: 120, y: 160,
    })
    act(() => usePreviewStore.getState().setOutputs(new Map([['tft', { lit: false }]])))
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(false)
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 70, clientY: 100 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(false)
    act(() => usePreviewStore.getState().setOutputs(new Map([['tft', { lit: true }]])))
    fireEvent.pointerDown(canvas, { pointerId: 3, clientX: 70, clientY: 100 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(true)
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(false)
  })

  it('shows the missing-document notice instead of the canvas when a design is wired', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0' })],
      edges: [{ id: 'link', source: 'screen', sourceHandle: 'customDisplay', target: 'tft', targetHandle: 'customDisplay' }],
      activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    expect(screen.getByRole('img', { name: 'Driven by a wired Screen Design' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Transport display preview/ })).toBeNull()
  })

  it.each([true, false])('renders a wired custom document with saved Enabled=%s and follows live values', (enabled) => {
    const sourceDef = NODE_LIBRARY.find((entry) => entry.type === 'Display')!
    const source = {
      id: 'screen', type: 'studioNode', position: { x: 0, y: 0 },
      data: {
        label: sourceDef.label, nodeType: sourceDef.type, category: sourceDef.category,
        properties: { ...sourceDef.defaultProperties, displayId: 'panel' },
        inputs: sourceDef.inputs, outputs: sourceDef.outputs,
      },
    } as unknown as StudioNode
    const document = addDisplayWidget(createDisplayDocument('panel', 320, 240), 'Text')
    useGraphStore.setState({
      nodes: [source, display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90', enabled })],
      edges: [{ id: 'link', source: 'screen', sourceHandle: 'customDisplay', target: 'tft', targetHandle: 'customDisplay' }],
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
    // The panel is the only thing that knows the size, so the create action
    // has to mint node, document and cable together — a design that exists
    // before its mount is exactly the unsized state HW-07 removes.
    useGraphStore.getState().loadGraph([display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90' })], [])
    useUiStore.setState({ designWorkspaceView: { kind: 'graph' } })

    render(<TransportDisplayNodeBody nodeId="tft" />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Create screen design' })) })

    const state = useGraphStore.getState()
    const created = state.nodes.find((node) => node.data.nodeType === 'Display')!
    expect(created).toBeTruthy()
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0]).toMatchObject({
      source: created.id, sourceHandle: 'customDisplay', target: 'tft', targetHandle: 'customDisplay',
    })
    const document = state.displayDocuments[created.id]
    expect(document.designSize).toEqual({ width: 320, height: 240 })
    expect(document.orientation).toBe('90')
    const view = useUiStore.getState().designWorkspaceView
    expect(view).toEqual({ kind: 'display', displayId: created.id })
  })

  it('undoes the whole design in one step', () => {
    vi.useFakeTimers()
    try {
      useGraphStore.getState().loadGraph([display({ partId: 'st7789-tft-240x240', tftRotation: '0' })], [])
      render(<TransportDisplayNodeBody nodeId="tft" />)
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Create screen design' })) })
      act(() => { vi.advanceTimersByTime(400) })
      const created = useGraphStore.getState().nodes.find((node) => node.data.nodeType === 'Display')!

      act(() => { useGraphStore.temporal.getState().undo() })

      const state = useGraphStore.getState()
      expect(state.nodes.some((node) => node.data.nodeType === 'Display')).toBe(false)
      expect(state.edges).toHaveLength(0)
      expect(state.displayDocuments[created.id]).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })


  it('drops a fixed content wire the way dragging the cable would', () => {
    const player = {
      id: 'player', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: 'Music Player', nodeType: 'PatternMaster', category: 'output', properties: {}, inputs: [], outputs: [] },
    } as unknown as StudioNode
    useGraphStore.getState().loadGraph(
      [player, display({ partId: 'st7789-tft-240x240', tftRotation: '0' })],
      [{ id: 'fixed', source: 'player', sourceHandle: 'display', target: 'tft', targetHandle: 'display' } as never],
    )

    render(<TransportDisplayNodeBody nodeId="tft" />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Create screen design' })) })

    const edges = useGraphStore.getState().edges
    expect(edges).toHaveLength(1)
    expect(edges[0].targetHandle).toBe('customDisplay')
  })

  it('offers the mounted design for editing instead of a second one', () => {
    const sourceDef = NODE_LIBRARY.find((entry) => entry.type === 'Display')!
    const source = {
      id: 'screen', type: 'studioNode', position: { x: 0, y: 0 },
      data: {
        label: sourceDef.label, nodeType: sourceDef.type, category: sourceDef.category,
        properties: { ...sourceDef.defaultProperties, displayId: 'panel' },
        inputs: sourceDef.inputs, outputs: sourceDef.outputs,
      },
    } as unknown as StudioNode
    useGraphStore.setState({
      nodes: [source, display({ partId: 'st7789-tft-240x240', tftRotation: '0' })],
      edges: [{ id: 'link', source: 'screen', sourceHandle: 'customDisplay', target: 'tft', targetHandle: 'customDisplay' }],
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
    const canvas = screen.getByRole('img', { name: 'Transport display preview, 240 by 240 pixels' })
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 20, clientY: 20 })
    expect(useTransportDisplayTouchStore.getState().touches.has('tft')).toBe(false)
  })
})
