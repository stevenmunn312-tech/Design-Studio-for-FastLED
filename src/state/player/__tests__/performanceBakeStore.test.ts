import { describe, expect, it } from 'vitest'
import { bakedFrameAt, chooseBakeFps, packFrame, usePerformanceBakeStore } from '../performanceBakeStore'

describe('performanceBakeStore', () => {
  it('packs baked frames and samples them back by playback position', () => {
    usePerformanceBakeStore.getState().startBake('pg', {
      entryId: 'song-a',
      durationMs: 1000,
      width: 1,
      height: 1,
      fps: 2,
    })
    usePerformanceBakeStore.getState().finishBake('pg', [
      packFrame([[{ r: 1, g: 2, b: 3 }]]),
      packFrame([[{ r: 4, g: 5, b: 6 }]]),
      packFrame([[{ r: 7, g: 8, b: 9 }]]),
    ])

    expect(bakedFrameAt('pg', 0)?.[0][0]).toEqual({ r: 1, g: 2, b: 3 })
    expect(bakedFrameAt('pg', 500)?.[0][0]).toEqual({ r: 4, g: 5, b: 6 })
    expect(bakedFrameAt('pg', 1000)?.[0][0]).toEqual({ r: 7, g: 8, b: 9 })

    usePerformanceBakeStore.getState().clearBake('pg')
  })

  it('adapts the bake fps to stay positive even on long, high-resolution songs', () => {
    expect(chooseBakeFps(240_000, 64, 64)).toBeGreaterThan(0)
    expect(chooseBakeFps(10_000, 16, 16)).toBeLessThanOrEqual(20)
  })
})
