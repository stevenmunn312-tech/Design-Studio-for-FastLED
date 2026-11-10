import { describe, expect, it } from 'vitest'
import { AUDIO_BUNDLED_PATTERNS } from '../bundledPatterns'
import { BUNDLED_EXCEPTIONAL_AUDIO_NAMES } from '../bundledExceptionalAudio'
import { STARTER_SHOW_SIZE, starterShowPatterns } from '../starterShowPatterns'
import { patternFormTags } from '../patternTags'
import { MAX_FIRMWARE_PATTERNS } from '../../../utils/validateGraph'

/*
 * The list is generated and checked in (scripts/assets/exceptional-audio-patterns.ts),
 * so a bundled pattern renamed or dropped afterwards would leave a name here
 * that matches nothing, and a starter one pattern short without a word.
 */
describe('the bundled Exceptional audio-reactive list', () => {
  const audioNames = new Set(AUDIO_BUNDLED_PATTERNS.map((pattern) => pattern.name))

  it('is not empty and names only bundled audio-reactive patterns, once each', () => {
    expect(BUNDLED_EXCEPTIONAL_AUDIO_NAMES.length).toBeGreaterThan(0)
    expect(BUNDLED_EXCEPTIONAL_AUDIO_NAMES.filter((name) => !audioNames.has(name))).toEqual([])
    expect(new Set(BUNDLED_EXCEPTIONAL_AUDIO_NAMES).size).toBe(BUNDLED_EXCEPTIONAL_AUDIO_NAMES.length)
  })

  it('holds Cinder Storm, chosen by ear whatever it scores', () => {
    expect(BUNDLED_EXCEPTIONAL_AUDIO_NAMES).toContain('Cinder Storm')
  })
})

describe('starterShowPatterns', () => {
  const show = starterShowPatterns()

  it('is a show-sized head of the list, in its order, Cinder Storm included', () => {
    expect(show).toHaveLength(STARTER_SHOW_SIZE)
    expect(STARTER_SHOW_SIZE).toBeLessThanOrEqual(MAX_FIRMWARE_PATTERNS)
    expect(show.map((pattern) => pattern.name)).toContain('Cinder Storm')
    const ranks = show.map((pattern) => BUNDLED_EXCEPTIONAL_AUDIO_NAMES.indexOf(pattern.name))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(ranks).not.toContain(-1)
  })

  it('passes over patterns made for a string alone, because the starters play on a matrix', () => {
    for (const pattern of show) {
      const tags = patternFormTags(pattern.bestOn)
      expect(tags.length === 0 || tags.includes('matrix'), pattern.name).toBe(true)
    }
  })
})
