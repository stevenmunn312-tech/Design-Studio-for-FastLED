// Master brightness is the Board's, on FastLED's native 0-255.
//
// LED-output brightness is per-fixture runtime state; controller brightness is
// the Board's global FastLED setting. The names and scales remain separate.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { controllerSettings, DEFAULT_CONTROLLER_SETTINGS } from '../controllerSettings'
import { propertyGroupsFor, propertyMeta, NODE_LIBRARY } from '../nodeLibrary'
import type { StudioNode } from '../graphStore'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}) =>
  ({ id, type: 'studioNode', position: { x: 0, y: 0 },
     data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] } }) as unknown as StudioNode

describe('who owns master brightness', () => {
  it('is not offered on the LED output', () => {
    const groups = propertyGroupsFor('MatrixOutput')
    expect(groups, 'the LED output should still have grouped properties').not.toBeNull()
    const keys = (groups ?? []).flatMap((group) => group.keys)
    expect(keys, 'the Board owns master brightness; two controls meant two scales')
      .not.toContain('brightness')
  })

  // The Board draws its own slider in BoardNodeBody rather than through a
  // property group, so the meta is what has to carry the scale.
  it('resolves the Board to the 0-255 scale FastLED uses', () => {
    expect(propertyMeta('Board', 'brightness')).toMatchObject({ min: 0, max: 255 })
  })

  // The shared meta is a 0-1 frame scale, and is what the output slider used
  // to fall through to. Keeping them distinct is the whole fix.
  it('keeps the shared frame-scale meta separate from it', () => {
    // FieldToFrame takes no override, so it resolves to the shared meta.
    expect(propertyMeta('FieldToFrame', 'brightness')).toMatchObject({ min: 0, max: 1 })
  })

  it('defaults to 128 on the Board node itself', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'Board')
    expect(def?.defaultProperties?.brightness).toBe(128)
    expect(DEFAULT_CONTROLLER_SETTINGS.brightness).toBe(128)
  })
})

describe('a graph with a Board', () => {
  it('reads the Board and ignores anything on the output', () => {
    const nodes = [
      node('board', 'Board', { brightness: 90 }),
      node('out', 'MatrixOutput', { brightness: 0.85 }),
    ]
    expect(controllerSettings(nodes).brightness).toBe(90)
  })

  it('takes the Board at its word, including a deliberately tiny value', () => {
    // A Board value is already on the 0-255 controller scale.
    expect(controllerSettings([node('board', 'Board', { brightness: 1 })]).brightness).toBe(1)
  })
})

// Removing the control is not enough on its own. "Set Default" persists a
// node type's properties to localStorage, which outlives the project that
// created them — so a default saved from the old 0-1 slider puts a frame-scale
// brightness on every new LED output, in a brand new project, forever.
describe('a personal default saved from the old slider', () => {
  const KEY = 'design-studio-for-fastled.node-defaults.v1'

  // These reload the module to exercise its load-time sanitise, so the registry
  // has to be put back or a later test in this file gets a half-reset one.
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('does not survive onto new LED outputs', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      MatrixOutput: { brightness: 0.85, chipset: 'WS2812B', colorOrder: 'GRB' },
    }))
    vi.resetModules()
    const { useNodeDefaults } = await import('../nodeDefaults')
    const saved = useNodeDefaults.getState().overrides.MatrixOutput

    expect(saved, 'the rest of the saved default must survive').toMatchObject({
      chipset: 'WS2812B', colorOrder: 'GRB',
    })
    expect(saved).not.toHaveProperty('brightness')
  })

  it('leaves other node types alone', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      BrightnessMod: { brightness: 0.85 },
    }))
    vi.resetModules()
    const { useNodeDefaults } = await import('../nodeDefaults')
    // BrightnessMod's brightness is its own 0-3 frame scale, not the Board's.
    expect(useNodeDefaults.getState().overrides.BrightnessMod).toMatchObject({ brightness: 0.85 })
  })
})
