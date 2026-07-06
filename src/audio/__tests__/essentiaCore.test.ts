import { describe, expect, it } from 'vitest'
import { formatWorkerError } from '../essentiaCore'

describe('formatWorkerError', () => {
  it('prefers an Error stack when available', () => {
    const err = new Error('boom')
    const text = formatWorkerError(err)
    expect(text).toContain('boom')
  })

  it('stringifies plain objects for diagnostics', () => {
    expect(formatWorkerError({ code: 7, reason: 'x' })).toBe('{"code":7,"reason":"x"}')
  })
})
