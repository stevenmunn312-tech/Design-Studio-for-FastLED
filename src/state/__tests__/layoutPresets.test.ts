import { describe, it, expect } from 'vitest'
import { clampPanelWidth } from '../layoutPresets'

describe('clampPanelWidth', () => {
  it('passes through a value within bounds', () => {
    expect(clampPanelWidth(300, 220, 420)).toBe(300)
  })

  it('clamps below the minimum', () => {
    expect(clampPanelWidth(100, 220, 420)).toBe(220)
  })

  it('clamps above the maximum', () => {
    expect(clampPanelWidth(900, 220, 420)).toBe(420)
  })

  it('handles min === max', () => {
    expect(clampPanelWidth(500, 300, 300)).toBe(300)
  })
})
