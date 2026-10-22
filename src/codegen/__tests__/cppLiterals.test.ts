import { describe, expect, it } from 'vitest'
import { cppComment } from '../cppLiterals'

describe('cppComment', () => {
  it('replaces line breaks that would end the comment', () => {
    expect(cppComment('a\nb\r\nc d')).toBe('a b c d')
  })
  it('does not end in a backslash that would continue the comment onto the next line', () => {
    expect(cppComment('Brightness \\')).not.toMatch(/\\$/)
    expect(cppComment('Brightness \\')).toContain('Brightness')
    // GCC takes a backslash, spaces and a newline as a continuation too.
    expect(cppComment('Brightness \\ ')).not.toMatch(/\\\s*$/)
    expect(cppComment('Brightness \\\\')).not.toMatch(/\\$/)
    // Truncation cannot expose one either.
    expect(cppComment(`${'x'.repeat(119)}\\more`)).not.toMatch(/\\$/)
  })
  it('keeps a backslash that is followed by text', () => {
    expect(cppComment('a\\b')).toBe('a\\b')
  })
})
