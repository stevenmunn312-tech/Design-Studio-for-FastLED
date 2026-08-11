import { afterEach, describe, expect, it, vi } from 'vitest'
import { inlineSvgImages } from '../svgExport'

describe('inlineSvgImages', () => {
  afterEach(() => vi.restoreAllMocks())

  it('embeds external board renders in standalone SVG exports', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    image.setAttribute('href', '/assets/esp32-s3-devkitc-1.png')
    svg.append(image)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['board-render'], { type: 'image/png' }),
    } as Response)

    await inlineSvgImages(svg)

    expect(fetchMock).toHaveBeenCalledWith(new URL('/assets/esp32-s3-devkitc-1.png', window.location.href))
    expect(image.getAttribute('href')).toMatch(/^data:image\/png;base64,/)
  })
})
