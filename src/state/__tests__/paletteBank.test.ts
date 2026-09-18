import { describe, expect, it } from 'vitest'
import {
  clampPaletteBankIndex,
  PALETTE_BANK_FALLBACK,
  paletteBankEntries,
  paletteBankLabel,
  paletteBankSelection,
  stepPaletteBankIndex,
} from '../paletteBank'
import { evaluateScalarSeries } from '../graphEvaluator'
import type { StudioEdge, StudioNode } from '../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, category: 'color', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, sh: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

describe('paletteBankEntries', () => {
  it('keeps only catalogue palettes, in the order they were ticked', () => {
    // The ids become `paldef_<id>` in generated C++, and an imported workspace
    // can carry anything at all — so the bank is resolved against the
    // catalogue rather than trusted.
    expect(paletteBankEntries({ palettes: ['ocean', 'not-a-palette', 'lava'] }))
      .toEqual(['ocean', 'lava'])
    expect(paletteBankEntries({ palettes: ['OCEAN', ' lava '] })).toEqual(['ocean', 'lava'])
    expect(paletteBankEntries({ palettes: [7, null, {}] })).toEqual([])
    expect(paletteBankEntries({ palettes: 'ocean' })).toEqual([])
    expect(paletteBankEntries({})).toEqual([])
  })

  it('drops a palette ticked twice', () => {
    // The index is a position in this list, so a repeat would make Next stop on
    // the same palette twice with no way to tell the two apart.
    expect(paletteBankEntries({ palettes: ['ocean', 'lava', 'ocean'] })).toEqual(['ocean', 'lava'])
  })
})

describe('the bank cursor', () => {
  it('wraps at both ends', () => {
    expect(stepPaletteBankIndex(2, 3, 1)).toBe(0)
    expect(stepPaletteBankIndex(0, 3, -1)).toBe(2)
    expect(stepPaletteBankIndex(0, 1, 1)).toBe(0)
  })

  it('answers 0 rather than dividing by an empty bank', () => {
    expect(stepPaletteBankIndex(0, 0, 1)).toBe(0)
    expect(clampPaletteBankIndex(4, 0)).toBe(0)
  })

  it('holds a cursor left past the end when the bank shrinks', () => {
    // Unticking a palette shortens the list under a cursor that may be past it.
    expect(clampPaletteBankIndex(5, 2)).toBe(1)
    expect(paletteBankSelection(['ocean', 'lava'], 5)).toBe('lava')
  })

  it('reports the library default for an empty bank', () => {
    expect(paletteBankSelection([], 0)).toBe(PALETTE_BANK_FALLBACK)
    expect(PALETTE_BANK_FALLBACK).toBe('rainbow')
  })

  it('names a palette the way the catalogue does', () => {
    expect(paletteBankLabel('cottoncandy')).toBe('Cotton Candy')
  })
})

describe('PaletteBank in the evaluator', () => {
  const BANK = { palettes: ['ocean', 'lava', 'forest'] }

  it('advances once per press, not once per frame the button is held', () => {
    // The bug this prevents only ever shows on hardware: a finger resting on
    // Next would run the whole bank past in a second. `buttonEdge` owns the
    // rule, and the bank has to be asking it rather than reading the level.
    const nodes = [
      node('bank', 'PaletteBank', BANK),
      node('btn', 'Compare', { a: 1, b: 0 }),
    ]
    const edges = [edge('e', 'btn', 'bank', 'result', 'next')]
    // Ticks are frames, so these are 0s / 0.1s / 0.2s / 0.3s. Held from the
    // first one: the press lands once the 30ms debounce window has passed, and
    // the frames in between do not each count as one.
    expect(evaluateScalarSeries(nodes, edges, 'bank', 'index', [0, 6, 12, 18]))
      .toEqual([0, 1, 1, 1])
  })

  it('wraps back to the first palette rather than running off the end', () => {
    const nodes = [
      node('bank', 'PaletteBank', { palettes: ['ocean', 'lava'] }),
      node('btn', 'Compare', { a: 1, b: 0 }),
    ]
    const edges = [edge('e', 'btn', 'bank', 'result', 'next')]
    // Held past the 400ms repeat delay, which steps it off the end of a
    // two-palette bank and round to the front again.
    expect(evaluateScalarSeries(nodes, edges, 'bank', 'index', [0, 6, 36]))
      .toEqual([0, 1, 0])
  })

  it('leaves the cursor alone with nothing wired to it', () => {
    const nodes = [node('bank', 'PaletteBank', BANK)]
    expect(evaluateScalarSeries(nodes, [], 'bank', 'index', [0, 60, 300])).toEqual([0, 0, 0])
  })
})
