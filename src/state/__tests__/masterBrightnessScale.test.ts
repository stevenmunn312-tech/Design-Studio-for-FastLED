// Master brightness is the Board's, on FastLED's native 0-255.
//
// The LED output node also offered a `brightness` slider, which resolved
// through the shared 0-1 `brightness` meta — so it wrote a frame-scale value
// into the field the Board migration reads as 0-255. 0.85 became 1, and
// ensureRootBoardNode re-applied it on every load. On a bench that was a black
// preview and a strip showing only its strongest channel: two symptoms that
// looked nothing like each other and were one number.

import { describe, it, expect } from 'vitest'
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

describe('reading a pre-Board output', () => {
  const fromOutput = (properties: Record<string, unknown>) =>
    controllerSettings([node('out', 'MatrixOutput', properties)]).brightness

  it('keeps a genuine 0-255 value', () => {
    expect(fromOutput({ brightness: 200 })).toBe(200)
    expect(fromOutput({ brightness: 128 })).toBe(128)
  })

  // The regression: 0.85 read as 0-255 rounds to 1, which is off in practice.
  it('rescales a value the old 0-1 slider wrote', () => {
    expect(fromOutput({ brightness: 0.85 })).toBe(217)
    expect(fromOutput({ brightness: 1 })).toBe(255)
  })

  // A fraction genuinely near zero stays near zero — the point is that an
  // ordinary setting cannot collapse to the 1 that read as a dead panel.
  it('never yields the near-black value that caused this', () => {
    for (const stored of [0.1, 0.5, 0.85, 1]) {
      expect(fromOutput({ brightness: stored }), `stored ${stored}`).toBeGreaterThan(1)
    }
  })

  it('leaves an explicit off alone', () => {
    expect(fromOutput({ brightness: 0 })).toBe(0)
  })

  it('falls back to the default when the output says nothing', () => {
    expect(fromOutput({})).toBe(128)
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
    // Only the legacy path guesses at scale. A Board value is already 0-255.
    expect(controllerSettings([node('board', 'Board', { brightness: 1 })]).brightness).toBe(1)
  })
})
