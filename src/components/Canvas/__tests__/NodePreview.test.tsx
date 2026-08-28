import { describe, it, expect, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import NodePreview from '../NodePreview'
import { LED_CELL_FILL, thumbGrid } from '../../Hardware/ledPreviewGeometry'
import { usePreviewStore } from '../../../state/previewStore'

describe('NodePreview', () => {
  beforeEach(() => usePreviewStore.getState().clear())

  it('renders a palette as a left-to-right gradient strip', () => {
    usePreviewStore.setState({
      outputs: new Map([['n', { palette: [{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }] }]]),
    })
    const { container } = render(<NodePreview nodeId="n" kind="palette" port="palette" />)
    const bg = (container.firstChild as HTMLElement).style.background
    // 16 stops interpolated red→blue (jsdom normalises rgb() with spaces).
    expect(bg).toContain('linear-gradient(to right,')
    expect(bg).toContain('rgb(255, 0, 0) 0.0%') // red anchor at the start
    expect(bg).toContain('rgb(17, 0, 238)')      // a near-blue interpolated stop
  })

  it('renders a colour output as a swatch', () => {
    usePreviewStore.setState({ outputs: new Map([['n', { color: { r: 10, g: 20, b: 30 } }]]) })
    const { container } = render(<NodePreview nodeId="n" kind="color" port="color" />)
    expect((container.firstChild as HTMLElement).style.background).toBe('rgb(10, 20, 30)')
  })

  it('renders a frame output as an SVG grid on the frame’s own dimensions', () => {
    const { container } = render(<NodePreview nodeId="n" kind="frame" port="frame" cols={32} rows={8} />)
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    // One group per emitter; the shapes inside it are the package and the
    // light coming off it, which is a drawing detail rather than a count.
    expect(container.querySelectorAll('svg > g')).toHaveLength(32 * 8)
  })

  it('draws frame pixels as gapped LED emitters, like the LED output does', () => {
    const { container } = render(<NodePreview nodeId="n" kind="frame" port="frame" cols={2} rows={1} />)
    // The package itself, which follows the bloom layers inside its group.
    const cell = container.querySelector('svg > g > rect:last-child')!
    // Half-cell emitters, centred in their cell — the gap is what makes a
    // source node read as the same panel the output node draws.
    expect(cell.getAttribute('width')).toBe(String(LED_CELL_FILL))
    expect(cell.getAttribute('x')).toBe(String((1 - LED_CELL_FILL) / 2))
  })

  it('dims the frame thumbnail by the published master brightness', () => {
    const { container } = render(<NodePreview nodeId="n" kind="frame" port="frame" cols={1} rows={1} />)
    act(() => {
      usePreviewStore.getState().setOutputs(
        new Map([['n', { frame: [[{ r: 200, g: 100, b: 50 }]] }]]),
        // Half brightness: the same scale the LED output's own preview applies.
        128,
      )
    })
    // 200/100/50 x 128/255, rounded.
    expect(container.querySelector('svg > g')?.getAttribute('fill')).toBe('rgb(100 50 25)')
  })

  it('shows the frame thumbnail undimmed at full master brightness', () => {
    const { container } = render(<NodePreview nodeId="n" kind="frame" port="frame" cols={1} rows={1} />)
    act(() => {
      usePreviewStore.getState().setOutputs(new Map([['n', { frame: [[{ r: 200, g: 100, b: 50 }]] }]]), 255)
    })
    expect(container.querySelector('svg > g')?.getAttribute('fill')).toBe('rgb(200 100 50)')
  })

  it('caps a large panel’s cell count without changing its shape', () => {
    // 128x128 is 16384 cells; one thumbnail per frame node would be a lot of DOM.
    const capped = thumbGrid(128, 128)
    expect(capped.cols * capped.rows).toBeLessThanOrEqual(1024)
    expect(capped.cols).toBe(capped.rows)
    // Ordinary panels stay cell for cell with the output node.
    expect(thumbGrid(16, 16)).toEqual({ cols: 16, rows: 16 })
    expect(thumbGrid(32, 8)).toEqual({ cols: 32, rows: 8 })
  })

  it('falls back to a rainbow strip when the palette output is missing', () => {
    const { container } = render(<NodePreview nodeId="missing" kind="palette" port="palette" />)
    expect((container.firstChild as HTMLElement).style.background).toContain('linear-gradient')
  })
})
