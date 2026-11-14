import { describe, expect, it } from 'vitest'
import { pageUsesLocalHelper } from '../../../vite-plugin-upload-helper'

describe('pageUsesLocalHelper', () => {
  it('starts the helper for the default page, which talks to 8008', () => {
    expect(pageUsesLocalHelper(undefined)).toBe(true)
    expect(pageUsesLocalHelper('')).toBe(true)
    expect(pageUsesLocalHelper('http://localhost:8008')).toBe(true)
    expect(pageUsesLocalHelper('http://127.0.0.1:8008/')).toBe(true)
  })

  it('leaves 8008 alone for a page pointed elsewhere, such as the isolated preview', () => {
    expect(pageUsesLocalHelper('http://127.0.0.1:1')).toBe(false)
    expect(pageUsesLocalHelper('http://localhost:8009')).toBe(false)
    expect(pageUsesLocalHelper('http://localhost')).toBe(false)
  })

  it('keeps the old behaviour for a URL it cannot read', () => {
    expect(pageUsesLocalHelper('not a url')).toBe(true)
  })
})
