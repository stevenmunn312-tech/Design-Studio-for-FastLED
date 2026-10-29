import { describe, expect, it } from 'vitest'
import { sanitizePin } from '../hardwarePins'

describe('sanitizePin', () => {
  it('treats a cleared pin field as unset rather than GPIO 0', () => {
    expect(sanitizePin('', 21)).toBe(21)
    expect(sanitizePin('   ', 22)).toBe(22)
  })

  it('still clamps a numeric string and falls back on junk', () => {
    expect(sanitizePin('5', 21)).toBe(5)
    expect(sanitizePin('0', 21)).toBe(0)
    expect(sanitizePin('abc', 21)).toBe(21)
    expect(sanitizePin(999, 21, 0, 48)).toBe(48)
  })
})
