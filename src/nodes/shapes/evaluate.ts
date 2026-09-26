import type { RtcPreview } from '../../state/rtc'
import { type BitmapFont, DEFAULT_FONT, textBlockLayout, TEXT_LINE_GAP, asFont, textAlignMode } from '../../state/font'
import { asAnimatedImage, type ImageData, animatedImageFrame, asImage, sampleImageToFrame } from '../../state/image'
import type { ImagePaletteSource } from '../../state/imagePalette'
import { hexToRgb } from '../../state/polinePalette'
import { denormRate, SPEED_MAX } from '../../state/speedRange'
import { type Frame, type RGB, type Palette, samplePalette } from '../../state/ledColor'
import { resolveWireframeMesh, projectWireframeVertices } from '../../state/wireframeModel'
import type { NodeEvaluators } from '../../state/evaluator/types'
import {
  DEFAULT_W,
  DEFAULT_H,
  clamp01,
  mixRgb,
  blankFrame,
  scaleRgb,
  buildFrame,
  byte,
  solidFrame,
  cloneFrame,
  splatDisc,
} from '../../state/evaluator/frames'
import { instanceState } from '../../state/evaluator/memory'

function normalizedCenterAxis(value: number, size: number, extent: number, wrap: boolean): number {
  if (value > 1) return value
  if (wrap) return size * 0.5 - size + value * (size * 2)
  const margin = extent + 1
  return 0.5 - margin + value * (Math.max(0, size - 1) + 2 * margin)
}

// Circle's and ClockDisplay's `radius` were originally tuned as raw pixel
// counts against a 16x16 matrix (this module's own DEFAULT_W/DEFAULT_H).
// scaleWithMatrix (opt-in per node, see nodeLibrary.ts) scales that radius
// proportionally by the target matrix's shorter side, so the same slider
// value reads as "the same relative size" on any matrix instead of shrinking
// to a speck on a large panel or overflowing a small strip. Mirrored by
// cppGenerator.ts's own matrix-scale expression — keep the reference size in
// sync between the two.
function matrixSizeScale(W: number, H: number): number {
  return Math.min(W, H) / Math.min(DEFAULT_W, DEFAULT_H)
}

interface ClockDisplayState {
  lastT: number
  elapsed: number
  remaining: number
  prevReset: boolean
  mode: string
  duration: number
}
const clockDisplayState = instanceState('clockDisplayState', new Map<string, ClockDisplayState>())

function wrapUnit(v: number): number {
  return ((v % 1) + 1) % 1
}

function pathPoint(shape: string, t: number): { x: number; y: number } {
  const TAU = Math.PI * 2
  const ang = wrapUnit(t) * TAU
  switch (shape) {
    case 'heart': {
      const x = 16 * Math.sin(ang) ** 3 / 18
      const y = (13 * Math.cos(ang) - 5 * Math.cos(ang * 2) - 2 * Math.cos(ang * 3) - Math.cos(ang * 4)) / 18
      return { x, y }
    }
    case 'lissajous':
      return { x: Math.sin(ang + Math.PI / 2), y: Math.sin(ang * 2) }
    case 'rose': {
      const r = Math.cos(ang * 4)
      return { x: r * Math.cos(ang), y: r * Math.sin(ang) }
    }
    case 'circle':
    default:
      return { x: Math.cos(ang), y: Math.sin(ang) }
  }
}

// Signed distance (negative inside) from a point to a regular polygon of
// `sides` sides and circumradius `size`, in the shape's local frame. Radial
// approximation (exact along apothems, softer near vertices) — good enough for
// 1px-band anti-aliasing and, crucially, continuous in `sides`.
function polygonSd(lx: number, ly: number, sides: number, size: number): number {
  const seg = (Math.PI * 2) / sides
  const apothem = Math.cos(Math.PI / sides)
  const r = Math.hypot(lx, ly)
  const a = Math.atan2(ly, lx)
  const folded = ((a % seg) + seg) % seg - seg / 2
  return r - (size * apothem) / Math.cos(folded)
}

// Draw a rect / ellipse / regular polygon onto `frame` (which already holds the
// base), over-composited with 1px anti-aliasing. `size` is the half-height
// (circumradius for polygons); `aspect` widens rect/ellipse. Fractional `sides`
// blends the floor/ceil polygon SDFs so the shape morphs seamlessly between
// vertex counts. Kept in lockstep with the Shape case in cppGenerator.ts.
function evalShape(
  frame: Frame, shape: string, cx: number, cy: number, size: number,
  aspect: number, sides: number, rotation: number, thickness: number,
  filled: boolean, fill: RGB, edge: RGB, W: number, H: number,
): void {
  const ax = Math.max(0.01, size * (shape === 'polygon' ? 1 : aspect))
  const ay = Math.max(0.01, size)
  const reach = Math.max(ax, ay) + thickness * 0.5 + 1
  const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(W - 1, Math.ceil(cx + reach))
  const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(H - 1, Math.ceil(cy + reach))
  const ra = (-rotation * Math.PI) / 180
  const cosR = Math.cos(ra), sinR = Math.sin(ra)
  const n = Math.max(3, sides)
  const nlo = Math.floor(n), nhi = Math.ceil(n), fr = n - nlo
  const half = thickness * 0.5
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5) - cx, dy = (y + 0.5) - cy
      const lx = dx * cosR - dy * sinR, ly = dx * sinR + dy * cosR
      let sd: number
      if (shape === 'rect') {
        const qx = Math.abs(lx) - ax, qy = Math.abs(ly) - ay
        sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
      } else if (shape === 'ellipse') {
        sd = (Math.hypot(lx / ax, ly / ay) - 1) * Math.min(ax, ay)
      } else {
        sd = nlo === nhi
          ? polygonSd(lx, ly, nlo, size)
          : polygonSd(lx, ly, nlo, size) * (1 - fr) + polygonSd(lx, ly, nhi, size) * fr
      }
      const fillCov = filled ? clamp01(0.5 - sd) : 0
      const edgeCov = thickness > 0 ? clamp01(half + 0.5 - Math.abs(sd)) : 0
      const alpha = Math.max(fillCov, edgeCov)
      if (alpha <= 0) continue
      const col = edgeCov > 0 ? mixRgb(fill, edge, edgeCov) : fill
      frame[y][x] = mixRgb(frame[y][x], col, alpha)
    }
  }
}

function evalWrappedShape(
  frame: Frame, shape: string, cx: number, cy: number, size: number,
  aspect: number, sides: number, rotation: number, thickness: number,
  filled: boolean, fill: RGB, edge: RGB, W: number, H: number, wrap: boolean,
): void {
  const xOffsets = wrap ? [-W, 0, W] : [0]
  const yOffsets = wrap ? [-H, 0, H] : [0]
  for (const ox of xOffsets) {
    for (const oy of yOffsets) {
      evalShape(frame, shape, cx + ox, cy + oy, size, aspect, sides, rotation, thickness, filled, fill, edge, W, H)
    }
  }
}

function renderTextInto(frame: Frame, cols: number[], color: RGB, startX: number, startY: number, font: BitmapFont, W: number, H: number, offset: number): void {
  for (let x = 0; x < W; x++) {
    const ci = x - startX + offset
    if (ci < 0 || ci >= cols.length) continue
    const col = cols[ci]
    for (let r = 0; r < font.h; r++) {
      if (col & (1 << r)) {
        const y = startY + r
        if (y >= 0 && y < H) frame[y][x] = { ...color }
      }
    }
  }
}

// Render `text` onto a blank frame at (startX, startY), optionally scrolling
// over time (scroll = cells/second) along either axis. Shares textColumns()
// with codegen.
function renderText(
  text: string,
  color: RGB,
  startX: number[],
  startY: number,
  scroll: number,
  scrollAxis: 'horizontal' | 'vertical',
  t: number,
  font: BitmapFont = DEFAULT_FONT,
  W = DEFAULT_W,
  H = DEFAULT_H,
  wrap = false,
  letterSpacing = 1,
): Frame {
  const frame = blankFrame(W, H)
  const layout = textBlockLayout(text, font, letterSpacing)
  if (layout.lines.length === 0) return frame
  const vertical = scrollAxis === 'vertical'
  const totalX = layout.width + W
  const totalY = layout.height + H
  const offsetX = !vertical && scroll !== 0 ? Math.floor((((t * scroll) % totalX) + totalX) % totalX) : 0
  const offsetY = vertical && scroll !== 0 ? Math.floor((((t * scroll) % totalY) + totalY) % totalY) : 0
  const xOffsets = wrap ? [-W, 0, W] : [0]
  const yOffsets = wrap ? [-H, 0, H] : [0]
  for (const ox of xOffsets) {
    for (const oy of yOffsets) {
      for (let i = 0; i < layout.lines.length; i++) {
        const line = layout.lines[i]
        const lineY = startY + i * (font.h + TEXT_LINE_GAP) + oy - offsetY
        renderTextInto(frame, line.cols, color, startX[i] + ox, lineY, font, W, H, offsetX)
      }
    }
  }
  return frame
}

const CLOCK_ANALOG_MODES = new Set(['Analog', 'Analog + Date'])
const CLOCK_TRANSPORT_MODES = new Set(['Stopwatch', 'Timer'])

function pad2(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0')
}

function clockParts(secondsOfDay: number): {
  hour: number
  minute: number
  second: number
  total: number
} {
  const total = ((secondsOfDay % 86400) + 86400) % 86400
  const hour = Math.floor(total / 3600)
  const minute = Math.floor((total % 3600) / 60)
  const second = Math.floor(total % 60)
  return { hour, minute, second, total }
}

function clockDateText(day: number, month: number): string {
  return `${pad2(day)}.${pad2(month)}`
}

function formatClockTwelveHour(hour: number, minute: number): { main: string; sub: string } {
  const h12 = hour % 12 || 12
  return { main: `${pad2(h12)}:${pad2(minute)}`, sub: hour < 12 ? 'AM' : 'PM' }
}

function formatTransportText(seconds: number): { main: string; sub: string } {
  const safe = Math.max(0, seconds)
  const whole = Math.floor(safe)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60
  const centis = Math.floor((safe - whole) * 100) % 100
  if (hours > 0) return { main: `${pad2(hours)}:${pad2(minutes)}`, sub: pad2(secs) }
  return { main: `${pad2(minutes)}:${pad2(secs)}`, sub: pad2(centis) }
}

function drawPixelLighten(frame: Frame, x: number, y: number, color: RGB, W: number, H: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const px = frame[y][x]
  px.r = Math.max(px.r, color.r)
  px.g = Math.max(px.g, color.g)
  px.b = Math.max(px.b, color.b)
}

function drawLineLighten(frame: Frame, x0: number, y0: number, x1: number, y1: number, color: RGB, W: number, H: number): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2))
  for (let i = 0; i <= steps; i++) {
    const tt = i / steps
    drawPixelLighten(frame, Math.round(x0 + (x1 - x0) * tt), Math.round(y0 + (y1 - y0) * tt), color, W, H)
  }
}

function drawRingLighten(frame: Frame, cx: number, cy: number, radius: number, color: RGB, W: number, H: number): void {
  const x0 = Math.max(0, Math.floor(cx - radius - 1))
  const x1 = Math.min(W - 1, Math.ceil(cx + radius + 1))
  const y0 = Math.max(0, Math.floor(cy - radius - 1))
  const y1 = Math.min(H - 1, Math.ceil(cy + radius + 1))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.abs(Math.hypot(x - cx, y - cy) - radius)
      if (dist <= 0.65) drawPixelLighten(frame, x, y, color, W, H)
    }
  }
}

function blitText(
  frame: Frame,
  text: string,
  color: RGB,
  x: number,
  y: number,
  font: BitmapFont,
  W: number,
  H: number,
  hAlign: 'start' | 'center' | 'end',
  vAlign: 'start' | 'center' | 'end',
  wrap = false,
  letterSpacing = 0,
): void {
  const layout = textBlockLayout(text, font, letterSpacing)
  if (layout.lines.length === 0) return
  const sx = layout.lines.map((line) => textAlignedStart(x, W, line.cols.length, hAlign, wrap))
  const sy = textAlignedStart(y, H, layout.height, vAlign, wrap)
  const xOffsets = wrap ? [-W, 0, W] : [0]
  const yOffsets = wrap ? [-H, 0, H] : [0]
  for (const ox of xOffsets) {
    for (const oy of yOffsets) {
      for (let i = 0; i < layout.lines.length; i++) {
        const line = layout.lines[i]
        const lineY = sy + i * (font.h + TEXT_LINE_GAP) + oy
        const startX = sx[i] + ox
        for (let xx = 0; xx < W; xx++) {
          const ci = xx - startX
          if (ci < 0 || ci >= line.cols.length) continue
          const col = line.cols[ci]
          for (let r = 0; r < font.h; r++) {
            if (col & (1 << r)) drawPixelLighten(frame, xx, lineY + r, color, W, H)
          }
        }
      }
    }
  }
}

function renderAnalogClock(frame: Frame, secondsOfDay: number, color: RGB, cx: number, cy: number, radius: number, W: number, H: number): void {
  const ring = scaleRgb(color, 0.45)
  const ticks = scaleRgb(color, 0.3)
  const secondColor = scaleRgb(color, 0.7)
  const handHour = Math.max(2, radius * 0.5)
  const handMinute = Math.max(3, radius * 0.78)
  const handSecond = Math.max(3, radius * 0.92)
  drawRingLighten(frame, cx, cy, radius, ring, W, H)
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * (Math.PI / 2)
    drawPixelLighten(frame, Math.round(cx + Math.cos(a) * radius), Math.round(cy + Math.sin(a) * radius), ticks, W, H)
  }
  const parts = clockParts(secondsOfDay)
  const hourA = -Math.PI / 2 + ((parts.hour % 12) + parts.minute / 60 + parts.second / 3600) / 12 * Math.PI * 2
  const minuteA = -Math.PI / 2 + (parts.minute + parts.second / 60) / 60 * Math.PI * 2
  const secondA = -Math.PI / 2 + (parts.total % 60) / 60 * Math.PI * 2
  drawLineLighten(frame, cx, cy, cx + Math.cos(hourA) * handHour, cy + Math.sin(hourA) * handHour, color, W, H)
  drawLineLighten(frame, cx, cy, cx + Math.cos(minuteA) * handMinute, cy + Math.sin(minuteA) * handMinute, color, W, H)
  drawLineLighten(frame, cx, cy, cx + Math.cos(secondA) * handSecond, cy + Math.sin(secondA) * handSecond, secondColor, W, H)
  drawPixelLighten(frame, Math.round(cx), Math.round(cy), color, W, H)
}

function shapeExtents(shape: string, size: number, aspect: number, rotation: number, thickness: number): { x: number; y: number } {
  if (shape === 'polygon') {
    const extent = Math.max(0.01, size) + Math.max(0, thickness) * 0.5
    return { x: extent, y: extent }
  }
  const ax = Math.max(0.01, size * aspect)
  const ay = Math.max(0.01, size)
  const ra = (-rotation * Math.PI) / 180
  const cosR = Math.abs(Math.cos(ra)), sinR = Math.abs(Math.sin(ra))
  const edge = Math.max(0, thickness) * 0.5
  return {
    x: ax * cosR + ay * sinR + edge,
    y: ax * sinR + ay * cosR + edge,
  }
}

function textStartPosition(value: number, size: number, extent: number, wrap: boolean): number {
  return Math.floor(normalizedCenterAxis(value, size, extent, wrap) - extent)
}

// Alignment-aware version: 'center' keeps the text centred on `value` (the
// original behavior); 'start'/'end' anchor the text's leading/trailing edge
// to `value` instead, reusing normalizedCenterAxis at zero extent (a point)
// so the same off-screen travel range applies.
function textAlignedStart(value: number, size: number, lengthPx: number, align: 'start' | 'center' | 'end', wrap: boolean): number {
  if (align === 'center') return textStartPosition(value, size, lengthPx * 0.5, wrap)
  const edge = Math.floor(normalizedCenterAxis(value, size, 0, wrap))
  return align === 'end' ? edge - lengthPx : edge
}

function evalGradientFrame(cA: RGB, cB: RGB, vertical: boolean, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return buildFrame(W, H, (x, y) => {
      const t = vertical ? y / (H - 1) : x / (W - 1)
      return { r: Math.round(cA.r * (1-t) + cB.r * t), g: Math.round(cA.g * (1-t) + cB.g * t), b: Math.round(cA.b * (1-t) + cB.b * t) }
    })
}

// Angled palette gradient: project each pixel onto a direction set by `angle`,
// normalise across the matrix to 0–1, then sample the palette (with `repeat`
// cycles and an optional time-scrolling offset).
function evalPaletteGradient(angle: number, repeat: number, speed: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const a = (angle * Math.PI) / 180
  const cosA = Math.cos(a), sinA = Math.sin(a)
  const projMin = (cosA < 0 ? (W - 1) * cosA : 0) + (sinA < 0 ? (H - 1) * sinA : 0)
  const projMax = (cosA > 0 ? (W - 1) * cosA : 0) + (sinA > 0 ? (H - 1) * sinA : 0)
  const range = Math.max(1e-6, projMax - projMin)
  return buildFrame(W, H, (x, y) => {
      const tnorm = (x * cosA + y * sinA - projMin) / range
      return samplePalette(palette, tnorm * repeat + t * speed)
    })
}

export const SHAPES_EVALUATORS: NodeEvaluators = {
  SolidColor({ input, num, W, H }, id, props) {
    const colorIn = input(id, 'color', null) as RGB | null
    const color = colorIn ?? {
      r: byte(num(id, 'r', props, 'r', 255)  / 255),
      g: byte(num(id, 'g', props, 'g', 0)    / 255),
      b: byte(num(id, 'b', props, 'b', 128)  / 255),
    }
    return { frame: solidFrame(color, W, H) }
  },
  Text({ input, num, t, W, H }, id, props) {
    const text = String(props.text ?? 'HELLO')
    const font = asFont(props.font)
    const letterSpacing = Math.max(0, Math.round(Number(props.letterSpacing ?? 1)))
    const layout = textBlockLayout(text, font, letterSpacing)
    const wrap = Boolean(props.wrap)
    const hAlign = textAlignMode(props.hAlign ?? 'center', 'left', 'right')
    const vAlign = textAlignMode(props.vAlign ?? 'middle', 'top', 'bottom')
    const scrollAxis: 'horizontal' | 'vertical' = props.scrollAxis === 'vertical' ? 'vertical' : 'horizontal'
    const colorIn = input(id, 'color', null) as RGB | null
    const color = colorIn ?? {
      r: byte(num(id, 'r', props, 'r', 0)    / 255),
      g: byte(num(id, 'g', props, 'g', 255)  / 255),
      b: byte(num(id, 'b', props, 'b', 255)  / 255),
    }
    const x = num(id, 'x', props, 'x', 0.5)
    const y = num(id, 'y', props, 'y', 0.5)
    const sx = layout.lines.map((line) => textAlignedStart(x, W, line.cols.length, hAlign, wrap))
    const sy = textAlignedStart(y, H, layout.height, vAlign, wrap)
    const scroll = num(id, 'scroll', props, 'scroll', 0)
    return { frame: renderText(text, color, sx, sy, scroll, scrollAxis, t, font, W, H, wrap, letterSpacing) }
  },
  ClockDisplay({ input, num, t, W, H, stateKey }, id, props) {
    const mode = String(props.displayMode ?? 'Digital HH:MM')
    const colorIn = input(id, 'color', null) as RGB | null
    const color = colorIn ?? {
      r: byte(num(id, 'r', props, 'r', 255)  / 255),
      g: byte(num(id, 'g', props, 'g', 220)  / 255),
      b: byte(num(id, 'b', props, 'b', 90)  / 255),
    }
    // DateTime is the normal one-wire clock feed. It carries health as
    // well as fields, so a stale/unsynced source cannot quietly present a
    // questionable wall clock as correct. The scalar ports remain as a
    // compatibility/synthetic-clock path, but there is deliberately no
    // browser-clock fallback: unwired preview and firmware both show dashes.
    const dateTime = input(id, 'dateTime', null) as RtcPreview | null
    const legacySeconds = input(id, 'secondsOfDay', null)
    const legacyValid = input(id, 'valid', null)
    const valid = dateTime
      ? dateTime.valid && dateTime.synced && !dateTime.stale
      : legacyValid == null ? typeof legacySeconds === 'number' : Boolean(legacyValid)
    const secondsOfDay = Number(dateTime?.secondsOfDay ?? legacySeconds ?? 0)
    const day = Number(dateTime?.day ?? input(id, 'day', 1))
    const month = Number(dateTime?.month ?? input(id, 'month', 1))
    const x = num(id, 'x', props, 'x', 0.5)
    const y = num(id, 'y', props, 'y', 0.5)
    const radiusScale = props.scaleWithMatrix ? matrixSizeScale(W, H) : 1
    const radius = Math.max(2, num(id, 'radius', props, 'radius', 6) * radiusScale)
    const baseIn = input(id, 'base', null) as Frame | null
    const frame = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)

    if (CLOCK_TRANSPORT_MODES.has(mode)) {
      const key = stateKey(id)
      const run = Boolean(input(id, 'run', Boolean(props.run ?? true)))
      const reset = Boolean(input(id, 'reset', Boolean(props.reset ?? false)))
      const duration = Math.max(0, num(id, 'durationSec', props, 'durationSec', 300))
      let st = clockDisplayState.get(key)
      const reinit = !st || t < st.lastT || st.mode !== mode
      if (!st || reinit) {
        st = { lastT: t, elapsed: 0, remaining: duration, prevReset: false, mode, duration }
      }
      const durationChanged = Math.abs(st.duration - duration) > 1e-6
      let dt = Math.min(0.25, Math.max(0, t - st.lastT))
      const resetEdge = reset && !st.prevReset
      if (durationChanged) {
        st.duration = duration
        st.remaining = duration
        dt = 0
      }
      if (resetEdge) {
        st.elapsed = 0
        st.remaining = duration
        dt = 0
      }
      if (run) {
        if (mode === 'Timer') st.remaining = Math.max(0, st.remaining - dt)
        else st.elapsed += dt
      }
      st.lastT = t
      st.prevReset = reset
      st.mode = mode
      clockDisplayState.set(key, st)
      const text = formatTransportText(mode === 'Timer' ? st.remaining : st.elapsed)
      blitText(
        frame,
        `${text.main}\n${text.sub}`,
        color,
        x,
        y,
        DEFAULT_FONT,
        W,
        H,
        textAlignMode(props.hAlign ?? 'center', 'left', 'right'),
        textAlignMode(props.vAlign ?? 'middle', 'top', 'bottom'),
        false,
        0,
      )
      // A Timer reads "done" the instant it reaches zero; a Stopwatch has
      // no end, so it never fires.
      return {
        frame,
        seconds: mode === 'Timer' ? st.remaining : st.elapsed,
        done: mode === 'Timer' && st.remaining <= 0,
      }
    }

    // Clock modes pass the wall clock through so the same node can drive
    // downstream time logic without a second RTC hop.
    const clockOut = { seconds: valid ? secondsOfDay : 0, done: false }

    if (CLOCK_ANALOG_MODES.has(mode)) {
      const cx = normalizedCenterAxis(x, W, radius, false)
      const cy = normalizedCenterAxis(y, H, radius, false)
      renderAnalogClock(frame, valid ? secondsOfDay : 0, color, cx, cy, radius, W, H)
      if (mode === 'Analog + Date') {
        blitText(frame, valid ? clockDateText(day, month) : '--.--', scaleRgb(color, 0.9), x, cy + radius + 1, DEFAULT_FONT, W, H, 'center', 'start', false, 0)
      }
      return { frame, ...clockOut }
    }

    const { hour, minute, second } = clockParts(secondsOfDay)
    let text = '--:--'
    switch (mode) {
      case 'Digital HH:MM:SS':
        text = valid ? `${pad2(hour)}:${pad2(minute)}\n${pad2(second)}` : '--:--\n--'
        break
      case 'Digital 12H': {
        const t12 = formatClockTwelveHour(hour, minute)
        text = valid ? `${t12.main}\n${t12.sub}` : '--:--\n--'
        break
      }
      case 'Digital + Date':
        text = valid ? `${pad2(hour)}:${pad2(minute)}\n${clockDateText(day, month)}` : '--:--\n--.--'
        break
      case 'Digital HH:MM':
      default:
        text = valid ? `${pad2(hour)}:${pad2(minute)}` : '--:--'
        break
    }
    blitText(
      frame,
      text,
      color,
      x,
      y,
      DEFAULT_FONT,
      W,
      H,
      textAlignMode(props.hAlign ?? 'center', 'left', 'right'),
      textAlignMode(props.vAlign ?? 'middle', 'top', 'bottom'),
      false,
      0,
    )
    return { frame, ...clockOut }
  },
  Circle({ input, num, W, H }, id, props) {
    // A circle is Shape's ellipse at aspect 1 — reuse the same SDF renderer
    // so fill/edge/thickness drawing is identical to the Shape node.
    const baseIn = input(id, 'base', null) as Frame | null
    const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
    const fill = (input(id, 'fill', null) as RGB | null) ?? hexToRgb(String(props.fill ?? '#ff3080'))
    const edge = (input(id, 'edge', null) as RGB | null) ?? hexToRgb(String(props.edge ?? '#ff0080'))
    const radiusScale = props.scaleWithMatrix ? matrixSizeScale(W, H) : 1
    const rad = Math.max(0.5, num(id, 'radius', props, 'radius', 6) * radiusScale)
    const thickness = Math.max(0, num(id, 'thickness', props, 'thickness', 1.5))
    const filled = Boolean(props.filled ?? true)
    const wrap = Boolean(props.wrap)
    const extent = rad + thickness * 0.5
    evalWrappedShape(
      frame,
      'ellipse',
      normalizedCenterAxis(num(id, 'cx', props, 'cx', 0.5), W, extent, wrap),
      normalizedCenterAxis(num(id, 'cy', props, 'cy', 0.5), H, extent, wrap),
      rad, 1, 5, 0, thickness, filled,
      fill, edge, W, H,
      wrap,
    )
    return { frame }
  },
  Line({ input, num, W, H }, id, props) {
    const baseIn = input(id, 'base', null) as Frame | null
    const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
    const colorIn = input(id, 'color', null) as RGB | null
    const color = colorIn ?? {
      r: byte(num(id, 'r', props, 'r', 0)    / 255),
      g: byte(num(id, 'g', props, 'g', 200)  / 255),
      b: byte(num(id, 'b', props, 'b', 255)  / 255),
    }
    const x0 = num(id, 'x1', props, 'x1', 0), y0 = num(id, 'y1', props, 'y1', 0)
    const x1 = num(id, 'x2', props, 'x2', 0), y1 = num(id, 'y2', props, 'y2', 0)
    const len = Math.hypot(x1 - x0, y1 - y0)
    const steps = Math.max(1, Math.ceil(len * 2))
    for (let i = 0; i <= steps; i++) {
      const u = i / steps
      splatDisc(frame, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0.5, color)
    }
    return { frame }
  },
  Shape({ input, num, W, H }, id, props) {
    const baseIn = input(id, 'base', null) as Frame | null
    const frame = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
    const shape = String(props.shape ?? 'polygon')
    const size = Math.max(0.5, num(id, 'size', props, 'size', 6))
    const aspect = Math.max(0.01, num(id, 'aspect', props, 'aspect', 1))
    const thickness = Math.max(0, num(id, 'thickness', props, 'thickness', 1.5))
    const wrap = Boolean(props.wrap)
    const fill = (input(id, 'fill', null) as RGB | null) ?? hexToRgb(String(props.fill ?? '#ff3080'))
    const edge = (input(id, 'edge', null) as RGB | null) ?? hexToRgb(String(props.edge ?? '#00e0ff'))
    const extent = shapeExtents(shape, size, aspect, num(id, 'rotation', props, 'rotation', 0), thickness)
    evalWrappedShape(
      frame,
      shape,
      normalizedCenterAxis(num(id, 'cx', props, 'cx', 0.5), W, extent.x, wrap),
      normalizedCenterAxis(num(id, 'cy', props, 'cy', 0.5), H, extent.y, wrap),
      size,
      aspect,
      num(id, 'sides', props, 'sides', 5),
      num(id, 'rotation', props, 'rotation', 0),
      thickness,
      Boolean(props.filled ?? true),
      fill, edge, W, H,
      wrap,
    )
    return { frame }
  },
  Path({ input, num, W, H }, id, props) {
    const baseIn = input(id, 'base', null) as Frame | null
    const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
    const colorIn = input(id, 'color', null) as RGB | null
    const color = colorIn ?? {
      r: byte(num(id, 'r', props, 'r', 255)  / 255),
      g: byte(num(id, 'g', props, 'g', 220)  / 255),
      b: byte(num(id, 'b', props, 'b', 80)   / 255),
    }
    const tt = clamp01(num(id, 't', props, 't', 0))
    const scale = Math.max(0, num(id, 'scale', props, 'scale', 0.8))
    const thickness = Math.max(0.5, num(id, 'thickness', props, 'thickness', 1.25))
    const shape = String(props.pathShape ?? 'circle')
    const p = pathPoint(shape, tt)
    const cx = (W - 1) / 2, cy = (H - 1) / 2
    const radius = thickness * 0.5
    const extent = Math.max(0, Math.min(W, H) * 0.5 * scale - radius)
    splatDisc(frame, cx + p.x * extent, cy - p.y * extent, radius, color)
    return { frame }
  },
  // Rotating 3D wireframe: project every vertex once, then step along
  // each edge splatting AA discs (same technique as Line), dimming by
  // rotated depth when depthShade is on. Kept in lockstep with the
  // Wireframe3D case in cppGenerator.ts.
  Wireframe3D({ input, num, t, W, H }, id, props) {
    const baseIn = input(id, 'base', null) as Frame | null
    const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
    const colorIn = input(id, 'color', null) as RGB | null
    const color = colorIn ?? {
      r: byte(num(id, 'r', props, 'r', 0)    / 255),
      g: byte(num(id, 'g', props, 'g', 200)  / 255),
      b: byte(num(id, 'b', props, 'b', 255)  / 255),
    }
    const mesh = resolveWireframeMesh(props.model, props.mesh)
    const projection = props.projection === 'perspective' ? 'perspective' : 'orthographic'
    const verts = projectWireframeVertices(mesh, {
      spinX: num(id, 'spinX', props, 'spinX', 0),
      spinY: num(id, 'spinY', props, 'spinY', 40),
      spinZ: num(id, 'spinZ', props, 'spinZ', 0),
      t,
      scale: Math.max(0.05, num(id, 'scale', props, 'scale', 1)),
      W, H,
      projection,
      // `num` has already applied the fallback, so only the clamp half of
      // `normProp` is left to do — and it has to stay, because a wired
      // value arrives unbounded where the field came off a 0-1 slider.
      perspectiveStrength: Math.max(0, Math.min(1,
        num(id, 'perspectiveStrength', props, 'perspectiveStrength', 0.4))),
    })
    const depthShade = props.depthShade !== false
    const edgeCount = mesh.edges.length / 2
    for (let e = 0; e < edgeCount; e++) {
      const p0 = verts[mesh.edges[e * 2]], p1 = verts[mesh.edges[e * 2 + 1]]
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y)
      const steps = Math.max(1, Math.ceil(len * 2))
      for (let i = 0; i <= steps; i++) {
        const u = i / steps
        const depth = depthShade ? p0.depth + (p1.depth - p0.depth) * u : 1
        const bright = 0.35 + 0.65 * depth
        splatDisc(frame, p0.x + (p1.x - p0.x) * u, p0.y + (p1.y - p0.y) * u, 0.5, scaleRgb(color, bright))
      }
    }
    return { frame }
  },
  GradientFrame({ input, num, W, H }, id, props) {
    const cA = (input(id, 'colorA', null) as RGB | null) ?? {
      r: byte(num(id, 'rA', props, 'rA', 0) / 255),
      g: byte(num(id, 'gA', props, 'gA', 200) / 255),
      b: byte(num(id, 'bA', props, 'bA', 255) / 255),
    }
    const cB = (input(id, 'colorB', null) as RGB | null) ?? {
      r: byte(num(id, 'rB', props, 'rB', 255) / 255),
      g: byte(num(id, 'gB', props, 'gB', 0) / 255),
      b: byte(num(id, 'bB', props, 'bB', 255) / 255),
    }
    return { frame: evalGradientFrame(cA, cB, Boolean(input(id, 'vertical', Boolean(props.vertical))), W, H) }
  },
  PaletteGradient({ num, pal, t, W, H }, id, props) {
    const angle   = num(id, 'angle', props, 'angle', 45)
    const repeat  = num(id, 'repeat', props, 'repeat', 1)
    const speed   = denormRate(num(id, 'speed', props, 'speed', 0), SPEED_MAX.PaletteGradient)
    const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
    return { frame: evalPaletteGradient(angle, repeat, speed, t, palette, W, H) }
  },
  Image({ num, t, W, H }, id, props) {
    // A loaded animation takes precedence over a still; a node has one or
    // the other (ImageNodeBody clears whichever it isn't).
    const animation = asAnimatedImage(props.animation)
    let img: ImageData | null
    if (animation) {
      const rawRate = num(id, 'playbackRate', props, 'playbackRate', 1)
      const rate = Number.isFinite(rawRate) ? Math.max(0.25, Math.min(4, rawRate)) : 1
      img = animatedImageFrame(animation, t * 1000 * rate, Boolean(props.loop ?? true))
    } else {
      img = asImage(props.image)
    }
    return {
      frame: img ? sampleImageToFrame(img, W, H, {
        fit: props.fit as 'stretch' | 'contain' | 'cover' | 'original',
        positionX: num(id, 'positionX', props, 'positionX', 0.5),
        positionY: num(id, 'positionY', props, 'positionY', 0.5),
        rotation: num(id, 'rotation', props, 'rotation', Number(props.rotation ?? 0)),
        flipX: Boolean(props.flipX),
        flipY: Boolean(props.flipY),
        sampling: props.sampling === 'smooth' ? 'smooth' : 'nearest',
        brightness: num(id, 'brightness', props, 'brightness', 1),
        background: hexToRgb(String(props.background ?? '#000000')),
        zoom: num(id, 'zoom', props, 'zoom', 1),
        cropX: num(id, 'cropX', props, 'cropX', 0.5),
        cropY: num(id, 'cropY', props, 'cropY', 0.5),
        saturation: num(id, 'saturation', props, 'saturation', 1),
        contrast: num(id, 'contrast', props, 'contrast', 1),
        hueShift: num(id, 'hueShift', props, 'hueShift', 0),
        monochrome: Boolean(props.monochrome),
        gamma: num(id, 'gamma', props, 'gamma', 1),
        paletteLevels: props.paletteLevels as number | string,
        dithering: props.dithering === 'ordered2x2' || props.dithering === 'ordered4x4' ? props.dithering : 'none',
      }) : blankFrame(W, H),
      // Publish the validated raw property object (rather than the fresh
      // wrapper returned by asImage/asAnimatedImage) so palette extraction
      // can cache against stable upload identity across preview frames.
      image: animation
        ? props.animation as ImagePaletteSource
        : img
          ? props.image as ImagePaletteSource
          : null,
    }
  },
}
