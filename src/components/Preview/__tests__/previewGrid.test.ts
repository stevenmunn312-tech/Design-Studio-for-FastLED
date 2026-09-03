import { describe, expect, it } from 'vitest'
import { previewGridDimensions } from '../previewGrid'

describe('previewGridDimensions', () => {
  it('uses the normal 16x16 canvas for an empty graph', () => {
    expect(previewGridDimensions(undefined, 16, false)).toEqual({ width: 16, height: 16 })
  })

  it('uses a one-column grid only for a standalone combined VU fixture', () => {
    expect(previewGridDimensions(undefined, 30, true)).toEqual({ width: 1, height: 30 })
  })

  it('prefers the selected LED output dimensions', () => {
    expect(previewGridDimensions({ width: 32, height: 8 }, 30, true)).toEqual({ width: 32, height: 8 })
  })

  it('shows a complete maximum-length LED string', () => {
    expect(previewGridDimensions({ width: 300, height: 1 }, 16, false)).toEqual({ width: 300, height: 1 })
  })
})
