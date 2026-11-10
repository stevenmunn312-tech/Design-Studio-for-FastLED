import { describe, expect, it } from 'vitest'
import { FLASH_BYTES_PER_CODE_CHAR, patternFlashEstimate } from '../patternFlash'
import { BUNDLED_PATTERNS } from '../bundledPatterns'
import type { SavedPattern } from '../patternLibrary'

const named = (name: string): SavedPattern => {
  const found = BUNDLED_PATTERNS.find((pattern) => pattern.name === name)
  if (!found) throw new Error(`no bundled pattern named ${name}`)
  return found
}

describe('pattern flash estimate', () => {
  it('prices the firmware a pattern generates, by the fitted ratio', () => {
    const estimate = patternFlashEstimate(named('Cinder Storm'))
    expect(estimate.codeChars).toBeGreaterThan(0)
    expect(estimate.bytes).toBe(Math.round(estimate.codeChars * FLASH_BYTES_PER_CODE_CHAR))
    expect(estimate.bytes).toBeGreaterThan(0)
  })

  it('gives every bundled pattern a figure', () => {
    for (const pattern of BUNDLED_PATTERNS) {
      expect(patternFlashEstimate(pattern).bytes, pattern.name).toBeGreaterThan(0)
    }
  })

  it('ranks a larger graph above a smaller one', () => {
    const sizes = BUNDLED_PATTERNS.map((pattern) => ({ nodes: pattern.subgraph.nodes.length, bytes: patternFlashEstimate(pattern).bytes }))
    const smallest = sizes.reduce((a, b) => (b.nodes < a.nodes ? b : a))
    const largest = sizes.reduce((a, b) => (b.nodes > a.nodes ? b : a))
    expect(largest.bytes).toBeGreaterThan(smallest.bytes)
  })

  it('answers from its cache for the same subgraph', () => {
    const pattern = named('Cinder Storm')
    expect(patternFlashEstimate(pattern)).toBe(patternFlashEstimate(pattern))
  })

})
