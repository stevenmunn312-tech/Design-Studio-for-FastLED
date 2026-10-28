import { describe, it, expect } from 'vitest'
import {
  NODE_LIBRARY, PROPERTY_DESCRIPTIONS_OVERRIDES, PROPERTY_GROUPS, PROPERTY_LABELS, SUBCATEGORY_ORDER, categoryNodes, propertyLabel,
} from '../nodeLibrary'
import { editableProperties } from '../../components/Canvas/studioNodeChrome'

/*
 * The node lock-in (todo D-08.7): once a node's labels, groups and layout
 * are frozen, the Help reference can describe them once. These tests hold
 * the rules the sweep established so a new property or node cannot quietly
 * fall back to a raw key or a flat thirty-row list.
 */

/** The rows a node draws at its library defaults, as the canvas does. */
function defaultRows(type: string): string[] {
  const def = NODE_LIBRARY.find((n) => n.type === type)!
  return editableProperties(type, { ...(def.defaultProperties ?? {}) }).map(([key]) => key)
}

// The categories the sweep covered. Patterns are swept by subcategory so the
// generative and audio-reactive bundles can follow when their turn comes.
const SWEPT_CATEGORIES = new Set(['composite', 'field', 'show', 'output', 'math', 'input'])
const SWEPT_SUBCATEGORIES = new Set(['Shapes & Text', 'Simulations', 'Audio-Reactive'])

describe('property labels', () => {
  it('names every camelCase row on the swept nodes', () => {
    const raw: string[] = []
    for (const node of NODE_LIBRARY) {
      if (!SWEPT_CATEGORIES.has(node.category) && !SWEPT_SUBCATEGORIES.has(node.subcategory ?? '')) continue
      const props = { ...(node.defaultProperties ?? {}) }
      for (const key of defaultRows(node.type)) {
        if (/[A-Z]/.test(key) && propertyLabel(node.type, key, props) === key) raw.push(`${node.type}.${key}`)
      }
    }
    expect(raw).toEqual([])
  })

  it('keeps the shared reactivity label beside a node\'s own labels', () => {
    // Kick Shock's own entries used to replace the audio-reactive map's, so
    // `energy` fell back to its key on the nodes that had the most labels.
    expect(PROPERTY_LABELS.KickShock.energy).toBe('reactivity')
    expect(PROPERTY_LABELS.KickShock.decay).toBe('lifetime ×')
    expect(PROPERTY_LABELS.RainRipples.energy).toBe('reactivity')
  })

  it('labels the player and slideshow timing in seconds', () => {
    expect(propertyLabel('PatternMaster', 'minTime')).toBe('min hold (s)')
    expect(propertyLabel('PatternMaster', 'maxTime')).toBe('max hold (s)')
    expect(propertyLabel('PatternMaster', 'transitionSec')).toBe('fade (s)')
    expect(propertyLabel('PatternSlideshow', 'minTime')).toBe('min hold (s)')
    expect(propertyLabel('PatternSlideshow', 'maxTime')).toBe('max hold (s)')
    expect(propertyLabel('PatternSlideshow', 'transitionSec')).toBe('fade (s)')
  })

  it('names each zone\'s rows after the field, since the group names the zone', () => {
    expect(propertyLabel('Zones', 'aEnabled')).toBe('enabled')
    expect(propertyLabel('Zones', 'dW')).toBe('width')
  })
})

describe('property groups', () => {
  it('groups every node that draws more than six rows at its defaults', () => {
    const flat = NODE_LIBRARY
      .filter((node) => defaultRows(node.type).length > 6 && !PROPERTY_GROUPS[node.type])
      .map((node) => `${node.type} (${defaultRows(node.type).length})`)
    expect(flat).toEqual([])
  })

  it('lists only keys the node has, each in one group', () => {
    for (const [type, groups] of Object.entries(PROPERTY_GROUPS)) {
      const def = NODE_LIBRARY.find((n) => n.type === type)
      if (!def) continue
      const known = new Set([
        ...Object.keys(def.defaultProperties ?? {}),
        // Sequence and the collection row settings are edited in the node body
        // and stored only when they differ from the default, so they are absent
        // from defaultProperties and still belong in the help groups.
        ...Object.keys(PROPERTY_DESCRIPTIONS_OVERRIDES[type] ?? {}),
      ])
      const seen = new Set<string>()
      for (const group of groups) {
        for (const key of group.keys) {
          expect(known.has(key), `${type}.${key} is not a property`).toBe(true)
          expect(seen.has(key), `${type}.${key} is in two groups`).toBe(false)
          seen.add(key)
        }
      }
    }
  })

  it('leads with the master controls rather than trailing them ungrouped', () => {
    expect(PROPERTY_GROUPS.PatternMaster[0]).toEqual({ key: 'playback', label: 'Playback', keys: ['volume', 'order', 'sequence'] })
    expect(PROPERTY_GROUPS.MatrixOutput[0]).toEqual({ key: 'output', label: 'Output', keys: ['enabled', 'outputBrightness'] })
    expect(PROPERTY_GROUPS.ColorTrails[0].keys).toEqual(['bass', 'mids', 'treble'])
  })

  it('gives Formula Field one group per formula so the unused ones drop out', () => {
    const def = NODE_LIBRARY.find((n) => n.type === 'FormulaField')!
    const rose = new Set(editableProperties('FormulaField', { ...def.defaultProperties, formulaType: 'rose' }).map(([k]) => k))
    const shown = PROPERTY_GROUPS.FormulaField
      .filter((group) => group.keys.some((key) => rose.has(key)))
      .map((group) => group.label)
    expect(shown).toEqual(['Formula', 'Rose'])
  })
})

describe('sidebar order', () => {
  it('tags every node of a sub-headed category with a listed subcategory', () => {
    const untagged: string[] = []
    for (const [category, subs] of Object.entries(SUBCATEGORY_ORDER)) {
      for (const node of NODE_LIBRARY) {
        if (node.category !== category) continue
        if (!subs.includes(node.subcategory ?? '')) untagged.push(`${node.type} (${node.subcategory ?? 'none'})`)
      }
    }
    expect(untagged).toEqual([])
  })

  it('reads Math & Logic as Math, then Logic, then Text', () => {
    const subs = categoryNodes('math').map((node) => node.subcategory)
    expect([...new Set(subs)]).toEqual(['Math', 'Logic', 'Text'])
  })

  it('places the slideshow beside the player in the show flow', () => {
    const types = categoryNodes('show').map((node) => node.type)
    expect(types.indexOf('PatternSlideshow')).toBe(types.indexOf('PatternMaster') + 1)
  })
})
