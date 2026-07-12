import { describe, expect, it } from 'vitest'
import { shouldConsumeFocusedWheel, shouldConsumeWheel } from '../wheelBehavior'

describe('MusicLibraryNodeBody wheel behavior', () => {
  it('lets the canvas zoom when the song list does not overflow', () => {
    expect(shouldConsumeWheel({ scrollTop: 0, clientHeight: 180, scrollHeight: 180 }, 40)).toBe(false)
  })

  it('consumes downward wheel input while the list can scroll down', () => {
    expect(shouldConsumeWheel({ scrollTop: 20, clientHeight: 180, scrollHeight: 360 }, 40)).toBe(true)
  })

  it('consumes upward wheel input while the list can scroll up', () => {
    expect(shouldConsumeWheel({ scrollTop: 20, clientHeight: 180, scrollHeight: 360 }, -40)).toBe(true)
  })

  it('lets the canvas zoom when already at the bottom of the list', () => {
    expect(shouldConsumeWheel({ scrollTop: 180, clientHeight: 180, scrollHeight: 360 }, 40)).toBe(false)
  })

  it('lets the canvas zoom when already at the top of the list', () => {
    expect(shouldConsumeWheel({ scrollTop: 0, clientHeight: 180, scrollHeight: 360 }, -40)).toBe(false)
  })

  it('consumes wheel input for a focused editor only while it is active', () => {
    const target = {} as Element
    expect(shouldConsumeFocusedWheel(target, target)).toBe(true)
    expect(shouldConsumeFocusedWheel(target, null)).toBe(false)
    expect(shouldConsumeFocusedWheel(target, {} as Element)).toBe(false)
  })
})
