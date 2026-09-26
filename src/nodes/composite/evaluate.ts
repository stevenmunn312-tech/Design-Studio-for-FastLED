import { type Frame, type RGB, hsv } from '../../state/ledColor'
import type { NodeEvaluators } from '../../state/evaluator/types'
import {
  DEFAULT_W,
  DEFAULT_H,
  buildFrame,
  cloneFrame,
  rawBlankFrame,
  clamp01,
  scaleRgb,
  blankFrame,
  byte,
} from '../../state/evaluator/frames'
import { instanceState } from '../../state/evaluator/memory'

// Trails node — the persisted, fading accumulator frame.
const trailState = instanceState('trailState', new Map<string, Frame>())
interface FrameFeedbackState { frames: Frame[]; index: number; w: number; h: number; capacity: number }
const frameFeedbackState = instanceState('frameFeedbackState', new Map<string, FrameFeedbackState>())

// Per-channel blend-mode math for the Blend node. `a`/`b` are 0–255 base/blend
// channel values; returns the blended channel (0–255) before opacity is mixed.
function blendChannel(mode: string, a: number, b: number): number {
  const an = a / 255, bn = b / 255
  let r: number
  switch (mode) {
    case 'multiply':   r = an * bn; break
    case 'screen':     r = 1 - (1 - an) * (1 - bn); break
    case 'overlay':    r = an < 0.5 ? 2 * an * bn : 1 - 2 * (1 - an) * (1 - bn); break
    case 'add':        r = Math.min(1, an + bn); break
    case 'difference': r = Math.abs(an - bn); break
    case 'lighten':    r = Math.max(an, bn); break
    case 'normal':
    default:           r = bn; break
  }
  return r * 255
}

// Composite frame `b` over `a` with `mode` at `opacity` (0–1): the blended
// colour is cross-faded against the base by opacity, so 0 = base, 1 = full mode.
function blendPixel(mode: string, a: RGB, b: RGB, opacity: number): RGB {
  const mix = (av: number, bv: number) =>
    Math.round(av * (1 - opacity) + blendChannel(mode, av, bv) * opacity)
  return { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) }
}

// Animated geometric transform of a frame, resampled nearest-neighbour about
// the matrix centre. `rotate` spins by rate°/s, `scale` zooms by rate%/s
// (clamped), `translate` shifts by rate px/s along `angle°` (toroidal wrap).
function evalTransform(src: Frame, mode: string, rate: number, angle: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const sample = (sx: number, sy: number): RGB => {
    const xi = Math.round(sx), yi = Math.round(sy)
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return { r: 0, g: 0, b: 0 }
    return { ...src[yi][xi] }
  }
  if (mode === 'translate') {
    const a = (angle * Math.PI) / 180
    const dx = Math.cos(a) * rate * t, dy = Math.sin(a) * rate * t
    return buildFrame(W, H, (x, y) => {
        const sx = ((Math.round(x - dx) % W) + W) % W
        const sy = ((Math.round(y - dy) % H) + H) % H
        return { ...src[sy][sx] }
      })
  }
  if (mode === 'scale') {
    const s = Math.max(0.05, Math.min(20, 1 + (rate / 100) * t))
    return buildFrame(W, H, (x, y) => sample(cx + (x - cx) / s, cy + (y - cy) / s))
  }
  // rotate: sample the source under the inverse rotation
  const a = (rate * t * Math.PI) / 180
  const cosA = Math.cos(a), sinA = Math.sin(a)
  return buildFrame(W, H, (x, y) => {
      const rx = x - cx, ry = y - cy
      return sample(cx + rx * cosA + ry * sinA, cy - rx * sinA + ry * cosA)
    })
}

function sampleFeedbackFrame(
  src: Frame, transformMode: string, offsetX: number, offsetY: number,
  angle: number, scale: number, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const sample = (sx: number, sy: number): RGB => {
    const xi = Math.round(sx), yi = Math.round(sy)
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return { r: 0, g: 0, b: 0 }
    return { ...src[yi][xi] }
  }
  if (transformMode === 'translate') {
    return buildFrame(W, H, (x, y) => {
      const sx = ((Math.round(x - offsetX) % W) + W) % W
      const sy = ((Math.round(y - offsetY) % H) + H) % H
      return { ...src[sy][sx] }
    })
  }
  if (transformMode === 'scale') {
    const s = Math.max(0.05, Math.min(4, scale))
    return buildFrame(W, H, (x, y) => sample(cx + (x - cx) / s, cy + (y - cy) / s))
  }
  if (transformMode === 'rotate') {
    const a = (angle * Math.PI) / 180
    const cosA = Math.cos(a), sinA = Math.sin(a)
    return buildFrame(W, H, (x, y) => {
      const rx = x - cx, ry = y - cy
      return sample(cx + rx * cosA + ry * sinA, cy - rx * sinA + ry * cosA)
    })
  }
  return cloneFrame(src)
}

function evalFrameFeedback(
  key: string, src: Frame, delayFrames: number, fade: number, amount: number,
  blendMode: string, transformMode: string, offsetX: number, offsetY: number,
  angle: number, scale: number, W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const delay = Math.max(1, Math.min(32, Math.round(delayFrames)))
  const capacity = delay + 1
  let state = frameFeedbackState.get(key)
  if (!state || state.w !== W || state.h !== H || state.capacity !== capacity) {
    state = {
      frames: Array.from({ length: capacity }, () => rawBlankFrame(W, H)),
      index: 0,
      w: W,
      h: H,
      capacity,
    }
    frameFeedbackState.set(key, state)
  }

  const delayed = state.frames[(state.index - delay + capacity) % capacity]
  const faded = sampleFeedbackFrame(
    delayed,
    transformMode,
    offsetX,
    offsetY,
    angle,
    scale,
    W,
    H,
  )
  const retain = 1 - clamp01(fade)
  const opacity = clamp01(amount)
  const out = state.frames[state.index]
  for (let y = 0; y < H; y++) {
    const outRow = out[y], srcRow = src[y], delayedRow = faded[y]
    for (let x = 0; x < W; x++) {
      const fb = scaleRgb(delayedRow[x], retain)
      const px = blendPixel(blendMode, srcRow[x], fb, opacity)
      const dst = outRow[x]
      dst.r = px.r; dst.g = px.g; dst.b = px.b
    }
  }
  state.index = (state.index + 1) % capacity
  return out
}

// Hard cap on Array copies (guards a garbage `count` from allocating a huge loop).
const ARRAY_MAX_COPIES = 32

// Blender-style array: composite `count` copies of `src`, copy i offset by
// (offsetX·i, offsetY·i), rotated by angle·i and scaled by scale^i about the
// matrix centre, dimmed by falloff^i. Copies paint high→low index so copy 0
// (the identity) lands on top for the `over` mode; `add`/`lighten` are order-
// independent. Kept in lockstep with the Array case in cppGenerator.ts.
function evalArray(
  src: Frame, count: number, offsetX: number, offsetY: number,
  angleDeg: number, scale: number, falloff: number, mode: string,
  W = DEFAULT_W, H = DEFAULT_H,
): Frame {
  const out = rawBlankFrame(W, H)
  const cx = (W - 1) / 2, cy = (H - 1) / 2
  const n = Math.max(1, Math.min(ARRAY_MAX_COPIES, Math.round(count)))
  const sc0 = Math.max(0.05, scale)
  const fo = Math.max(0, Math.min(1, falloff))
  for (let i = n - 1; i >= 0; i--) {
    const ox = offsetX * i, oy = offsetY * i
    const ang = (angleDeg * i * Math.PI) / 180
    const co = Math.cos(ang), si = Math.sin(ang)
    const inv = 1 / Math.pow(sc0, i)
    const dim = Math.pow(fo, i)
    for (let y = 0; y < H; y++) {
      const orow = out[y]
      for (let x = 0; x < W; x++) {
        const px = x - ox - cx, py = y - oy - cy
        const rx = px * co + py * si, ry = -px * si + py * co
        const sx = Math.round(cx + rx * inv), sy = Math.round(cy + ry * inv)
        if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue
        const s = src[sy][sx]
        const r = s.r * dim, g = s.g * dim, b = s.b * dim
        const o = orow[x]
        if (mode === 'lighten') {
          o.r = Math.max(o.r, Math.round(r)); o.g = Math.max(o.g, Math.round(g)); o.b = Math.max(o.b, Math.round(b))
        } else if (mode === 'over') {
          const cov = Math.max(r, g, b) / 255
          o.r = Math.min(255, Math.round(o.r * (1 - cov) + r))
          o.g = Math.min(255, Math.round(o.g * (1 - cov) + g))
          o.b = Math.min(255, Math.round(o.b * (1 - cov) + b))
        } else {
          o.r = Math.min(255, o.r + Math.round(r)); o.g = Math.min(255, o.g + Math.round(g)); o.b = Math.min(255, o.b + Math.round(b))
        }
      }
    }
  }
  return out
}

function evalBlur2D(src: Frame, amount: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const radius = Math.max(1, Math.round(amount / 255 * 3))
  return buildFrame(W, H, (x, y) => {
      let r = 0, g = 0, b = 0, count = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.max(0, Math.min(W-1, x+dx))
          const ny = Math.max(0, Math.min(H-1, y+dy))
          r += src[ny][nx].r; g += src[ny][nx].g; b += src[ny][nx].b; count++
        }
      }
      return { r: Math.round(r/count), g: Math.round(g/count), b: Math.round(b/count) }
    })
}

export const COMPOSITE_EVALUATORS: NodeEvaluators = {
  // Frame blend with real blend modes — composites B over A per `blendMode`,
  // mixed by `amount` (opacity, 0–255). Keep in sync with cppGenerator's `Blend`.
  Blend({ input, num, W, H }, id, props) {
    const fa = input(id, 'a', null) as Frame | null
    const fb = input(id, 'b', null) as Frame | null
    if (!fa && !fb) { return { frame: null } }
    const a = fa ?? blankFrame(W, H)
    const b = fb ?? blankFrame(W, H)
    const opacity = Math.max(0, Math.min(1, num(id, 'amount', props, 'amount', 0.5)))
    const mode = String(props.blendMode ?? 'normal')
    return { frame: a.map((row, y) => row.map((px, x) => blendPixel(mode, px, b[y][x], opacity))) }
  },
  BrightnessMod({ input, num }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    const br = num(id, 'brightness', props, 'brightness', 1)
    if (!src) { return { frame: null } }
    return {
      frame: src.map(row =>
        row.map(px => ({
          r: Math.max(0, Math.min(255, Math.round(px.r * br))),
          g: Math.max(0, Math.min(255, Math.round(px.g * br))),
          b: Math.max(0, Math.min(255, Math.round(px.b * br))),
        }))
      ),
    }
  },
  Fade({ input, num }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    const fade = num(id, 'fade', props, 'fade', 0.5)
    const scale = Math.max(0, Math.min(1, 1 - fade))
    if (!src) { return { frame: null } }
    return {
      frame: src.map(row =>
        row.map(px => ({
          r: Math.round(px.r * scale),
          g: Math.round(px.g * scale),
          b: Math.round(px.b * scale),
        }))
      ),
    }
  },
  Transform({ input, num, t, W, H }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    if (!src) { return { frame: null } }
    const mode = String(props.transform ?? 'rotate')
    const rate = num(id, 'rate', props, 'rate', 90)
    const angle = num(id, 'angle', props, 'angle', 0)
    return { frame: evalTransform(src, mode, rate, angle, t, W, H) }
  },
  Array({ input, num, W, H }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    if (!src) { return { frame: null } }
    return { frame: evalArray(
      src,
      num(id, 'count', props, 'count', 5),
      num(id, 'offsetX', props, 'offsetX', 3),
      num(id, 'offsetY', props, 'offsetY', 0),
      num(id, 'angle', props, 'angle', 0),
      num(id, 'scale', props, 'scale', 1),
      num(id, 'falloff', props, 'falloff', 0.7),
      String(props.blendMode ?? 'add'),
      W, H,
    ) }
  },
  // Manual A/B frame selector; falls back to the wired side when the
  // selected one is empty. Both inputs are evaluated every frame so a
  // stateful upstream pattern keeps advancing while hidden.
  FrameSwitch({ input }, id) {
    const a = input(id, 'a', null) as Frame | null
    const b = input(id, 'b', null) as Frame | null
    const sel = Boolean(input(id, 'sel', false))
    return { frame: (sel ? b : a) ?? (sel ? a : b) }
  },
  // Named rectangular zones — each of A–D routes its own wired frame into
  // a normalized 0–1 rectangle of the matrix, later zones painting over
  // earlier ones where they overlap. An unwired or disabled zone is
  // skipped entirely, leaving whatever `base`/an earlier zone already put
  // there (non-destructive partial wiring).
  Zones({ input, W, H }, id, props) {
    const base = input(id, 'base', null) as Frame | null
    const result = base ? cloneFrame(base) : blankFrame(W, H)
    for (const key of ['a', 'b', 'c', 'd'] as const) {
      if (props[`${key}Enabled`] === false) continue
      const src = input(id, key, null) as Frame | null
      if (!src) continue
      const zx = Math.max(0, Math.min(1, Number(props[`${key}X`] ?? 0)))
      const zy = Math.max(0, Math.min(1, Number(props[`${key}Y`] ?? 0)))
      const zw = Math.max(0, Math.min(1, Number(props[`${key}W`] ?? 1)))
      const zh = Math.max(0, Math.min(1, Number(props[`${key}H`] ?? 1)))
      const x0 = Math.round(zx * W), x1 = Math.min(W, Math.round((zx + zw) * W))
      const y0 = Math.round(zy * H), y1 = Math.min(H, Math.round((zy + zh) * H))
      for (let y = y0; y < y1; y++) {
        const srcRow = src[y]
        const dstRow = result[y]
        if (!srcRow || !dstRow) continue
        for (let x = x0; x < x1; x++) {
          const s = srcRow[x]
          if (!s) continue
          const d = dstRow[x]
          d.r = s.r; d.g = s.g; d.b = s.b
        }
      }
    }
    return { frame: result }
  },
  // Feedback/trails buffer — the persistent accumulator fades by `decay`
  // each tick, then re-lightens per-channel wherever the incoming frame is
  // brighter (fadeToBlackBy()-and-accumulate, generalised to any upstream
  // pattern). Left untouched while unwired so it resumes cleanly.
  Trails({ input, num, W, H, stateKey }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    if (!src) { return { frame: null } }
    const decaySlider = Math.max(0, Math.min(1, num(id, 'decay', props, 'decay', 0.15)))
    // Cubed so the fade-per-tick ramps up gently — applied linearly, almost
    // the whole visible range collapses into roughly the bottom 5% of the
    // slider (0.3 already reads as "gone"). Mirrored in cppGenerator.ts.
    const decay = decaySlider * decaySlider * decaySlider
    const key = stateKey(id)
    const prev = trailState.get(key)
    // Persistent buffer, faded + re-lightened in place each pass — never
    // pool-allocated. Consumers don't mutate inputs, so it's returned as-is.
    const buf = prev && prev.length === H && prev[0]?.length === W
      ? prev
      : rawBlankFrame(W, H)
    const s = 1 - decay
    for (let y = 0; y < H; y++) {
      const row = buf[y], srcRow = src[y]
      for (let x = 0; x < W; x++) {
        const px = row[x], inpx = srcRow[x]
        px.r = Math.max(Math.round(px.r * s), inpx.r)
        px.g = Math.max(Math.round(px.g * s), inpx.g)
        px.b = Math.max(Math.round(px.b * s), inpx.b)
      }
    }
    trailState.set(key, buf)
    return { frame: buf }
  },
  // Bounded recursive frame feedback. The node stores its own output in a
  // ring buffer, then composites a delayed, faded/transformed copy over the
  // current input on the next ticks. That gives video-synth feedback without
  // permitting graph cycles.
  FrameFeedback({ input, num, W, H, stateKey }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    if (!src) { return { frame: null } }
    return { frame: evalFrameFeedback(
      stateKey(id),
      src,
      Number(props.delayFrames ?? 2),
      num(id, 'fade', props, 'fade', 0.08),
      num(id, 'amount', props, 'amount', 0.5),
      String(props.blendMode ?? 'screen'),
      String(props.feedbackTransform ?? 'none'),
      num(id, 'offsetX', props, 'offsetX', 0),
      num(id, 'offsetY', props, 'offsetY', 0),
      num(id, 'angle', props, 'angle', 0),
      num(id, 'scale', props, 'scale', 1),
      W,
      H,
    ) }
  },
  Mask({ input }, id) {
    const src = input(id, 'frame', null) as Frame | null
    const maskF = input(id, 'mask', null) as Frame | null
    if (!src) { return { frame: null } }
    return {
      frame: src.map((row, y) =>
        row.map((px, x) => {
          const m = maskF?.[y]?.[x]
          const a = m ? (m.r + m.g + m.b) / 3 / 255 : 1
          return { r: Math.round(px.r * a), g: Math.round(px.g * a), b: Math.round(px.b * a) }
        })
      ),
    }
  },
  HueShift({ input, num }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    const shift = num(id, 'shift', props, 'shift', 0) * 360
    if (!src) { return { frame: null } }
    return {
      frame: src.map(row =>
        row.map(px => {
          // Convert RGB→HSV, shift H, convert back
          const r = px.r / 255, g = px.g / 255, b = px.b / 255
          const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
          let h = 0
          if (d > 0) {
            if (max === r) h = ((g - b) / d) % 6
            else if (max === g) h = (b - r) / d + 2
            else h = (r - g) / d + 4
            h = h * 60
          }
          return hsv((h + shift + 360) % 360, max > 0 ? d / max : 0, max)
        })
      ),
    }
  },
  // RGB→HSV→scale saturation→RGB; shares HueShift's inline extraction.
  Saturation({ input, num }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    const amount = num(id, 'amount', props, 'amount', 1)
    if (!src) { return { frame: null } }
    return {
      frame: src.map(row =>
        row.map(px => {
          const r = px.r / 255, g = px.g / 255, b = px.b / 255
          const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
          let h = 0
          if (d > 0) {
            if (max === r) h = ((g - b) / d) % 6
            else if (max === g) h = (b - r) / d + 2
            else h = (r - g) / d + 4
            h = h * 60
          }
          const s = max > 0 ? d / max : 0
          const s2 = Math.max(0, Math.min(1, s * amount))
          return hsv((h + 360) % 360, s2, max)
        })
      ),
    }
  },
  ColorBoost({ input, num }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    const boost = Math.max(0, Math.min(1, num(id, 'boost', props, 'boost', 0.5)))
    if (!src) { return { frame: null } }
    const scale = 1 + boost * 1.5
    const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    return {
      frame: src.map(row =>
        row.map(px => {
          const luma = px.r * 0.2126 + px.g * 0.7152 + px.b * 0.0722
          return {
            r: clamp255(luma + (px.r - luma) * scale),
            g: clamp255(luma + (px.g - luma) * scale),
            b: clamp255(luma + (px.b - luma) * scale),
          }
        })
      ),
    }
  },
  Gamma({ input, num, W, H }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    const g = Math.max(0.1, num(id, 'gamma', props, 'gamma', 2.2))
    if (!src) { return { frame: null } }
    const corr = (c: number) => Math.round(255 * Math.pow(c / 255, g))
    return { frame: buildFrame(W, H, (x, y) => { const px = src[y][x]; return { r: corr(px.r), g: corr(px.g), b: corr(px.b) } }) }
  },
  Invert({ input, W, H }, id) {
    const src = input(id, 'frame', null) as Frame | null
    if (!src) { return { frame: blankFrame(W, H) } }
    return { frame: buildFrame(W, H, (x, y) => { const px = src[y][x]; return { r: 255 - px.r, g: 255 - px.g, b: 255 - px.b } }) }
  },
  Mirror({ input, num, W, H }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    if (!src) { return { frame: blankFrame(W, H) } }
    const mode = String(props.mirrorMode ?? 'horizontal')
    const glow = Boolean(props.glow)
    // Additive bloom: the plain mirror (base) plus a `glowAmount` fraction of
    // the discarded partner, tinted per-channel by the `color` input (white =
    // neutral). 0 = clean mirror, 1 = full add. Both coords are symmetric under
    // the reflection. Kept in lockstep with cppGenerator.
    const glowAmt = Math.max(0, Math.min(1, num(id, 'glowAmount', props, 'glowAmount', 0.35)))
    const tint = (input(id, 'color', null) as RGB | null)
      ?? {
        r: byte(num(id, 'r', props, 'r', 255) / 255),
        g: byte(num(id, 'g', props, 'g', 255) / 255),
        b: byte(num(id, 'b', props, 'b', 255) / 255),
      }
    const gCh = (base: number, add: number, tintCh: number) => Math.min(255, base + add * (tintCh / 255) * glowAmt)
    return { frame: buildFrame(W, H, (x, y) => {
      // base = the mirrored source pixel (min-side of the reflection)
      let bx = x, by = y
      if (mode === 'horizontal' || mode === 'quad') bx = Math.min(x, W - 1 - x)
      if (mode === 'vertical' || mode === 'quad') by = Math.min(y, H - 1 - y)
      if (mode === 'diagonal') { bx = Math.min(Math.min(x, y), W - 1); by = Math.min(Math.max(x, y), H - 1) }
      const b = src[by][bx]
      if (!glow) return { r: b.r, g: b.g, b: b.b }
      // add = the opposite (discarded) partner (max-side of the reflection)
      let ax = x, ay = y
      if (mode === 'horizontal' || mode === 'quad') ax = Math.max(x, W - 1 - x)
      if (mode === 'vertical' || mode === 'quad') ay = Math.max(y, H - 1 - y)
      if (mode === 'diagonal') { ax = Math.min(Math.max(x, y), W - 1); ay = Math.min(Math.min(x, y), H - 1) }
      const a = src[ay][ax]
      return { r: gCh(b.r, a.r, tint.r), g: gCh(b.g, a.g, tint.g), b: gCh(b.b, a.b, tint.b) }
    }) }
  },
  Blur2D({ input, num, W, H }, id, props) {
    const src = input(id, 'frame', null) as Frame | null
    // `amount` is a 0–1 strength; FastLED's blur2d takes a 0–255 blur amount.
    const amount = Math.max(0, Math.min(1, num(id, 'amount', props, 'amount', 0.15)))
    if (!src) { return { frame: blankFrame(W, H) } }
    return { frame: evalBlur2D(src, amount * 255, W, H) }
  },
}
