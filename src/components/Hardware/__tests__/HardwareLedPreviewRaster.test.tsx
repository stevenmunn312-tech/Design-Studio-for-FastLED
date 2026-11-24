import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom has no canvas, so the picture itself is stood in for: what is checked
// here is which thumbnails become one picture, what colours they hand over,
// and that the picture reaches every layer.
const pictures: Array<{ colours: number[]; cols: number; rows: number }> = []
vi.mock('../ledPreviewRaster', () => ({
  RASTER_CELLS: 256,
  canRasterThumbnails: () => true,
  thumbnailUrl: (colours: Uint32Array, cols: number, rows: number) => {
    pictures.push({ colours: Array.from(colours), cols, rows })
    return `data:picture-${pictures.length}`
  },
}))

const { default: HardwareLedPreview } = await import('../HardwareLedPreview')
const { usePreviewStore } = await import('../../../state/previewStore')

function publish(previewFrame: unknown, brightness = 255) {
  act(() => {
    usePreviewStore.getState().setOutputs(new Map([['output', { frame: null, previewFrame }]]), brightness)
  })
}

const solid = (cols: number, rows: number, pixel: { r: number; g: number; b: number }) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ ...pixel })))

describe('HardwareLedPreview as one picture', () => {
  beforeEach(() => {
    usePreviewStore.getState().clear()
    pictures.length = 0
  })

  it('draws a grid of more than 256 LEDs as images behind LED-shaped masks', () => {
    const { container } = render(<HardwareLedPreview nodeId="output" cols={32} rows={32} cellFill={0.5} />)

    expect(container.querySelectorAll('svg > g')).toHaveLength(0)
    const images = Array.from(container.querySelectorAll('image'))
    // The surround and the package: one image each.
    expect(images).toHaveLength(2)
    for (const image of images) {
      const mask = /url\(#(.+)\)/.exec(image.getAttribute('mask') ?? '')?.[1]
      expect(mask && container.querySelector(`mask[id="${mask}"]`)).toBeTruthy()
    }
    // The package's hole is the emitter a small grid draws: centred, half the cell.
    const hole = container.querySelectorAll('pattern')[1].querySelector('rect')!
    expect([hole.getAttribute('x'), hole.getAttribute('y'), hole.getAttribute('width')]).toEqual(['0.25', '0.25', '0.5'])
  })

  it('hands the picture every LED colour and shows it on each layer', () => {
    const { container } = render(<HardwareLedPreview nodeId="output" cols={32} rows={32} />)
    const frame = solid(32, 32, { r: 255, g: 0, b: 0 })
    frame[1][2] = { r: 0, g: 0, b: 255 }
    publish(frame)

    const last = pictures[pictures.length - 1]
    expect([last.cols, last.rows, last.colours.length]).toEqual([32, 32, 1024])
    expect(last.colours[0]).toBe(0xff0000)
    expect(last.colours[32 + 2]).toBe(0x0000ff)
    for (const image of container.querySelectorAll('image')) {
      expect(image.getAttribute('href')).toBe(`data:picture-${pictures.length}`)
    }
  })

  it('makes no new picture for a frame that changes nothing', () => {
    render(<HardwareLedPreview nodeId="output" cols={32} rows={32} />)
    publish(solid(32, 32, { r: 10, g: 20, b: 30 }))
    const made = pictures.length
    publish(solid(32, 32, { r: 10, g: 20, b: 30 }))
    expect(pictures.length).toBe(made)
  })

  // Unlit is where the colours start, so an all-black frame changes nothing;
  // the LEDs must still be drawn, unlit, as a small grid draws them.
  it('shows unlit LEDs before any frame, and for a first frame that is all black', () => {
    // The first frame is already there when the thumbnail mounts, and is black.
    publish(solid(32, 32, { r: 0, g: 0, b: 0 }))
    const { container } = render(<HardwareLedPreview nodeId="output" cols={32} rows={32} />)

    expect(pictures.length).toBeGreaterThan(0)
    expect(pictures.every((picture) => picture.colours.every((colour) => colour === 0))).toBe(true)
    const latest = `data:picture-${pictures.length}`
    expect(Array.from(container.querySelectorAll('image')).map((image) => image.getAttribute('href'))).toEqual([latest, latest])
  })

  it('goes black when the route goes away', () => {
    render(<HardwareLedPreview nodeId="output" cols={32} rows={32} />)
    publish(solid(32, 32, { r: 255, g: 255, b: 255 }))
    publish(undefined)
    expect(pictures[pictures.length - 1].colours.every((colour) => colour === 0)).toBe(true)
  })

  it('keeps one group per LED for a small grid and for a shaped output', () => {
    const small = render(<HardwareLedPreview nodeId="output" cols={16} rows={16} />)
    expect(small.container.querySelectorAll('svg > g')).toHaveLength(256)
    expect(small.container.querySelectorAll('image')).toHaveLength(0)

    const ring = render(<HardwareLedPreview nodeId="output" cols={300} rows={1} ring={{ ledCount: 300, startAngle: 0, direction: 'cw' }} />)
    expect(ring.container.querySelectorAll('image')).toHaveLength(0)
    expect(ring.container.querySelectorAll('svg > g')).toHaveLength(300)
  })
})
