import { describe, it, expect } from 'vitest'
import {
  PATTERN_FORM_TAGS,
  formTagForOutputForm,
  needsTwoDimensions,
  patternFit,
  patternFormTags,
} from '../patternTags'
import { LED_OUTPUT_FORMS } from '../ledOutputForm'
import type { StudioNode } from '../graphStore'

function node(nodeType: string): StudioNode {
  return {
    id: nodeType, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties: {}, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function pattern(types: string[], bestOn?: unknown) {
  return { bestOn, subgraph: { nodes: types.map(node) } }
}

describe('pattern form tags', () => {
  it('maps every LED output form onto a tag', () => {
    for (const form of LED_OUTPUT_FORMS) {
      const tag = formTagForOutputForm(form)
      expect(PATTERN_FORM_TAGS.some((entry) => entry.id === tag)).toBe(true)
    }
  })

  it('reads a corkscrew as a ring and a HUB75 panel as a matrix', () => {
    expect(formTagForOutputForm('corkscrew')).toBe('ring')
    expect(formTagForOutputForm('ring')).toBe('ring')
    expect(formTagForOutputForm('hub75')).toBe('matrix')
    expect(formTagForOutputForm('matrix')).toBe('matrix')
    expect(formTagForOutputForm('strip')).toBe('string')
  })

  it('discards junk tags from a hand-edited pattern file', () => {
    expect(patternFormTags(['string', 'nonsense', 7, null])).toEqual(['string'])
    expect(patternFormTags('string')).toEqual([])
    expect(patternFormTags(undefined)).toEqual([])
  })

  it('orders tags by the tag list, not by the file', () => {
    expect(patternFormTags(['ring', 'string'])).toEqual(['string', 'ring'])
    expect(patternFormTags(['string', 'string', 'ring'])).toEqual(['string', 'ring'])
  })
})

describe('patternFit', () => {
  it('leaves an untagged ordinary pattern usable on every output', () => {
    const juggle = pattern(['Juggle', 'HueCycle'])
    expect(patternFit(juggle, 'string')).toBe('works')
    expect(patternFit(juggle, 'matrix')).toBe('works')
    expect(patternFit(juggle, 'ring')).toBe('works')
  })

  it('promotes the outputs the author named without demoting the rest', () => {
    const tagged = pattern(['Juggle'], ['string'])
    expect(patternFit(tagged, 'string')).toBe('best')
    expect(patternFit(tagged, 'matrix')).toBe('works')
    expect(patternFit(tagged, 'ring')).toBe('works')
  })

  it('calls a two-dimensional form a poor fit for a line or a circle', () => {
    const clock = pattern(['ClockDisplay'])
    expect(patternFit(clock, 'string')).toBe('poor')
    expect(patternFit(clock, 'ring')).toBe('poor')
    expect(patternFit(clock, 'matrix')).toBe('works')
  })

  it('lets the author overrule the derivation for the output they named', () => {
    const clock = pattern(['ClockDisplay'], ['string'])
    expect(patternFit(clock, 'string')).toBe('best')
    // ...and only for that one: nobody has vouched for it on a ring.
    expect(patternFit(clock, 'ring')).toBe('poor')
  })

  it('does not treat a field or noise pattern as two-dimensional', () => {
    // A plasma sampled along one row is still a plasma. Only content that has
    // no one-line reading at all belongs in the derived set.
    for (const type of ['FieldNoise', 'Fire2012', 'Particles', 'SpectrumBars', 'ReactionDiffusion']) {
      expect(needsTwoDimensions([node(type)])).toBe(false)
    }
  })
})
