import { describe, expect, it } from 'vitest'
import { panOffsetForPointerZoom } from '../viewportZoom'

describe('Build Diagram pointer-focused zoom', () => {
  it('keeps the diagram coordinate under the pointer fixed across zoom levels', () => {
    const currentZoom = 0.85
    const nextZoom = 1
    const pointerOffset = 240
    const contentOrigin = 18
    const panOffset = -310
    const diagramCoordinate = (
      pointerOffset - contentOrigin - panOffset
    ) / currentZoom

    const nextPanOffset = panOffsetForPointerZoom({
      panOffset,
      pointerOffset,
      contentOrigin,
    }, currentZoom, nextZoom)

    expect(
      (pointerOffset - contentOrigin - nextPanOffset) / nextZoom,
    ).toBeCloseTo(diagramCoordinate)
  })

  it('accounts for the unscaled padding before the canvas', () => {
    expect(panOffsetForPointerZoom({
      panOffset: 0,
      pointerOffset: 100,
      contentOrigin: 18,
    }, 1, 1.15)).toBeCloseTo(-12.3)
  })

  it('allows free panning beyond the former scroll boundaries', () => {
    expect(panOffsetForPointerZoom({
      panOffset: 0,
      pointerOffset: 100,
      contentOrigin: 18,
    }, 1, 0.55)).toBeCloseTo(36.9)
  })
})
