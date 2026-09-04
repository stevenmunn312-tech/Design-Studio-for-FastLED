import { describe, it, expect } from 'vitest'
import { compositeTransition, type Frame } from '../graphEvaluator'
import { PROPERTY_META } from '../nodeLibrary'
import { SHOW_TRANSITIONS } from '../../codegen/performanceGenerator'
import { TRANSITION_HELPER_CPP, transitionHelperCpp } from '../../codegen/transitionHelperCpp'

const solid = (W: number, H: number, r: number, g: number, b: number): Frame =>
  Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r, g, b })))

const lit = (f: Frame) => f.flat().filter((p) => p.r + p.g + p.b > 0).length
const equalFrames = (a: Frame, b: Frame) => JSON.stringify(a) === JSON.stringify(b)

const maxChannelDiff = (f: Frame, g: Frame) => Math.max(...f.flatMap((row, y) =>
  row.flatMap((p, x) => {
    const q = g[y][x]
    return [Math.abs(p.r - q.r), Math.abs(p.g - q.g), Math.abs(p.b - q.b)]
  })))

// A and B are deliberately distinguishable per-pixel so an endpoint check can
// tell "landed on B" from "landed on B mirrored" — the failure mode a card
// flip has by construction, since the back face is the mirror of the front.
function gradient(W: number, H: number, tint: 'red' | 'green'): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => tint === 'red'
      ? { r: 40 + (x * 9) % 200, g: 10, b: 20 + (y * 7) % 200 }
      : { r: 10, g: 40 + (x * 9) % 200, b: 20 + (y * 7) % 200 }))
}

const SIZES: [number, number][] = [[16, 16], [64, 32], [8, 32], [300, 1]]

describe('3D transitions', () => {
  const STYLES = ['dolly', 'flip', 'cube', 'door', 'tilt']

  describe.each(STYLES)('%s', (style) => {
    it.each(SIZES)('lands exactly on A at t=0 and B at t=1 (%ix%i)', (W, H) => {
      const a = gradient(W, H, 'red'), b = gradient(W, H, 'green')
      expect(equalFrames(compositeTransition(style, a, b, 0, W, H), a)).toBe(true)
      expect(equalFrames(compositeTransition(style, a, b, 1, W, H), b)).toBe(true)
    })

    // The endpoint guards are a fast path, not the mechanism: the maths has to
    // arrive at the same place on its own, or preview and firmware part company
    // at the ends, where the generators have a runtime t and cannot branch. It
    // converges rather than lands, for two reasons: depth shading is continuous,
    // so a hair short of the end a surface is still a fraction of a percent dim,
    // and bilinear sampling means a coordinate a hair off a pixel centre really
    // does mix in its neighbour. The probe therefore sits very close to the ends
    // — far enough out to exercise the geometry, near enough that a correct
    // sub-pixel blend rounds away. Loosening the tolerance instead would let a
    // genuinely misplaced sample pass on the wide frames, which is the case that
    // caught the fixed-far-plane bug.
    it.each(SIZES)('converges on the endpoints without the guards (%ix%i)', (W, H) => {
      const a = gradient(W, H, 'red'), b = gradient(W, H, 'green')
      expect(maxChannelDiff(compositeTransition(style, a, b, 1e-6, W, H), a)).toBeLessThanOrEqual(1)
      expect(maxChannelDiff(compositeTransition(style, a, b, 1 - 1e-6, W, H), b)).toBeLessThanOrEqual(1)
    })
  })

  it('narrows the flipping card to nothing at the edge-on midpoint', () => {
    const a = solid(16, 16, 255, 255, 255), b = solid(16, 16, 255, 255, 255)
    expect(lit(compositeTransition('flip', a, b, 0.5, 16, 16))).toBe(0)
  })

  it('shrinks the card monotonically into the midpoint and back out', () => {
    const a = solid(16, 16, 255, 255, 255), b = solid(16, 16, 255, 255, 255)
    const closing = [0.05, 0.15, 0.25, 0.35, 0.45]
      .map((t) => lit(compositeTransition('flip', a, b, t, 16, 16)))
    const opening = [0.55, 0.65, 0.75, 0.85, 0.95]
      .map((t) => lit(compositeTransition('flip', a, b, t, 16, 16)))
    expect(closing).toEqual([...closing].sort((x, y) => y - x))
    expect(opening).toEqual([...opening].sort((x, y) => x - y))
  })

  it('reads the back face un-mirrored, so the flip ends on B and not its mirror', () => {
    const W = 16, H = 16
    const a = gradient(W, H, 'red'), b = gradient(W, H, 'green')
    const mirrored: Frame = b.map((row) => [...row].reverse())
    const out = compositeTransition('flip', a, b, 0.97, W, H)
    // Close to the end the card nearly fills the frame; the centre column is
    // the part that is certainly on-card at that angle.
    const col = (f: Frame) => f.map((row) => row[Math.floor(W / 2)].g)
    expect(col(out)).toEqual(col(b))
    expect(col(out)).not.toEqual(col(mirrored))
  })

  it('grows the dolly rectangle from a vanishing point', () => {
    const W = 16, H = 16
    const a = solid(W, H, 255, 0, 0), b = solid(W, H, 0, 255, 0)
    const areaOfB = (t: number) =>
      compositeTransition('dolly', a, b, t, W, H).flat().filter((p) => p.g > p.r).length
    const steps = [0.02, 0.2, 0.4, 0.6, 0.8, 0.95].map(areaOfB)
    expect(steps[0]).toBeLessThanOrEqual(4)          // starts sub-pixel
    expect(steps).toEqual([...steps].sort((x, y) => x - y))
    expect(steps[steps.length - 1]).toBeGreaterThan(W * H * 0.5)
  })

  // A fixed far plane put a visible slab of B on screen at t=0 on a wide panel.
  it('starts sub-pixel on a panel far wider than the 16x16 default', () => {
    const W = 128, H = 64
    const a = solid(W, H, 255, 0, 0), b = solid(W, H, 0, 255, 0)
    const out = compositeTransition('dolly', a, b, 0.01, W, H)
    expect(out.flat().filter((p) => p.g > p.r).length).toBeLessThanOrEqual(4)
  })

  it('dims a receding surface and leaves the screen plane unshaded', () => {
    const W = 16, H = 16
    const a = solid(W, H, 200, 200, 200), b = solid(W, H, 200, 200, 200)
    // Mid-flip the card is tilted, so the far half is dimmer than the near half.
    const out = compositeTransition('flip', a, b, 0.3, W, H)
    const row = out[H / 2].filter((p) => p.r > 0).map((p) => p.r)
    expect(row.length).toBeGreaterThan(1)
    expect(Math.min(...row)).toBeLessThan(200)
    expect(Math.max(...row)).toBeLessThanOrEqual(200)
  })


  // Each style is identified by where B appears, not by how much of it there
  // is — a coverage curve alone would pass for any style that ends on B.
  const isB = (p: { r: number; g: number; b: number }) => p.g > p.r

  it('sweeps the cube seam from the right edge to the left', () => {
    const W = 16, H = 16
    const a = solid(W, H, 255, 0, 0), b = solid(W, H, 0, 255, 0)
    // B enters on the side face, so the leftmost B column marches leftward.
    const seam = (t: number) => {
      const row = compositeTransition('cube', a, b, t, W, H)[H / 2]
      return row.findIndex(isB)
    }
    const seams = [0.25, 0.45, 0.65, 0.85].map(seam)
    expect(seams.every((s) => s >= 0)).toBe(true)
    expect(seams).toEqual([...seams].sort((x, y) => y - x))
  })

  it('opens the doors from the centre outward, not from one edge', () => {
    const W = 16, H = 16
    const a = solid(W, H, 255, 0, 0), b = solid(W, H, 0, 255, 0)
    const row = compositeTransition('door', a, b, 0.5, W, H)[H / 2]
    const first = row.findIndex(isB), last = row.length - 1 - [...row].reverse().findIndex(isB)
    expect(first).toBeGreaterThan(0)                 // A still holds the left edge
    expect(last).toBeLessThan(W - 1)                 // and the right
    // The gap straddles the centre rather than sitting off to one side.
    expect(Math.abs((first + last) / 2 - (W - 1) / 2)).toBeLessThanOrEqual(1)
  })

  it('slides the tilt in from the top while the slab stays below', () => {
    const W = 16, H = 16
    const a = solid(W, H, 255, 0, 0), b = solid(W, H, 0, 255, 0)
    const col = compositeTransition('tilt', a, b, 0.5, W, H).map((r) => r[W / 2])
    const firstB = col.findIndex(isB), lastB = col.length - 1 - [...col].reverse().findIndex(isB)
    expect(firstB).toBe(0)                           // B has reached the top row
    expect(lastB).toBeLessThan(H - 1)                // but not the bottom
    // and what is left of A is one run under it, not scattered.
    expect(col.slice(0, lastB + 1).every(isB)).toBe(true)
  })

  it('compresses the tipping slab toward its hinge instead of just wiping', () => {
    const W = 16, H = 16
    // Horizontal bands, so a vertical squash is visible as a change in the
    // number of bands on screen. Vertical bars would look identical squashed,
    // which is how a wipe can pass for a tilt.
    const banded = (tint: 0 | 1): Frame => Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, () => (Math.floor(y / 2) % 2 === 0
        ? { r: tint ? 0 : 255, g: tint ? 255 : 0, b: 0 }
        : { r: 0, g: 0, b: 0 })))
    const a = banded(0), b = banded(1)
    const bandsOfA = (t: number) => {
      const col = compositeTransition('tilt', a, b, t, W, H).map((r) => r[W / 2])
      let runs = 0
      for (let y = 1; y < H; y++) if (col[y].r > 0 && col[y - 1].r === 0) runs++
      return runs
    }
    // Squashing packs A's remaining bands closer together, so the count of
    // visible A bands does not simply fall the way a wipe's would.
    expect(bandsOfA(0.35)).toBeGreaterThan(0)
    expect(bandsOfA(0.55)).toBeGreaterThan(0)
  })

// Without these, dropping back to nearest-neighbour would pass every other
  // test in this file: the silhouette assertions only care where B appears.
  describe('bilinear sampling', () => {
    it('produces intermediate values a nearest read could never return', () => {
      const W = 16, H = 16
      // Two-tone A: every source pixel is 0 or 240, so any other value on
      // screen can only have come from weighting two neighbours.
      const a: Frame = Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) => (x + y) % 2 === 0
          ? { r: 240, g: 240, b: 240 }
          : { r: 0, g: 0, b: 0 }))
      const b = solid(W, H, 0, 0, 0)
      // Mid-turn the card samples off pixel centres across most of its width.
      const out = compositeTransition('flip', a, b, 0.3, W, H)
      const mixed = out.flat().filter((p) => p.r > 8 && p.r < 232)
      expect(mixed.length).toBeGreaterThan(0)
    })

    it('still reads exactly one pixel when the coordinate is integral', () => {
      // The endpoint-exactness rule rests on this: at t=0 and t=1 the sample
      // lands on a pixel centre, so three of the four weights are zero.
      const W = 16, H = 16
      const a = gradient(W, H, 'red'), b = gradient(W, H, 'green')
      for (const style of STYLES) {
        expect(equalFrames(compositeTransition(style, a, b, 0, W, H), a)).toBe(true)
        expect(equalFrames(compositeTransition(style, a, b, 1, W, H), b)).toBe(true)
      }
    })

    it('clamps out-of-frame neighbours instead of fading to black at the edge', () => {
      const W = 16, H = 16
      // A uniform surface must stay uniform under a warp. If the sampler let
      // out-of-frame neighbours contribute black, the border would darken.
      // Early in a dolly B is still sub-pixel, so the whole frame is the one
      // receding A surface — comparing an edge against a centre that had
      // become B would be comparing two surfaces at two different depths.
      const a = solid(W, H, 200, 200, 200), b = solid(W, H, 200, 200, 200)
      const out = compositeTransition('dolly', a, b, 0.2, W, H)
      const values = new Set(out.flat().map((p) => p.r))
      expect(values.size).toBe(1)
      expect([...values][0]).toBeGreaterThan(0)
    })
  })

  it('degrades to a horizontal squeeze on a one-row output rather than blanking', () => {
    const W = 64, H = 1
    const a = solid(W, H, 255, 255, 255), b = solid(W, H, 255, 255, 255)
    expect(lit(compositeTransition('flip', a, b, 0.25, W, H))).toBeGreaterThan(0)
    expect(lit(compositeTransition('dolly', a, b, 0.75, W, H))).toBeGreaterThan(0)
  })
})

describe('3D transition registration', () => {
  it('offers both styles everywhere a style can be picked', () => {
    const options = (PROPERTY_META.transitionType as { options: readonly string[] }).options
    for (const style of ['dolly', 'flip', 'cube', 'door', 'tilt']) expect(options).toContain(style)
    // The picker chips and the .show binary both index this list, so the two
    // must agree on order as well as membership.
    expect(SHOW_TRANSITIONS).toEqual([...options])
  })

  it('appends the new style ids instead of renumbering exported shows', () => {
    expect(SHOW_TRANSITIONS.indexOf('crossfade')).toBe(0)
    expect(SHOW_TRANSITIONS.indexOf('zoom')).toBe(15)
    expect(SHOW_TRANSITIONS.indexOf('dolly')).toBe(16)
    expect(SHOW_TRANSITIONS.indexOf('flip')).toBe(17)
    expect(SHOW_TRANSITIONS.indexOf('cube')).toBe(18)
    expect(SHOW_TRANSITIONS.indexOf('door')).toBe(19)
    expect(SHOW_TRANSITIONS.indexOf('tilt')).toBe(20)
  })

  it('emits both arms in the shared C++ helper', () => {
    expect(TRANSITION_HELPER_CPP).toContain('case 16: {')
    expect(TRANSITION_HELPER_CPP).toContain('case 17: {')
    expect(TRANSITION_HELPER_CPP).toContain('_depthShade')
  })

  it('narrows to the styles a show actually uses, keeping the depth helpers', () => {
    const only16 = transitionHelperCpp([16])
    expect(only16).toContain('case 16: {')
    expect(only16).not.toContain('case 17: {')
    // The helpers sit above the switch, so they survive any narrowing — and are
    // static inline so an unused one does not warn.
    expect(only16).toContain('static inline float _depthShade')
    const noneOfThem = transitionHelperCpp([1])
    expect(noneOfThem).not.toContain('case 16: {')
    expect(noneOfThem).not.toContain('case 17: {')
    expect(noneOfThem).toContain('case 1: {')
  })
})
