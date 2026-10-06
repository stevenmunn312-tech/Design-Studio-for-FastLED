import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import BenchDisplayScreen from '../BenchDisplayScreen'
import { ROOT_GRAPH_ID, useGraphStore } from '../../../state/graphStore'
import { usePreviewStore } from '../../../state/previewStore'
import { createOledSurface, OLED_CONTROLLERS, setPixel } from '../../../state/oledSurface'
import { SEGMENT_GLYPHS } from '../../../state/segmentDisplay'

function litCount(container: HTMLElement) {
  return container.querySelectorAll('[data-segment-lit]').length
}

function bitCount(value: number) {
  let count = 0
  for (let bit = 0; bit < 7; bit++) if (value & (1 << bit)) count++
  return count
}

describe('a display drawn on its part render', () => {
  beforeEach(() => {
    usePreviewStore.getState().clear()
    useGraphStore.setState({ nodes: [], edges: [], activeGraphId: ROOT_GRAPH_ID } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('lights exactly the segments and colon the module would', () => {
    usePreviewStore.getState().setOutputs(new Map([['seg', {
      segment: { digits: '1234', colon: true, decimalAt: -1, lit: true },
    }]]))
    const { container } = render(
      <BenchDisplayScreen nodeId="seg" nodeType="SegmentDisplay" partId="tm1637-4digit-display" properties={{}} />,
    )
    const segments = ['1', '2', '3', '4'].reduce((sum, digit) => sum + bitCount(SEGMENT_GLYPHS[digit]), 0)
    // Two colon dots, and no decimal points: this module has none.
    expect(litCount(container)).toBe(segments + 2)
  })

  it('goes dark with the module, leaving only the unlit segments', () => {
    usePreviewStore.getState().setOutputs(new Map([['seg', {
      segment: { digits: '8888', colon: true, decimalAt: -1, lit: false },
    }]]))
    const { container } = render(
      <BenchDisplayScreen nodeId="seg" nodeType="SegmentDisplay" partId="tm1637-4digit-display" properties={{}} />,
    )
    expect(litCount(container)).toBe(0)
    expect(container.querySelectorAll('polygon')).toHaveLength(4 * 7)
  })

  it('draws a MAX7219 point on the digit that carries it', () => {
    usePreviewStore.getState().setOutputs(new Map([['seg', {
      segment: { digits: '       1', colon: false, decimalAt: 7, lit: true },
    }]]))
    const { container } = render(
      <BenchDisplayScreen nodeId="seg" nodeType="SegmentDisplay" partId="max7219-8digit-7segment" properties={{}} />,
    )
    expect(container.querySelectorAll('polygon')).toHaveLength(8 * 7)
    expect(container.querySelectorAll('circle[data-segment-lit]')).toHaveLength(1)
    expect(litCount(container)).toBe(bitCount(SEGMENT_GLYPHS['1']) + 1)
  })

  it('puts an OLED picture on the glass, turned for a flipped mounting', () => {
    const image = { width: 128, height: 64, data: new Uint8ClampedArray(128 * 64 * 4) }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: () => image,
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
    const surface = createOledSurface(OLED_CONTROLLERS.SH1106)
    setPixel(surface, 0, 0)
    usePreviewStore.getState().setOutputs(new Map([['oled', { lit: true, surface }]]))

    const { container, rerender } = render(
      <BenchDisplayScreen nodeId="oled" nodeType="InfoDisplay" partId="sh1106-oled-128x64" properties={{}} />,
    )
    const picture = container.querySelector('image')!
    expect(picture.getAttribute('href')).toBe('data:image/png;base64,AAAA')
    expect(picture.getAttribute('transform')).toContain('rotate(0)')
    // A lit pixel is the panel's white; an unlit one lets the rendered glass show.
    expect(Array.from(image.data.slice(0, 8))).toEqual([205, 238, 255, 255, 0, 0, 0, 0])

    rerender(
      <BenchDisplayScreen
        nodeId="oled"
        nodeType="InfoDisplay"
        partId="sh1106-oled-128x64"
        properties={{ oledRotation: '180' }}
      />,
    )
    expect(container.querySelector('image')!.getAttribute('transform')).toContain('rotate(180)')
  })

  it('shows the powered-off glass when the panel is dark', () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
    usePreviewStore.getState().setOutputs(new Map([['oled', {
      lit: true, surface: createOledSurface(OLED_CONTROLLERS.SH1106),
    }]]))
    const { container } = render(
      <BenchDisplayScreen nodeId="oled" nodeType="InfoDisplay" partId="sh1106-oled-128x64" properties={{}} />,
    )
    expect(container.querySelector('image')).not.toBeNull()

    act(() => {
      usePreviewStore.getState().setOutputs(new Map([['oled', { lit: false, surface: null }]]))
      vi.advanceTimersByTime(200)
    })
    expect(container.querySelector('image')).toBeNull()
  })

  it('draws nothing for a part whose screen faces away from the render', () => {
    const { container } = render(
      <BenchDisplayScreen
        nodeId="tft"
        nodeType="TransportDisplay"
        partId="ili9341-xc4630-parallel-touch-320x240"
        properties={{}}
      />,
    )
    expect(container.querySelector('svg')).toBeNull()
  })
})
