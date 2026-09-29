import { describe, expect, it } from 'vitest'
import {
  clampPaletteBankIndex,
  nblendPaletteBytes,
  paletteBankBlendTicks,
  paletteBankTable,
  PALETTE_BANK_FALLBACK,
  paletteBankEntries,
  paletteBankLabel,
  paletteBankSelection,
  movePaletteBankEntry,
  stepPaletteBankIndex,
} from '../paletteBank'
import { evaluateGraphFull, evaluateScalarSeries } from '../graphEvaluator'
import { useHardwareInputStore } from '../hardwareInputStore'
import { touchControlPlan } from '../wireFirstControls'
import { exposedNodeInputs } from '../propertyInputs'
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

describe('reordering the bank', () => {
  it('moves an entry to the dropped position', () => {
    expect(movePaletteBankEntry(['ocean', 'lava', 'forest'], 2, 0))
      .toEqual(['forest', 'ocean', 'lava'])
    expect(movePaletteBankEntry(['ocean', 'lava', 'forest'], 0, 2))
      .toEqual(['lava', 'forest', 'ocean'])
  })

  it('leaves the order alone when nothing moved', () => {
    const bank = ['ocean', 'lava']
    expect(movePaletteBankEntry(bank, 1, 1)).toEqual(bank)
    expect(movePaletteBankEntry(['ocean'], 0, 1)).toEqual(['ocean'])
    expect(movePaletteBankEntry([], 0, 0)).toEqual([])
  })

  it('reads a drop past the end as the end', () => {
    // The gesture means "last", so it is clamped rather than refused.
    expect(movePaletteBankEntry(['ocean', 'lava', 'forest'], 0, 9))
      .toEqual(['lava', 'forest', 'ocean'])
    expect(movePaletteBankEntry(['ocean', 'lava', 'forest'], 2, -4))
      .toEqual(['forest', 'ocean', 'lava'])
  })

  it('never drops or duplicates a palette', () => {
    const bank = ['ocean', 'lava', 'forest', 'ice']
    for (let from = 0; from < bank.length; from++) {
      for (let to = 0; to < bank.length; to++) {
        const moved = movePaletteBankEntry(bank, from, to)
        expect([...moved].sort(), `${from}->${to}`).toEqual([...bank].sort())
      }
    }
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

describe('driving a bank from a touch control', () => {
  it('accepts a control on Next and Previous, as a momentary button', () => {
    // A wire dropped from the Touch node's add-control socket reaches a port
    // through a backing property or through `actionInputs`; Next has no
    // property behind it, so without that declaration the drop is refused and
    // the gesture reads as broken.
    for (const port of ['next', 'previous']) {
      const plan = touchControlPlan('PaletteBank', port, {}, false)
      expect(plan.ok, port).toBe(true)
      // A press, never a latch: a Toggle would keep saying "pressed" after the
      // finger left and step the bank every frame.
      if (plan.ok) expect(plan.spec.type, port).toBe('Button')
    }
  })

  it('keeps both sockets drawn by default', () => {
    // Declaring an action input takes its socket out of the always-drawn rows,
    // so the node would silently lose the two ports it is steered by if they
    // were not also exposed by default.
    expect(exposedNodeInputs('PaletteBank', undefined, new Set()).map((port) => port.id))
      .toEqual(['next', 'previous'])
  })

  it('still refuses a control on an input that takes a signal', () => {
    // The bank's own outputs are not controls, and neither is a palette wire.
    expect(touchControlPlan('PaletteBank', 'palette', {}, false).ok).toBe(false)
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
      node('btn', 'ButtonInput', {}),
    ]
    const edges = [edge('e', 'btn', 'bank', 'pressed', 'next')]
    useHardwareInputStore.getState().setButton('btn', true)
    // Ticks are frames, so these are 0s / 0.1s / 0.2s / 0.3s. Held from the
    // first one: the press lands once the 30ms debounce window has passed, and
    // the frames in between do not each count as one.
    expect(evaluateScalarSeries(nodes, edges, 'bank', 'index', [0, 6, 12, 18]))
      .toEqual([0, 1, 1, 1])
    useHardwareInputStore.getState().setButton('btn', false)
  })

  it('wraps back to the first palette rather than running off the end', () => {
    const nodes = [
      node('bank', 'PaletteBank', { palettes: ['ocean', 'lava'] }),
      node('btn', 'ButtonInput', {}),
    ]
    const edges = [edge('e', 'btn', 'bank', 'pressed', 'next')]
    useHardwareInputStore.getState().setButton('btn', true)
    // Held past the 400ms repeat delay, which steps it off the end of a
    // two-palette bank and round to the front again.
    expect(evaluateScalarSeries(nodes, edges, 'bank', 'index', [0, 6, 36]))
      .toEqual([0, 1, 0])
    useHardwareInputStore.getState().setButton('btn', false)
  })

  it('takes a computed one-frame pulse whole, so an Interval steps the bank', () => {
    // Interval is true for a single frame. Under the 30ms contact debounce
    // that frame was gone before it could count, and the bank never moved.
    const nodes = [
      node('bank', 'PaletteBank', BANK),
      node('tick', 'Interval', { interval: 0.5 }),
    ]
    const edges = [edge('e', 'tick', 'bank', 'pulse', 'next')]
    const frames = Array.from({ length: 121 }, (_, frame) => frame)
    const index = evaluateScalarSeries(nodes, edges, 'bank', 'index', frames)
    expect(index[29]).toBe(0)
    expect(index[30]).toBe(1)
    expect(index[60]).toBe(2)
    expect(index[90]).toBe(0)
    expect(index[120]).toBe(1)
  })

  it('leaves the cursor alone with nothing wired to it', () => {
    const nodes = [node('bank', 'PaletteBank', BANK)]
    expect(evaluateScalarSeries(nodes, [], 'bank', 'index', [0, 60, 300])).toEqual([0, 0, 0])
  })
})

describe('blending a Palette Bank change', () => {
  it('steps bytes the way FastLED\'s nblendPaletteTowardPalette does', () => {
    // Up by one, down by up to two, from the first byte, until maxChanges
    // bytes have moved.
    const current = new Uint8Array(48)
    const target = new Uint8Array(48)
    current.set([10, 10, 10, 10]); target.set([12, 10, 5, 9])
    nblendPaletteBytes(current, target, 2)
    expect([...current.slice(0, 4)]).toEqual([11, 10, 8, 10])
    nblendPaletteBytes(current, target, 48)
    expect([...current.slice(0, 4)]).toEqual([12, 10, 6, 9])
    nblendPaletteBytes(current, target, 48)
    expect([...current.slice(0, 4)]).toEqual([12, 10, 5, 9])
  })

  it('counts 10 ms ticks and restarts after a stall', () => {
    expect(paletteBankBlendTicks(0, 35)).toEqual({ ticks: 3, lastMs: 30 })
    expect(paletteBankBlendTicks(0, 5000)).toEqual({ ticks: 32, lastMs: 5000 })
  })

  it('eases from one palette to the next instead of cutting', () => {
    const nodes = [
      node('bank', 'PaletteBank', { palettes: ['ocean', 'lava'], blend: 24 }),
      node('tick', 'Interval', { interval: 0.5 }),
    ]
    const edges = [edge('e', 'tick', 'bank', 'pulse', 'next')]
    const bytes = (value: unknown) => (value as { r: number; g: number; b: number }[]).flatMap((c) => [c.r, c.g, c.b])
    const ocean = [...paletteBankTable('ocean')], lava = [...paletteBankTable('lava')]
    const palettes = Array.from({ length: 60 }, (_, tick) =>
      bytes(evaluateGraphFull(nodes, edges, tick, 16, 16).outputs.get('bank')!.palette))
    expect(palettes[0]).toEqual(ocean)
    // Half a second in, the press lands, and the palette is on its way.
    const moving = palettes[45]
    expect(moving).not.toEqual(ocean)
    expect(moving).not.toEqual(lava)
    // It keeps moving toward lava, one 10 ms step at a time.
    const distance = (palette: number[]) => palette.reduce((sum, value, i) => sum + Math.abs(value - lava[i]), 0)
    expect(distance(palettes[59])).toBeLessThan(distance(palettes[45]))
    expect(distance(palettes[45])).toBeLessThan(distance(ocean))
  })
})
