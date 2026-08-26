import { describe, it, expect, beforeEach } from 'vitest'
import { bakePatternThumbnails, renderPatternForThumbnail } from '../bakePatternThumbnails'
import { resetEvaluatorState, type GroupRegistry } from '../../state/graphEvaluator'
import {
  thumbnailPixel, THUMBNAIL_W, THUMBNAIL_H, THUMBNAIL_SUPERSAMPLE, THUMBNAIL_TICK_SEC,
  MAX_THUMBNAILS, type PatternThumbnail,
} from '../../state/patternThumbnail'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'pattern', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

/** A group that fills with one flat colour. */
const solidGroup = (r: number, g: number, b: number) => ({
  nodes: [node('c', 'SolidColor', { r, g, b }), node('o', 'GroupOutput')],
  edges: [edge('e', 'c', 'frame', 'o', 'frame')],
})

const GROUPS: GroupRegistry = {
  white: solidGroup(255, 255, 255),
  black: solidGroup(0, 0, 0),
  grey: solidGroup(128, 128, 128),
} as GroupRegistry

const litCount = (t: PatternThumbnail) => {
  let n = 0
  for (let y = 0; y < THUMBNAIL_H; y++) for (let x = 0; x < THUMBNAIL_W; x++) if (thumbnailPixel(t, x, y)) n++
  return n
}

describe('rendering a pattern for its thumbnail', () => {
  beforeEach(() => resetEvaluatorState())

  it('renders at the supersampled size, not the thumbnail size', () => {
    // The 2x render is what the downsample averages; asking the evaluator for
    // 32x32 directly would throw away the detail the dither needs.
    const frame = renderPatternForThumbnail('white', GROUPS, true)!
    expect(frame).not.toBeNull()
    expect(frame.length).toBe(THUMBNAIL_H * THUMBNAIL_SUPERSAMPLE)
    expect(frame[0].length).toBe(THUMBNAIL_W * THUMBNAIL_SUPERSAMPLE)
  })

  it('returns null for a pattern the collection names but no longer has', () => {
    expect(renderPatternForThumbnail('deleted', GROUPS, true)).toBeNull()
  })

  // Fixed, because a thumbnail that changed between two exports of the same
  // collection is indistinguishable from a pattern someone edited.
  it('bakes at one tick, so the same pattern bakes the same picture', () => {
    const once = renderPatternForThumbnail('grey', GROUPS, true)!
    resetEvaluatorState()
    const twice = renderPatternForThumbnail('grey', GROUPS, true)!
    expect(once[0][0]).toEqual(twice[0][0])
    expect(THUMBNAIL_TICK_SEC).toBeGreaterThan(0)
  })
})

describe('baking a collection', () => {
  beforeEach(() => resetEvaluatorState())

  it('keeps the collection order and names each pattern by id', () => {
    const baked = bakePatternThumbnails(['white', 'black', 'grey'], GROUPS, true)
    expect(baked.issue).toBeNull()
    expect(baked.thumbnails.map((entry) => entry.groupId)).toEqual(['white', 'black', 'grey'])
  })

  it('bakes what each pattern actually looks like', () => {
    const [white, black, grey] = bakePatternThumbnails(['white', 'black', 'grey'], GROUPS, true).thumbnails
    expect(litCount(white.thumbnail)).toBe(THUMBNAIL_W * THUMBNAIL_H)
    expect(litCount(black.thumbnail)).toBe(0)
    expect(litCount(grey.thumbnail)).toBeGreaterThan(0)
    expect(litCount(grey.thumbnail)).toBeLessThan(THUMBNAIL_W * THUMBNAIL_H)
  })

  // A blank square is a better answer than a failed export, but the caller has
  // to be able to tell it apart from a pattern that is genuinely dark.
  it('marks a missing pattern rather than dropping or faking it', () => {
    const baked = bakePatternThumbnails(['white', 'deleted'], GROUPS, true)
    expect(baked.thumbnails).toHaveLength(2)
    expect(baked.thumbnails[1]).toMatchObject({ groupId: 'deleted', missing: true })
    expect(litCount(baked.thumbnails[1].thumbnail)).toBe(0)
    expect(baked.thumbnails[0].missing).toBe(false)
  })

  it('bakes nothing at all when the collection is over budget', () => {
    const ids = Array.from({ length: MAX_THUMBNAILS + 1 }, () => 'white')
    const baked = bakePatternThumbnails(ids, GROUPS, true)
    // Half a set of pictures is worse than none: the patterns without one look
    // broken rather than like the ones that ran out of flash.
    expect(baked.thumbnails).toEqual([])
    expect(baked.issue).toMatch(/thumbnails/i)
  })

  it('bakes an empty collection to nothing, without complaint', () => {
    expect(bakePatternThumbnails([], GROUPS, true)).toEqual({ thumbnails: [], issue: null })
  })
})

describe('the trust boundary', () => {
  beforeEach(() => resetEvaluatorState())

  // Custom Formula rather than Code: Code's sandbox is async, so its first tick
  // is blank whether or not it was allowed to run — a test built on it passes
  // with trust propagation removed, which is a test asserting nothing. This one
  // was written that way first and caught by breaking the propagation on purpose.
  const formulaGroups = {
    formula: {
      nodes: [
        node('f', 'CustomFormula', { formula: '1', a: 0, b: 0, palette: 'rainbow' }),
        node('o', 'GroupOutput'),
      ],
      edges: [edge('e', 'f', 'frame', 'o', 'frame')],
    },
  } as unknown as GroupRegistry

  // evaluateGraph trusts its caller unless told otherwise, and a bake evaluates
  // whatever a collected pattern contains. An untrusted workspace must not get
  // its formula run because someone pressed export.
  it('does not evaluate an untrusted pattern body', () => {
    const trusted = bakePatternThumbnails(['formula'], formulaGroups, true).thumbnails[0]
    expect(litCount(trusted.thumbnail), 'the formula must draw when trusted').toBeGreaterThan(0)

    resetEvaluatorState()
    const untrusted = bakePatternThumbnails(['formula'], formulaGroups, false).thumbnails[0]
    expect(litCount(untrusted.thumbnail)).toBe(0)
  })

  it('threads trust per bake rather than remembering it', () => {
    const baked = bakePatternThumbnails(['white'], GROUPS, false).thumbnails[0]
    // SolidColor is not gated by trust, so an untrusted bake of it still draws.
    expect(litCount(baked.thumbnail)).toBe(THUMBNAIL_W * THUMBNAIL_H)
  })
})
