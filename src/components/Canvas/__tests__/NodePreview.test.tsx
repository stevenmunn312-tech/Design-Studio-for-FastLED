import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import NodePreview from '../NodePreview'
import { usePreviewStore } from '../../../state/previewStore'

describe('NodePreview', () => {
  beforeEach(() => usePreviewStore.setState({ outputs: new Map() }))

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

  it('renders a frame output as a fixed SVG grid', () => {
    const { container } = render(<NodePreview nodeId="n" kind="frame" port="frame" />)
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('svg rect')).toHaveLength(16 * 16)
  })

  it('falls back to a rainbow strip when the palette output is missing', () => {
    const { container } = render(<NodePreview nodeId="missing" kind="palette" port="palette" />)
    expect((container.firstChild as HTMLElement).style.background).toContain('linear-gradient')
  })
})
