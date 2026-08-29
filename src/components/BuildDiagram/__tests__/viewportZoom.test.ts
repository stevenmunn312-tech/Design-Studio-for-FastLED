import { describe, expect, it } from 'vitest'
import { scrollOffsetForPointerZoom } from '../viewportZoom'

describe('Build Diagram pointer-focused zoom', () => {
  it('keeps the diagram coordinate under the pointer fixed across zoom levels', () => {
    const currentZoom = 0.85
    const nextZoom = 1
    const pointerOffset = 240
    const contentOrigin = 18
    const scrollOffset = 310
    const diagramCoordinate = (
      scrollOffset + pointerOffset - contentOrigin
    ) / currentZoom

    const nextScrollOffset = scrollOffsetForPointerZoom({
      scrollOffset,
      pointerOffset,
      contentOrigin,
    }, currentZoom, nextZoom)

    expect(
      (nextScrollOffset + pointerOffset - contentOrigin) / nextZoom,
    ).toBeCloseTo(diagramCoordinate)
  })

  it('accounts for the unscaled padding before the canvas', () => {
    expect(scrollOffsetForPointerZoom({
      scrollOffset: 300,
      pointerOffset: 100,
      contentOrigin: 18,
    }, 1, 1.15)).toBeCloseTo(357.3)
  })

  it('does not request negative scrolling at the top or left edge', () => {
    expect(scrollOffsetForPointerZoom({
      scrollOffset: 0,
      pointerOffset: 100,
      contentOrigin: 18,
    }, 1, 0.55)).toBe(0)
  })
})
