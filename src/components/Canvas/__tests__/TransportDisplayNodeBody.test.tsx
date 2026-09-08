import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TransportDisplayNodeBody from '../TransportDisplayNodeBody'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { usePreviewStore } from '../../../state/previewStore'
import { useTransportDisplayTouchStore } from '../../../state/transportDisplayTouchStore'

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
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(useTransportDisplayTouchStore.getState().touches.get('tft')?.pressed).toBe(false)
  })

  it('shows the Custom Display notice instead of the canvas when customDisplay is wired', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0' })],
      edges: [{ id: 'link', source: 'screen', sourceHandle: 'customDisplay', target: 'tft', targetHandle: 'customDisplay' }],
      activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    expect(screen.getByRole('img', { name: 'Driven by a wired Custom Display' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Transport display preview/ })).toBeNull()
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
