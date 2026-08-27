import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import InfoDisplayNodeBody from '../InfoDisplayNodeBody'
import SegmentDisplayNodeBody from '../SegmentDisplayNodeBody'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { usePreviewStore } from '../../../state/previewStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { createOledSurface, OLED_CONTROLLERS, setPixel } from '../../../state/oledSurface'

function node(id: string, nodeType: string, properties: Record<string, unknown>): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType, category: def.category, properties,
      inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

describe('fixed auxiliary display node previews', () => {
  beforeEach(() => {
    usePreviewStore.getState().clear()
    useGraphStore.setState({ nodes: [], edges: [], activeGraphId: ROOT_GRAPH_ID } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the OLED physical 2:1 aspect before its first evaluated frame', () => {
    render(<InfoDisplayNodeBody nodeId="oled" />)
    const canvas = screen.getByRole('img', { name: 'Info display preview, 128 by 64 pixels' })
    expect(canvas.getAttribute('width')).toBe('128')
    expect(canvas.getAttribute('height')).toBe('64')
  })

  it('paints the evaluated page-major OLED pixels without reformatting them', () => {
    const image = {
      width: 128,
      height: 64,
      data: new Uint8ClampedArray(128 * 64 * 4),
    }
    const putImageData = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: () => image,
      putImageData,
    } as unknown as CanvasRenderingContext2D)
    const surface = createOledSurface(OLED_CONTROLLERS.SH1106)
    setPixel(surface, 0, 0)
    usePreviewStore.getState().setOutputs(new Map([['oled', { surface }]]))

    render(<InfoDisplayNodeBody nodeId="oled" />)

    expect(putImageData).toHaveBeenCalledWith(image, 0, 0)
    expect(Array.from(image.data.slice(0, 8))).toEqual([205, 238, 255, 255, 0, 5, 12, 255])
  })

  it('shows the evaluated four-digit frame and colon accessibly', () => {
    useGraphStore.setState({
      nodes: [node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display' })],
    } as never)
    usePreviewStore.getState().setOutputs(new Map([['seg', {
      segment: { digits: '1234', colon: true, decimalAt: -1, lit: true },
    }]]))
    render(<SegmentDisplayNodeBody nodeId="seg" />)
    expect(screen.getByRole('img', { name: 'Segment display preview: 12:34' })).toBeTruthy()
  })

  it('sizes an unevaluated MAX7219 preview to all eight physical digits', () => {
    useGraphStore.setState({
      nodes: [node('seg', 'SegmentDisplay', { partId: 'max7219-8digit-7segment' })],
    } as never)
    const { container } = render(<SegmentDisplayNodeBody nodeId="seg" />)
    expect(screen.getByRole('img', { name: 'Segment display preview: off' })).toBeTruthy()
    expect(container.querySelectorAll('[class*="digitSlot"]')).toHaveLength(8)
  })
})
