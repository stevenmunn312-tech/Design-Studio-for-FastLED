import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendSafetyBand, inlineSvgImages } from '../svgExport'

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

  it('embeds a downloaded part picture (a blob: URL) so the SVG stands alone', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    const blobUrl = 'blob:http://localhost:3000/5a1b7c2e-0f4d-4c1e-9d55-aa00bb11cc22'
    image.setAttribute('href', blobUrl)
    svg.append(image)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['verified-webp'], { type: 'image/webp' }),
    } as Response)

    await inlineSvgImages(svg)

    // `new URL(blob:..., base)` keeps the blob URL whole, so the fetch reads the verified bytes.
    expect(String(fetchMock.mock.calls[0][0])).toBe(blobUrl)
    expect(image.getAttribute('href')).toMatch(/^data:image\/webp;base64,/)
    expect(svg.outerHTML).not.toContain('blob:')
  })
})

describe('appendSafetyBand', () => {
  it('adds the safety line below the drawing without moving it', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 40 1120 600')
    svg.setAttribute('height', '600')
    const text = 'Guidance only, not a certified design. Mains wiring can kill. Build at your own risk.'

    appendSafetyBand(svg, text)

    const [x, y, width, height] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number)
    expect([x, y, width]).toEqual([0, 40, 1120])
    expect(height).toBeGreaterThan(600)
    expect(svg.getAttribute('height')).toBe(String(height))
    const band = svg.querySelector('[data-safety-band]')
    expect(band?.querySelector('rect')?.getAttribute('y')).toBe('640')
    expect(Array.from(band?.querySelectorAll('tspan') ?? []).map((span) => span.textContent).join(' ')).toBe(text)
  })

  it('wraps a long line so it stays inside a narrow sheet', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 300 200')
    appendSafetyBand(svg, 'word '.repeat(60).trim())
    const spans = Array.from(svg.querySelectorAll('tspan'))
    expect(spans.length).toBeGreaterThan(1)
    for (const span of spans) expect((span.textContent ?? '').length * 13 * 0.55).toBeLessThanOrEqual(300 - 24)
  })
})
