import type { StudioNode, StudioEdge } from './graphStore'
import { useAudioStore } from './audioStore'
import { asFont, textColumns, type BitmapFont, DEFAULT_FONT } from './font'
import { asImage, sampleImageToFrame } from './image'
import { waveSample, combineWaves } from './wave'

export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x]

// Default grid dimensions; overridden by evaluateGraph params
const DEFAULT_W = 16
const DEFAULT_H = 16

// ── Persistent state for stateful pattern nodes ───────────────────────────────
const fireHeat    = new Map<string, number[][]>()
const flashLevel  = new Map<string, number>()
const counterVals = new Map<string, number>()

interface Particle { x: number; y: number; vx: number; vy: number; life: number; r: number; g: number; b: number }
const particleState = new Map<string, Particle[]>()
const patternMasterState = new Map<string, { idx: number; lastBeat: boolean }>()

interface RDState { u: Float32Array; v: Float32Array; un: Float32Array; vn: Float32Array; w: number; h: number }
const rdState = new Map<string, RDState>()

interface GolState { cells: Uint8Array; next: Uint8Array; bright: Float32Array; w: number; h: number; lastStep: number; stale: number }
const golState = new Map<string, GolState>()

interface FlowState { px: Float32Array; py: Float32Array; trail: Float32Array; w: number; h: number }
const flowState = new Map<string, FlowState>()

interface StarState { x: Float32Array; y: Float32Array; z: Float32Array; w: number; h: number }
const starState = new Map<string, StarState>()

type FormulaFn = (x: number, y: number, t: number, W: number, H: number, a: number, b: number) => number
const formulaCache = new Map<string, FormulaFn | null>()

// ── Simplex noise 2D ─────────────────────────────────────────────────────────
const _PERM = (() => {
  const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180]
  const t = new Uint8Array(512); for (let i = 0; i < 512; i++) t[i] = p[i & 255]; return t
})()
const _G2 = [1,1, -1,1, 1,-1, -1,-1, 1,0, -1,0, 0,1, 0,-1]
function _snoise2(x: number, y: number): number {
  const F2 = (Math.sqrt(3) - 1) / 2, G2 = (3 - Math.sqrt(3)) / 6
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s)
  const t0 = (i + j) * G2, x0 = x - i + t0, y0 = y - j + t0
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2*G2, y2 = y0 - 1 + 2*G2
  const ii = i & 255, jj = j & 255
  function dot(h: number, gx: number, gy: number) { return _G2[(h&7)*2]*gx + _G2[(h&7)*2+1]*gy }
  let n0 = 0, n1 = 0, n2 = 0
  let a = 0.5 - x0*x0 - y0*y0; if (a > 0) { a *= a; n0 = a*a*dot(_PERM[ii+_PERM[jj]], x0, y0) }
  let b = 0.5 - x1*x1 - y1*y1; if (b > 0) { b *= b; n1 = b*b*dot(_PERM[ii+i1+_PERM[jj+j1]], x1, y1) }
  let c = 0.5 - x2*x2 - y2*y2; if (c > 0) { c *= c; n2 = c*c*dot(_PERM[ii+1+_PERM[jj+1]], x2, y2) }
  return 70 * (n0 + n1 + n2)
}

// ── Colour helpers ────────────────────────────────────────────────────────────
function hsv(h: number, s: number, v: number): RGB {
  h = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else              { r = c; b = x }
  return { r: byte(r + m), g: byte(g + m), b: byte(b + m) }
}

function byte(v: number): number { return Math.max(0, Math.min(255, Math.round(v * 255))) }

// Approximate black-body white point for a colour temperature in Kelvin
// (Tanner Helland's approximation): ~1900K candle → ~6500K daylight → blue.
function kelvinToRgb(kelvin: number): RGB {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  let r: number, g: number, b: number
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661 }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492) }
  if (t >= 66) b = 255
  else if (t <= 19) b = 0
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return { r: clamp(r), g: clamp(g), b: clamp(b) }
}

function solidFrame(color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ ...color })))
}

function blankFrame(W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
}

// Deep copy so painting onto a base frame never mutates an upstream node's
// memoised output.
function cloneFrame(frame: Frame): Frame {
  return frame.map(row => row.map(px => ({ ...px })))
}

// Render `text` onto a blank frame at (startX, startY), optionally scrolling
// left over time (scroll = columns/second). Shares textColumns() with codegen.
function renderText(text: string, color: RGB, startX: number, startY: number, scroll: number, t: number, font: BitmapFont = DEFAULT_FONT, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const frame = blankFrame(W, H)
  const cols = textColumns(text, font)
  if (cols.length === 0) return frame
  const total = cols.length + W
  const offset = scroll !== 0 ? Math.floor((((t * scroll) % total) + total) % total) : 0
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
  return frame
}

// ── Pattern evaluators ────────────────────────────────────────────────────────
function evalNoiseField(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v = (Math.sin(x * scale * 0.5 + t * speed) +
                 Math.cos(y * scale * 0.5 + t * speed * 0.7)) / 2
      return hsv((v + 1) * 180 + t * 30, 1, 0.85)
    })
  )
}

function evalPlasma(speed: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v = Math.sin(x / 3 + t * speed)
              + Math.sin(y / 3 + t * speed * 0.8)
              + Math.sin((x + y) / 5 + t * speed * 0.6)
              + Math.sin(Math.hypot(x - W / 2, y - H / 2) / 3 + t * speed * 0.5)
      return hsv(v * 45 + t * 20, 1, 0.9)
    })
  )
}

function evalFire(nodeId: string, intensity: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const stored = fireHeat.get(nodeId)
  if (!stored || stored.length !== H || stored[0].length !== W) {
    fireHeat.set(nodeId, Array.from({ length: H }, () => Array(W).fill(0)))
  }
  const heat = fireHeat.get(nodeId)!
  const cooling = 0.05

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = Math.max(0, heat[y][x] - cooling - Math.random() * cooling)

  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = (
        heat[y][x] +
        heat[y + 1][Math.max(0, x - 1)] +
        heat[y + 1][x] +
        heat[y + 1][Math.min(W - 1, x + 1)]
      ) / 4

  const sparking = 0.4 + intensity * 0.55
  for (let x = 0; x < W; x++)
    if (Math.random() < sparking)
      heat[H - 1][x] = Math.min(1, 0.75 + Math.random() * 0.25)

  return heat.map(row =>
    row.map(h => {
      if (h < 0.33) return { r: byte(h * 3),       g: 0,               b: 0 }
      if (h < 0.66) return { r: 255,                g: byte((h - 0.33) * 3), b: 0 }
                    return { r: 255,                g: 255,             b: byte((h - 0.66) * 3) }
    })
  )
}

function evalSpectrumBars(bass: number, mids: number, treble: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const frame: Frame = blankFrame(W, H)
  const bands: Array<{ start: number; end: number; val: number; hueBase: number }> = [
    { start: 0,         end: Math.floor(W * 0.33),  val: bass,   hueBase: 0   },
    { start: Math.floor(W * 0.34), end: Math.floor(W * 0.66),  val: mids,   hueBase: 180 },
    { start: Math.floor(W * 0.67), end: W - 1,      val: treble, hueBase: 270 },
  ]
  for (const { start, end, val, hueBase } of bands) {
    const barH = Math.round(Math.max(0, Math.min(1, val)) * H)
    for (let col = start; col <= end; col++)
      for (let row = 0; row < barH; row++) {
        const y = H - 1 - row
        frame[y][col] = hsv(hueBase + (row / H) * 60, 1, 0.9)
      }
  }
  return frame
}

function evalBassPulse(bass: number, color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const v = Math.pow(bass, 0.5)
  const lit: RGB = { r: Math.round(color.r * v), g: Math.round(color.g * v), b: Math.round(color.b * v) }
  return solidFrame(lit, W, H)
}

function evalMidrangeWaves(mids: number, speed: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const wave = Math.sin(x * 0.8 + t * speed * 4) * Math.sin(y * 0.5 + t * speed * 2.5)
      const v = (wave + 1) / 2 * (0.3 + mids * 0.7)
      return hsv(200 + wave * 40, 1, v)
    })
  )
}

function evalTrebleSparks(treble: number, density: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const frame = blankFrame(W, H)
  const threshold = 1 - density * treble
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (Math.random() > threshold) {
        const b = Math.random() * treble
        frame[y][x] = hsv(Math.random() * 60 + 180, 0.6 + Math.random() * 0.4, b)
      }
  return frame
}

function evalBeatFlash(nodeId: string, beat: boolean, base: Frame | null, decay: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  let level = flashLevel.get(nodeId) ?? 0
  if (beat) level = 1
  else level = level * decay
  flashLevel.set(nodeId, level)

  const src = base ?? blankFrame(W, H)
  if (level < 0.01) return src

  return src.map(row =>
    row.map(px => ({
      r: Math.min(255, Math.round(px.r + (255 - px.r) * level)),
      g: Math.min(255, Math.round(px.g + (255 - px.g) * level)),
      b: Math.min(255, Math.round(px.b + (255 - px.b) * level)),
    }))
  )
}

/** A palette is either a named preset or an ordered list of custom colors. */
export type Palette = string | RGB[]

function samplePalette(palette: Palette, t: number): RGB {
  const h = ((t % 1) + 1) % 1
  if (Array.isArray(palette)) {
    const stops = palette
    if (stops.length === 0) return { r: 0, g: 0, b: 0 }
    if (stops.length === 1) return { ...stops[0] }
    const scaled = h * (stops.length - 1)
    const i = Math.floor(scaled)
    const f = scaled - i
    const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)]
    return {
      r: Math.round(a.r * (1 - f) + b.r * f),
      g: Math.round(a.g * (1 - f) + b.g * f),
      b: Math.round(a.b * (1 - f) + b.b * f),
    }
  }
  switch (palette) {
    case 'heat':
      if (h < 0.33) return { r: Math.round(h * 3 * 255), g: 0, b: 0 }
      if (h < 0.66) return { r: 255, g: Math.round(((h - 0.33) / 0.33) * 255), b: 0 }
      return { r: 255, g: 255, b: Math.round(((h - 0.66) / 0.34) * 255) }
    case 'ocean':
      return hsv(200 + h * 40, 0.8 + h * 0.2, h * 0.9 + 0.1)
    case 'lava':
      return hsv(h * 40, 1, h > 0.08 ? 0.9 : h * 11)
    case 'forest':
      return hsv(90 + h * 60, 0.7 + h * 0.3, 0.4 + h * 0.6)
    case 'party':
      return hsv(((h * 360 * 6.7) % 360 + 360) % 360, 1, 1)
    default: // rainbow
      return hsv(h * 360, 1, 1)
  }
}

function evalNoise2D(speed: number, scale: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * Math.sin(x * freq + t * speed + oct * 1.7) * Math.cos(y * freq * 1.3 + t * speed * 0.8 + oct * 2.3)
        amp *= 0.5; freq *= 2.1
      }
      return hsv((v * 0.5 + 0.5) * 360, 1, 0.85)
    })
  )
}

function evalRadialBurst(speed: number, color: RGB, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const dist = Math.hypot(x - cx, y - cy) / maxD
      const wave = (Math.sin((dist * 8 - t * speed * 3) * Math.PI) + 1) / 2
      return { r: Math.round(color.r * wave), g: Math.round(color.g * wave), b: Math.round(color.b * wave) }
    })
  )
}

function evalSpiral(speed: number, arms: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const dx = x - cx, dy = y - cy
      const dist = Math.hypot(dx, dy) / maxD
      const angle = Math.atan2(dy, dx)
      const spiral = (angle + dist * Math.PI * 4 - t * speed * Math.PI) * arms
      const v = (Math.sin(spiral) + 1) / 2
      return hsv(dist * 360 + t * 30, 1, v * 0.9)
    })
  )
}

function evalKaleidoscope(src: Frame, segments: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const cx = W / 2, cy = H / 2
  const segAngle = (Math.PI * 2) / Math.max(2, segments)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const dx = x - cx, dy = y - cy
      const dist = Math.hypot(dx, dy)
      let angle = ((Math.atan2(dy, dx) % segAngle) + segAngle) % segAngle
      if (angle > segAngle / 2) angle = segAngle - angle
      const sx = Math.round(cx + dist * Math.cos(angle))
      const sy = Math.round(cy + dist * Math.sin(angle))
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) return { r: 0, g: 0, b: 0 }
      return { ...src[sy][sx] }
    })
  )
}

function evalParticles(nodeId: string, rate: number, color: RGB, decay: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  if (!particleState.has(nodeId)) particleState.set(nodeId, [])
  const particles = particleState.get(nodeId)!
  if (Math.random() < rate)
    particles.push({ x: Math.random() * W, y: H - 1, vx: (Math.random() - 0.5) * 0.6, vy: -(Math.random() * 0.5 + 0.1), life: 1, r: color.r, g: color.g, b: color.b })
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.life *= decay }
  const active = particles.filter(p => p.life > 0.04 && p.y >= 0)
  particleState.set(nodeId, active)
  const frame = blankFrame(W, H)
  for (const p of active) {
    const px = Math.round(p.x), py = Math.round(p.y)
    if (px >= 0 && px < W && py >= 0 && py < H)
      frame[py][px] = { r: Math.min(255, Math.round(p.r * p.life)), g: Math.min(255, Math.round(p.g * p.life)), b: Math.min(255, Math.round(p.b * p.life)) }
  }
  return frame
}

function evalGradientFrame(cA: RGB, cB: RGB, vertical: boolean, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const t = vertical ? y / (H - 1) : x / (W - 1)
      return { r: Math.round(cA.r * (1-t) + cB.r * t), g: Math.round(cA.g * (1-t) + cB.g * t), b: Math.round(cA.b * (1-t) + cB.b * t) }
    })
  )
}

function evalSimplex2D(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 4; oct++) {
        v += amp * _snoise2(x * freq + t * speed * 0.13, y * freq + t * speed * 0.1)
        amp *= 0.5; freq *= 2
      }
      return samplePalette(palette, (v * 0.5 + 0.5) % 1)
    })
  )
}

function evalNoise3D(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  // 3D via two orthogonal 2D slices animated along the z (time) axis
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const z = t * speed * 0.08
      let v = 0, amp = 1, freq = scale
      for (let oct = 0; oct < 3; oct++) {
        v += amp * (_snoise2(x * freq + z * 0.37, y * freq) * 0.6 +
                    _snoise2(x * freq * 0.9, y * freq + z * 0.61) * 0.4)
        amp *= 0.5; freq *= 2.1
      }
      return samplePalette(palette, ((v * 0.5 + 0.5) % 1 + 1) % 1)
    })
  )
}

// Integer hash → [0,1), used to place a feature point per cell for Worley noise.
function worleyHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Worley (cellular) noise: distance to the nearest animated feature point,
// coloured through a palette. Feature points jitter on a circle over time.
function evalWorley(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const px = x * scale, py = y * scale
      const xi = Math.floor(px), yi = Math.floor(py)
      let f1 = Infinity
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj
          const hh = worleyHash(cx, cy)
          const fx = cx + 0.5 + 0.45 * Math.sin(t * speed + hh * 6.2831)
          const fy = cy + 0.5 + 0.45 * Math.cos(t * speed * 1.1 + hh * 6.2831)
          const d = Math.hypot(px - fx, py - fy)
          if (d < f1) f1 = d
        }
      return samplePalette(palette, Math.min(1, f1))
    })
  )
}

// Gabor noise: sparse-convolution noise summing one Gaussian-windowed cosine
// (Gabor) kernel per grid cell. `orientation` fixes the band direction (the
// anisotropic variant) and `frequency` the band spacing; phase animates over
// time. Coloured through a palette.
function evalGaborNoise(speed: number, scale: number, frequency: number, orientation: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const omega = (orientation * Math.PI) / 180
  const cosO = Math.cos(omega), sinO = Math.sin(omega)
  const TAU = Math.PI * 2
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const px = x * scale, py = y * scale
      const xi = Math.floor(px), yi = Math.floor(py)
      let v = 0
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj
          const h = worleyHash(cx, cy)
          const h2 = worleyHash(cx + 31, cy - 17)
          const fx = cx + 0.5 + (h - 0.5)
          const fy = cy + 0.5 + (h2 - 0.5)
          const dx = px - fx, dy = py - fy
          const gauss = Math.exp(-2.5 * (dx * dx + dy * dy))
          const proj = dx * cosO + dy * sinO
          const w = h2 < 0.5 ? 1 : -1
          v += w * gauss * Math.cos(TAU * frequency * proj + t * speed + h * TAU)
        }
      return samplePalette(palette, v * 0.5 + 0.5)
    })
  )
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
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const tnorm = (x * cosA + y * sinA - projMin) / range
      return samplePalette(palette, tnorm * repeat + t * speed)
    })
  )
}

// Fractal (fBm) noise: sum simplex octaves at doubling frequency / halving
// amplitude for a detailed, cloud-like field, coloured through a palette.
function evalFractalNoise(speed: number, scale: number, octaves: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const z = t * speed * 0.15
  const oct = Math.max(1, Math.min(6, Math.floor(octaves)))
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let v = 0, amp = 0.5, freq = scale, norm = 0
      for (let o = 0; o < oct; o++) {
        v += amp * _snoise2(x * freq + z, y * freq - z * 0.5)
        norm += amp; amp *= 0.5; freq *= 2
      }
      const n = (v / norm) * 0.5 + 0.5
      return samplePalette(palette, ((n % 1) + 1) % 1)
    })
  )
}

// Metaballs: several moving charges; each pixel's field is the summed inverse-
// square influence, mapped smoothly to a palette (lava-lamp blobs).
function evalBlobs(speed: number, scale: number, count: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const n = Math.max(1, Math.min(6, Math.floor(count)))
  const r2 = (scale * Math.min(W, H)) ** 2
  const bx: number[] = [], by: number[] = []
  for (let i = 0; i < n; i++) {
    bx.push(W * (0.5 + 0.4 * Math.sin(t * speed * (0.7 + i * 0.13) + i * 1.7)))
    by.push(H * (0.5 + 0.4 * Math.cos(t * speed * (0.6 + i * 0.17) + i * 2.3)))
  }
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let f = 0
      for (let i = 0; i < n; i++) { const dx = x - bx[i], dy = y - by[i]; f += r2 / (dx * dx + dy * dy + 1) }
      return samplePalette(palette, f / (f + 1))
    })
  )
}

// Flow field: particles drift along a simplex-noise direction field, depositing
// fading trails that are coloured through a palette. Stateful.
function evalFlowField(nodeId: string, speed: number, scale: number, count: number, fade: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const N = W * H
  const pc = Math.max(8, Math.min(400, Math.floor(count)))
  let s = flowState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.px.length !== pc) {
    const px = new Float32Array(pc), py = new Float32Array(pc)
    for (let i = 0; i < pc; i++) { px[i] = Math.random() * W; py[i] = Math.random() * H }
    s = { px, py, trail: new Float32Array(N), w: W, h: H }
    flowState.set(nodeId, s)
  }
  const { px, py, trail } = s
  const f = Math.max(0, Math.min(1, fade))
  for (let i = 0; i < N; i++) trail[i] *= f
  const z = t * 0.1
  for (let i = 0; i < pc; i++) {
    const a = _snoise2(px[i] * scale + z, py[i] * scale) * Math.PI * 4
    px[i] = ((px[i] + Math.cos(a) * speed * 0.6) % W + W) % W
    py[i] = ((py[i] + Math.sin(a) * speed * 0.6) % H + H) % H
    const idx = Math.floor(py[i]) * W + Math.floor(px[i])
    trail[idx] = Math.min(1, trail[idx] + 0.5)
  }
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => samplePalette(palette, trail[y * W + x]))
  )
}

// Warp starfield: stars fly outward from the centre; nearer stars are brighter.
function evalStarfield(nodeId: string, speed: number, count: number, color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const pc = Math.max(8, Math.min(300, Math.floor(count)))
  let s = starState.get(nodeId)
  if (!s || s.w !== W || s.h !== H || s.x.length !== pc) {
    const x = new Float32Array(pc), y = new Float32Array(pc), z = new Float32Array(pc)
    for (let i = 0; i < pc; i++) { x[i] = Math.random() * 2 - 1; y[i] = Math.random() * 2 - 1; z[i] = Math.random() * 0.9 + 0.1 }
    s = { x, y, z, w: W, h: H }; starState.set(nodeId, s)
  }
  const { x, y, z } = s
  const frame = blankFrame(W, H)
  for (let i = 0; i < pc; i++) {
    z[i] -= speed * 0.015
    if (z[i] <= 0.02) { x[i] = Math.random() * 2 - 1; y[i] = Math.random() * 2 - 1; z[i] = 1 }
    const px = Math.round(W / 2 + (x[i] / z[i]) * W * 0.35), py = Math.round(H / 2 + (y[i] / z[i]) * H * 0.35)
    if (px >= 0 && px < W && py >= 0 && py < H) {
      const b = Math.min(1, 1 - z[i])
      frame[py][px] = { r: Math.round(color.r * b), g: Math.round(color.g * b), b: Math.round(color.b * b) }
    }
  }
  return frame
}

// Plasma blended with fractal (simplex) noise for an organic flowing field.
function evalPlasmaFractal(speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let v = Math.sin(x * 0.2 + t * speed) + Math.sin(y * 0.25 + t * speed * 0.8) + Math.sin((x + y) * 0.15 + t * speed * 0.6)
      let amp = 1, freq = scale, fn = 0
      for (let o = 0; o < 3; o++) { fn += amp * _snoise2(x * freq + t * speed * 0.1, y * freq); amp *= 0.5; freq *= 2 }
      v += fn * 2.5
      return samplePalette(palette, (((v * 0.15) % 1) + 1) % 1)
    })
  )
}

// Audio-reactive flow: a simplex band field scrolling at a speed set by mids,
// brightness pulsed by bass, hue nudged by treble.
function evalAudioFlow(bass: number, mids: number, treble: number, speed: number, scale: number, t: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const flow = t * speed * (0.2 + mids * 1.5)
  const bright = Math.min(1, 0.3 + bass)
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v = _snoise2(x * scale + flow, y * scale * 0.6) * 0.5 + 0.5
      const c = samplePalette(palette, (((v + treble * 0.3) % 1) + 1) % 1)
      return { r: Math.round(c.r * bright), g: Math.round(c.g * bright), b: Math.round(c.b * bright) }
    })
  )
}

// Gray-Scott reaction-diffusion. Two chemicals U, V diffuse on a toroidal grid
// and react; V is coloured through a palette. Stateful — steps each frame.
function evalReactionDiffusion(nodeId: string, feed: number, kill: number, iters: number, palette: Palette, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const N = W * H
  let s = rdState.get(nodeId)
  if (!s || s.w !== W || s.h !== H) {
    const u = new Float32Array(N).fill(1), v = new Float32Array(N)
    // Seed a small central patch of V to kick off the reaction.
    for (let y = (H >> 1) - 2; y <= (H >> 1) + 1; y++)
      for (let x = (W >> 1) - 2; x <= (W >> 1) + 1; x++)
        if (x >= 0 && x < W && y >= 0 && y < H) { u[y * W + x] = 0.5; v[y * W + x] = 0.25 + worleyHash(x, y) * 0.5 }
    s = { u, v, un: new Float32Array(N), vn: new Float32Array(N), w: W, h: H }
    rdState.set(nodeId, s)
  }
  const Du = 0.16, Dv = 0.08
  for (let it = 0; it < iters; it++) {
    const { u, v, un, vn } = s
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W, xp = (x + 1) % W, i = yr + x
        const lapU = (u[ym + x] + u[yp + x] + u[yr + xm] + u[yr + xp]) * 0.2
          + (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) * 0.05 - u[i]
        const lapV = (v[ym + x] + v[yp + x] + v[yr + xm] + v[yr + xp]) * 0.2
          + (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) * 0.05 - v[i]
        const uvv = u[i] * v[i] * v[i]
        un[i] = Math.max(0, Math.min(1, u[i] + Du * lapU - uvv + feed * (1 - u[i])))
        vn[i] = Math.max(0, Math.min(1, v[i] + Dv * lapV + uvv - (kill + feed) * v[i]))
      }
    }
    s.u = un; s.un = u; s.v = vn; s.vn = v   // swap front/back buffers
  }
  const v = s.v
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => samplePalette(palette, v[y * W + x]))
  )
}

// Conway's Game of Life on a toroidal grid. Live cells glow in `color`; dead
// cells fade out (trails). Steps at `speed`/sec and reseeds when it stagnates.
function evalGameOfLife(nodeId: string, color: RGB, speed: number, fade: number, tick: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const N = W * H
  const seed = (cells: Uint8Array) => { for (let i = 0; i < N; i++) cells[i] = Math.random() < 0.3 ? 1 : 0 }
  let s = golState.get(nodeId)
  if (!s || s.w !== W || s.h !== H) {
    const cells = new Uint8Array(N); seed(cells)
    s = { cells, next: new Uint8Array(N), bright: new Float32Array(N), w: W, h: H, lastStep: -1e9, stale: 0 }
    golState.set(nodeId, s)
  }
  const interval = Math.max(1, Math.round(60 / Math.max(1, Math.min(60, speed))))
  if (tick - s.lastStep >= interval) {
    const { cells, next } = s
    let pop = 0, changed = false
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yr = y * W
      for (let x = 0; x < W; x++) {
        const xm = (x - 1 + W) % W, xp = (x + 1) % W, i = yr + x
        const n = cells[ym + xm] + cells[ym + x] + cells[ym + xp] + cells[yr + xm]
          + cells[yr + xp] + cells[yp + xm] + cells[yp + x] + cells[yp + xp]
        const nv = cells[i] ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
        next[i] = nv; pop += nv; if (nv !== cells[i]) changed = true
      }
    }
    s.cells = next; s.next = cells   // swap
    s.stale = (pop === 0 || !changed) ? s.stale + 1 : 0
    if (s.stale > 3) { seed(s.cells); s.stale = 0 }
    s.lastStep = tick
  }
  const { cells, bright } = s
  const f = Math.max(0, Math.min(1, fade))
  for (let i = 0; i < N; i++) bright[i] = cells[i] ? 1 : bright[i] * f
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const b = bright[y * W + x]
      return { r: Math.round(color.r * b), g: Math.round(color.g * b), b: Math.round(color.b * b) }
    })
  )
}

function heatColor(temperature: number): RGB {
  const t192 = Math.floor(temperature * 191 / 255)
  const ramp = (t192 & 0x3F) << 2
  if (t192 > 0x80) return { r: 255, g: 255, b: ramp }
  if (t192 > 0x40) return { r: 255, g: ramp, b: 0 }
  return { r: ramp, g: 0, b: 0 }
}

const fire2012Heat = new Map<string, Uint8Array[]>()

function evalFire2012(nodeId: string, cooling: number, sparking: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const stored = fire2012Heat.get(nodeId)
  let heat: Uint8Array[]
  if (!stored || stored.length !== H || stored[0].length !== W) {
    heat = Array.from({ length: H }, () => new Uint8Array(W))
    fire2012Heat.set(nodeId, heat)
  } else {
    heat = stored
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cool = Math.floor(Math.random() * ((cooling * 10 / H) + 2))
      heat[y][x] = Math.max(0, heat[y][x] - cool)
    }
  for (let y = 0; y < H - 2; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = Math.floor(
        (heat[y+1][x] + heat[y+2][Math.max(0,x-1)] + heat[y+2][x] + heat[y+2][Math.min(W-1,x+1)]) / 4
      )
  for (let x = 0; x < W; x++)
    if (Math.random() * 255 < sparking)
      heat[H-1][x] = Math.min(255, heat[H-1][x] + Math.floor(Math.random() * 95) + 160)
  return heat.map(row => Array.from(row).map(h => heatColor(h)))
}

function evalBlur2D(src: Frame, amount: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const radius = Math.max(1, Math.round(amount / 255 * 3))
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
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
  )
}

function evalWipe(a: Frame, b: Frame, tt: number, direction: string, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      let revealed: boolean
      switch (direction) {
        case 'left':  revealed = x > W * (1 - tt); break
        case 'up':    revealed = y > H * (1 - tt); break
        case 'down':  revealed = y < H * tt;       break
        default:      revealed = x < W * tt;       break // 'right'
      }
      return revealed ? { ...b[y][x] } : { ...a[y][x] }
    })
  )
}

function evalDissolve(a: Frame, b: Frame, tt: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const hash = (((x * 1664525 + y * 1013904223) >>> 0) / 0xffffffff)
      return hash < tt ? { ...b[y][x] } : { ...a[y][x] }
    })
  )
}

function evalPatternMaster(nodeId: string, frames: (Frame | null)[], beat: boolean, mode: string, interval: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const valid = frames.filter((f): f is Frame => f !== null)
  if (valid.length === 0) return blankFrame(W, H)

  let idx: number
  if (mode === 'beat') {
    const prev = patternMasterState.get(nodeId) ?? { idx: 0, lastBeat: false }
    if (beat && !prev.lastBeat) {
      idx = (prev.idx + 1) % valid.length
    } else {
      idx = Math.min(prev.idx, valid.length - 1)
    }
    patternMasterState.set(nodeId, { idx, lastBeat: beat })
  } else {
    idx = Math.floor(t / Math.max(0.1, interval)) % valid.length
  }

  return valid[idx]
}

/** Per-pixel linear blend of two frames, m=0 → a, m=1 → b. */
function blendFrame(a: Frame, b: Frame, m: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const k = Math.max(0, Math.min(1, m))
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const pa = a[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      const pb = b[y]?.[x] ?? { r: 0, g: 0, b: 0 }
      return {
        r: Math.round(pa.r * (1 - k) + pb.r * k),
        g: Math.round(pa.g * (1 - k) + pb.g * k),
        b: Math.round(pa.b * (1 - k) + pb.b * k),
      }
    })
  )
}

/**
 * Timeline-as-a-node: cycles through its frame inputs, holding each for
 * `interval` seconds and crossfading into the next over the trailing `fade`
 * seconds. Stateless — fully determined by `t`.
 */
function evalSequencer(frames: (Frame | null)[], interval: number, fade: number, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  const valid = frames.filter((f): f is Frame => f !== null)
  if (valid.length === 0) return blankFrame(W, H)
  if (valid.length === 1) return valid[0]

  const iv = Math.max(0.1, interval)
  const phase = t / iv
  const idx = Math.floor(phase) % valid.length
  const into = (phase - Math.floor(phase)) * iv          // seconds into this slot
  const fadeDur = Math.max(0, Math.min(fade, iv))
  if (fadeDur <= 0 || into < iv - fadeDur) return valid[idx]

  const m = (into - (iv - fadeDur)) / fadeDur            // 0 → 1 across the fade
  return blendFrame(valid[idx], valid[(idx + 1) % valid.length], m, W, H)
}

function evalCustomFormula(formula: string, a: number, b: number, palette: Palette, t: number, W = DEFAULT_W, H = DEFAULT_H): Frame {
  if (!formulaCache.has(formula)) {
    if (formulaCache.size > 50) formulaCache.clear()
    try {
      const fn = new Function('x', 'y', 't', 'W', 'H', 'a', 'b',
        `"use strict"; const {sin,cos,abs,sqrt,pow,floor,ceil,round,min,max,PI,tan,atan2,log,exp,hypot}=Math; return (${formula});`
      ) as FormulaFn
      formulaCache.set(formula, fn)
    } catch {
      formulaCache.set(formula, null)
    }
  }
  const fn = formulaCache.get(formula)
  if (!fn) return blankFrame(W, H)

  return Array.from({ length: H }, (_, yi) =>
    Array.from({ length: W }, (_, xi) => {
      try {
        const v = fn(xi / (W - 1 || 1), yi / (H - 1 || 1), t, W, H, a, b)
        return samplePalette(palette, ((v % 1) + 1) % 1)
      } catch {
        return { r: 0, g: 0, b: 0 }
      }
    })
  )
}

// ── Main entry point ──────────────────────────────────────────────────────────

type PortValue = number | boolean | string | RGB | RGB[] | Frame | null

/** A reusable pattern group: a named subgraph that a `Group` node evaluates. */
export interface GroupDef { nodes: StudioNode[]; edges: StudioEdge[] }
export type GroupRegistry = Record<string, GroupDef>

export function evaluateGraph(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
  groups: GroupRegistry = {},
  // Internal recursion bookkeeping for nested groups — callers leave these
  // defaulted. `instancePrefix` namespaces stateful-node state per group
  // instance; `groupStack` breaks group-level recursion; `groupInputs` carries
  // the values bound to the current group's exposed parameters (paramId → value).
  instancePrefix = '',
  groupStack: ReadonlySet<string> = new Set(),
  groupInputs: Record<string, PortValue> = {},
): Frame | null {
  const W = gridW
  const H = gridH
  if (nodes.length === 0) return null

  const t = tick / 60   // seconds at assumed 60 fps

  // State maps are module-level and keyed by node id; prefix with the group
  // instance path so two instances of the same group don't share state.
  const stateKey = (id: string) => instancePrefix + id

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Map "targetNodeId:targetPortId" → upstream {srcId, srcPort}
  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  for (const edge of edges) {
    if (edge.source && edge.target && edge.sourceHandle && edge.targetHandle)
      incoming.set(`${edge.target}:${edge.targetHandle}`, {
        srcId: edge.source,
        srcPort: edge.sourceHandle,
      })
  }

  const memo = new Map<string, Record<string, PortValue>>()
  // Nodes currently on the evaluation stack — used to break graph cycles.
  const inProgress = new Set<string>()

  // Resolve one input port: walk the edge map, fall back to `fallback`
  function input(nodeId: string, portId: string, fallback: PortValue): PortValue {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (!up) return fallback
    return evalNode(up.srcId)[up.srcPort] ?? fallback
  }

  function num(nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def = 0): number {
    return Number(input(nodeId, portId, Number(props[propKey] ?? def)))
  }

  // Resolve a palette: prefer a connected `palette` port (a preset name from
  // PaletteSelector or custom colors from CustomPalette), else the node's
  // property (a preset name).
  function pal(nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def: string): Palette {
    const fallback = String(props[propKey] ?? def)
    const v = input(nodeId, portId, fallback)
    if (Array.isArray(v)) return v as RGB[]
    return typeof v === 'string' ? v : fallback
  }

  function evalNode(id: string): Record<string, PortValue> {
    if (memo.has(id)) return memo.get(id)!
    // Re-entering a node still on the stack means the graph has a cycle.
    // Return empty so the upstream input falls back to its default instead
    // of recursing forever and overflowing the stack.
    if (inProgress.has(id)) return {}
    const node = nodeMap.get(id)
    if (!node) return {}
    inProgress.add(id)

    const props = node.data.properties as Record<string, unknown>
    const type  = node.data.nodeType as string
    let out: Record<string, PortValue> = {}

    switch (type) {
      // ── Math ───────────────────────────────────────────────────────────
      case 'TimeNode':
        out = { time: t, dt: 1 / 60 }
        break

      case 'MathAdd':
        out = { result: num(id, 'a', props, 'a') + num(id, 'b', props, 'b') }
        break

      case 'Multiply':
        out = { result: num(id, 'a', props, 'a', 1) * num(id, 'b', props, 'b', 1) }
        break

      case 'Lerp': {
        const a  = num(id, 'a', props, 'a', 0)
        const b  = num(id, 'b', props, 'b', 1)
        const tt = num(id, 't', props, 't', 0.5)
        out = { result: a + (b - a) * tt }
        break
      }

      case 'Clamp': {
        const val = num(id, 'value', props, 'value', 0)
        const lo  = num(id, 'min',   props, 'min',   0)
        const hi  = num(id, 'max',   props, 'max',   1)
        out = { result: Math.max(lo, Math.min(hi, val)) }
        break
      }

      case 'MapRange': {
        const val   = num(id, 'value', props, 'value', 0)
        const inLo  = num(id, 'inMin', props, 'inMin', 0)
        const inHi  = num(id, 'inMax', props, 'inMax', 1)
        const outLo = Number(props.outMin ?? 0)
        const outHi = Number(props.outMax ?? 1)
        const t2 = inHi === inLo ? 0 : (val - inLo) / (inHi - inLo)
        out = { result: outLo + t2 * (outHi - outLo) }
        break
      }

      case 'Sin':
        out = { result: Math.sin(num(id, 'x', props, 'x', 0) * Math.PI * 2) }
        break

      case 'Cos':
        out = { result: Math.cos(num(id, 'x', props, 'x', 0) * Math.PI * 2) }
        break

      case 'Wave': {
        const amplitude = num(id, 'amplitude', props, 'amplitude', 1)
        const frequency = num(id, 'frequency', props, 'frequency', 1)
        const phase     = num(id, 'phase', props, 'phase', 0)
        const waveform  = String(props.waveform ?? 'sine')
        out = { result: waveSample(waveform, amplitude, frequency, phase, t) }
        break
      }

      case 'ComplexWave': {
        const a = num(id, 'a', props, 'a', 0)
        const b = num(id, 'b', props, 'b', 0)
        const operation = String(props.operation ?? 'add')
        out = { result: combineWaves(operation, a, b) }
        break
      }

      // ── Audio ─────────────────────────────────────────────────────────
      case 'MicInput':
        out = { audio: null }
        break

      case 'FFTAnalyzer': {
        const audio = useAudioStore.getState()
        if (audio.active) {
          out = { bass: audio.bass, mids: audio.mids, treble: audio.treble }
        } else {
          out = {
            bass:   (Math.sin(t * 2.1) + 1) / 2,
            mids:   (Math.sin(t * 3.7 + 1.0) + 1) / 2,
            treble: (Math.sin(t * 5.3 + 2.0) + 1) / 2,
          }
        }
        break
      }

      case 'BeatDetect': {
        const audio = useAudioStore.getState()
        if (audio.active) {
          out = { beat: audio.beat, bpm: 120 }
        } else {
          out = { beat: (Math.sin(t * Math.PI * 2) > 0.9), bpm: 120 }
        }
        break
      }

      // ── Pattern ────────────────────────────────────────────────────────
      case 'SolidColor': {
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 255) / 255),
          g: byte(Number(props.g ?? 0)   / 255),
          b: byte(Number(props.b ?? 128) / 255),
        }
        out = { frame: solidFrame(color, W, H) }
        break
      }

      case 'Span': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 128) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const row   = Math.floor(Number(props.row   ?? 0))
        const start = Math.floor(Number(props.start ?? 0))
        const count = Math.floor(Number(props.count ?? W))
        if (row >= 0 && row < H)
          for (let x = start; x < start + count; x++)
            if (x >= 0 && x < W) frame[row][x] = { ...color }
        out = { frame }
        break
      }

      case 'Rect': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 128) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const rx = Math.floor(Number(props.x ?? 0))
        const ry = Math.floor(Number(props.y ?? 0))
        const rw = Math.floor(Number(props.w ?? W))
        const rh = Math.floor(Number(props.h ?? H))
        for (let yy = ry; yy < ry + rh; yy++)
          for (let xx = rx; xx < rx + rw; xx++)
            if (xx >= 0 && xx < W && yy >= 0 && yy < H) frame[yy][xx] = { ...color }
        out = { frame }
        break
      }

      case 'Text': {
        const text = String(props.text ?? 'HELLO')
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 255) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        const sx = Math.floor(Number(props.x ?? 0))
        const sy = Math.floor(Number(props.y ?? 0))
        const scroll = num(id, 'scroll', props, 'scroll', 0)
        out = { frame: renderText(text, color, sx, sy, scroll, t, asFont(props.font), W, H) }
        break
      }

      case 'Circle': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 255) / 255),
          g: byte(Number(props.g ?? 0)   / 255),
          b: byte(Number(props.b ?? 128) / 255),
        }
        const cx = Number(props.cx ?? W / 2), cy = Number(props.cy ?? H / 2)
        const rad = Number(props.radius ?? 4)
        const filled = Boolean(props.filled)
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const d = Math.hypot(x - cx, y - cy)
            if (filled ? d <= rad + 0.5 : Math.abs(d - rad) < 0.5) frame[y][x] = { ...color }
          }
        out = { frame }
        break
      }

      case 'Line': {
        const baseIn = input(id, 'base', null) as Frame | null
        const frame  = baseIn ? cloneFrame(baseIn) : blankFrame(W, H)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 200) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        let x0 = Math.round(Number(props.x1 ?? 0)), y0 = Math.round(Number(props.y1 ?? 0))
        const x1 = Math.round(Number(props.x2 ?? 0)), y1 = Math.round(Number(props.y2 ?? 0))
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
        let err = dx + dy
        for (;;) {
          if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) frame[y0][x0] = { ...color }
          if (x0 === x1 && y0 === y1) break
          const e2 = 2 * err
          if (e2 >= dy) { err += dy; x0 += sx }
          if (e2 <= dx) { err += dx; y0 += sy }
        }
        out = { frame }
        break
      }

      case 'NoiseField': {
        const speed = num(id, 'speed', props, 'speed', 1)
        const scale = num(id, 'scale', props, 'scale', 1)
        out = { frame: evalNoiseField(speed, scale, t, W, H) }
        break
      }

      case 'Plasma': {
        const speed = num(id, 'speed', props, 'speed', 1)
        out = { frame: evalPlasma(speed, t, W, H) }
        break
      }

      case 'Fire': {
        const intensity = num(id, 'intensity', props, 'intensity', 0.7)
        out = { frame: evalFire(stateKey(id), intensity, W, H) }
        break
      }

      case 'SpectrumBars': {
        const bass   = num(id, 'bass',   props, 'bass',   (Math.sin(t * 2.1) + 1) / 2)
        const mids   = num(id, 'mids',   props, 'mids',   (Math.sin(t * 3.7 + 1) + 1) / 2)
        const treble = num(id, 'treble', props, 'treble', (Math.sin(t * 5.3 + 2) + 1) / 2)
        out = { frame: evalSpectrumBars(bass, mids, treble, W, H) }
        break
      }

      case 'BlendFrames': {
        const fa = input(id, 'a', null) as Frame | null
        const fb = input(id, 'b', null) as Frame | null
        const mix = num(id, 't', props, 't', 0.5)
        if (!fa && !fb) { out = { frame: null }; break }
        const a = fa ?? blankFrame(W, H)
        const b = fb ?? blankFrame(W, H)
        out = {
          frame: a.map((row, y) =>
            row.map((px, x) => ({
              r: Math.round(px.r * (1 - mix) + b[y][x].r * mix),
              g: Math.round(px.g * (1 - mix) + b[y][x].g * mix),
              b: Math.round(px.b * (1 - mix) + b[y][x].b * mix),
            }))
          ),
        }
        break
      }

      case 'BrightnessMod': {
        const src = input(id, 'frame', null) as Frame | null
        const br = num(id, 'brightness', props, 'brightness', 1)
        if (!src) { out = { frame: null }; break }
        out = {
          frame: src.map(row =>
            row.map(px => ({
              r: Math.min(255, Math.round(px.r * br)),
              g: Math.min(255, Math.round(px.g * br)),
              b: Math.min(255, Math.round(px.b * br)),
            }))
          ),
        }
        break
      }

      case 'Mask': {
        const src = input(id, 'frame', null) as Frame | null
        const maskF = input(id, 'mask', null) as Frame | null
        if (!src) { out = { frame: null }; break }
        out = {
          frame: src.map((row, y) =>
            row.map((px, x) => {
              const m = maskF?.[y]?.[x]
              const a = m ? (m.r + m.g + m.b) / 3 / 255 : 1
              return { r: Math.round(px.r * a), g: Math.round(px.g * a), b: Math.round(px.b * a) }
            })
          ),
        }
        break
      }

      case 'HueShift': {
        const src = input(id, 'frame', null) as Frame | null
        const shift = num(id, 'shift', props, 'shift', 0)
        if (!src) { out = { frame: null }; break }
        out = {
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
        break
      }

      case 'BassPulse': {
        const bass = num(id, 'bass', props, 'bass', 0)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 255), g: Number(props.g ?? 0), b: Number(props.b ?? 80) }
        out = { frame: evalBassPulse(bass, color, W, H) }
        break
      }

      case 'MidrangeWaves': {
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const speed = num(id, 'speed', props, 'speed', 1)
        out = { frame: evalMidrangeWaves(mids, speed, t, W, H) }
        break
      }

      case 'TrebleSparks': {
        const treble = num(id, 'treble', props, 'treble', 0.5)
        const density = num(id, 'density', props, 'density', 0.5)
        out = { frame: evalTrebleSparks(treble, density, W, H) }
        break
      }

      case 'BeatFlash': {
        const beatVal = input(id, 'beat', false) as boolean
        const baseFrame = input(id, 'frame', null) as Frame | null
        const decay = num(id, 'decay', props, 'decay', 0.85)
        out = { frame: evalBeatFlash(stateKey(id), beatVal, baseFrame, decay, W, H) }
        break
      }

      // ── Color math ─────────────────────────────────────────────────────
      case 'HSVToRGB': {
        const h = num(id, 'h', props, 'h', 0)
        const s = num(id, 's', props, 's', 1)
        const v = num(id, 'v', props, 'v', 1)
        out = { color: hsv(h, s, v) }
        break
      }

      case 'Temperature': {
        out = { color: kelvinToRgb(num(id, 'kelvin', props, 'kelvin', 4000)) }
        break
      }

      case 'BlendColors': {
        const ca = input(id, 'a', null) as RGB | null
        const cb = input(id, 'b', null) as RGB | null
        const mix = num(id, 't', props, 't', 0.5)
        const a = ca ?? { r: 255, g: 0, b: 0 }
        const b = cb ?? { r: 0, g: 0, b: 255 }
        out = {
          color: {
            r: Math.round(a.r * (1 - mix) + b.r * mix),
            g: Math.round(a.g * (1 - mix) + b.g * mix),
            b: Math.round(a.b * (1 - mix) + b.b * mix),
          },
        }
        break
      }

      // ── New pattern nodes ──────────────────────────────────────────────
      case 'Noise2D': {
        const speed = num(id, 'speed', props, 'speed', 0.4)
        const scale = num(id, 'scale', props, 'scale', 0.4)
        out = { frame: evalNoise2D(speed, scale, t, W, H) }
        break
      }

      case 'RadialBurst': {
        const speed = num(id, 'speed', props, 'speed', 1)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 0), g: Number(props.g ?? 200), b: Number(props.b ?? 255) }
        out = { frame: evalRadialBurst(speed, color, t, W, H) }
        break
      }

      case 'Spiral': {
        const speed = num(id, 'speed', props, 'speed', 1)
        const arms = Number(props.arms ?? 2)
        out = { frame: evalSpiral(speed, arms, t, W, H) }
        break
      }

      case 'Kaleidoscope': {
        const src = input(id, 'frame', null) as Frame | null
        const segments = num(id, 'segments', props, 'segments', 6)
        if (!src) { out = { frame: blankFrame(W, H) }; break }
        out = { frame: evalKaleidoscope(src, segments, W, H) }
        break
      }

      case 'Particles': {
        const rate = num(id, 'rate', props, 'rate', 0.3)
        const decay = Number(props.decay ?? 0.92)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? { r: Number(props.r ?? 100), g: Number(props.g ?? 200), b: Number(props.b ?? 255) }
        out = { frame: evalParticles(stateKey(id), rate, color, decay, W, H) }
        break
      }

      case 'Invert': {
        const src = input(id, 'frame', null) as Frame | null
        if (!src) { out = { frame: blankFrame(W, H) }; break }
        out = { frame: src.map(row => row.map(px => ({ r: 255 - px.r, g: 255 - px.g, b: 255 - px.b }))) }
        break
      }

      case 'GradientFrame': {
        const cA = (input(id, 'colorA', null) as RGB | null) ?? { r: Number(props.rA ?? 0), g: Number(props.gA ?? 200), b: Number(props.bA ?? 255) }
        const cB = (input(id, 'colorB', null) as RGB | null) ?? { r: Number(props.rB ?? 255), g: Number(props.gB ?? 0), b: Number(props.bB ?? 255) }
        out = { frame: evalGradientFrame(cA, cB, Boolean(props.vertical), W, H) }
        break
      }

      case 'GradientSampler': {
        const tt = num(id, 't', props, 't', 0)
        const cA = (input(id, 'colorA', null) as RGB | null) ?? { r: Number(props.rA ?? 0), g: Number(props.gA ?? 200), b: Number(props.bA ?? 255) }
        const cB = (input(id, 'colorB', null) as RGB | null) ?? { r: Number(props.rB ?? 255), g: Number(props.gB ?? 0), b: Number(props.bB ?? 255) }
        out = { color: { r: Math.round(cA.r*(1-tt)+cB.r*tt), g: Math.round(cA.g*(1-tt)+cB.g*tt), b: Math.round(cA.b*(1-tt)+cB.b*tt) } }
        break
      }

      case 'PaletteSampler': {
        const tt = num(id, 't', props, 't', 0)
        const palName = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { color: samplePalette(palName, tt) }
        break
      }

      // ── Logic / Control ────────────────────────────────────────────────
      case 'Abs':
        out = { result: Math.abs(num(id, 'x', props, 'x', 0)) }
        break

      case 'Mod': {
        const x = num(id, 'x', props, 'x', 0)
        const m = num(id, 'm', props, 'm', 1)
        out = { result: m !== 0 ? ((x % m) + m) % m : 0 }
        break
      }

      case 'MinNode':
        out = { result: Math.min(num(id, 'a', props, 'a', 0), num(id, 'b', props, 'b', 0)) }
        break

      case 'MaxNode':
        out = { result: Math.max(num(id, 'a', props, 'a', 0), num(id, 'b', props, 'b', 0)) }
        break

      case 'Random': {
        const lo = Number(props.min ?? 0), hi = Number(props.max ?? 1)
        out = { value: lo + Math.random() * (hi - lo) }
        break
      }

      case 'Counter': {
        const speed = num(id, 'speed', props, 'speed', 0.5)
        const prev = counterVals.get(stateKey(id)) ?? 0
        const next = (prev + speed / 60) % 1
        counterVals.set(stateKey(id), next)
        out = { value: next }
        break
      }

      case 'Gate': {
        const val = num(id, 'value', props, 'value', 0)
        const gate = input(id, 'gate', false) as boolean
        out = { result: gate ? val : Number(props.fallback ?? 0) }
        break
      }

      case 'Not': {
        const x = input(id, 'x', false) as boolean
        out = { result: !x }
        break
      }

      case 'Compare': {
        const a = num(id, 'a', props, 'a', 0)
        const b = num(id, 'b', props, 'b', 0.5)
        out = { result: a > b }
        break
      }

      // ── Proper noise nodes ────────────────────────────────────────────
      case 'Simplex2D': {
        const speed   = num(id, 'speed',  props, 'speed',  0.4)
        const scale   = num(id, 'scale',  props, 'scale',  0.3)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalSimplex2D(speed, scale, t, palette, W, H) }
        break
      }

      case 'Noise3D': {
        const speed   = num(id, 'speed',  props, 'speed',  0.5)
        const scale   = num(id, 'scale',  props, 'scale',  0.3)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalNoise3D(speed, scale, t, palette, W, H) }
        break
      }

      case 'Worley': {
        const speed   = num(id, 'speed',  props, 'speed',  0.5)
        const scale   = num(id, 'scale',  props, 'scale',  0.3)
        const palette = pal(id, 'paletteIn', props, 'palette', 'forest')
        out = { frame: evalWorley(speed, scale, t, palette, W, H) }
        break
      }

      case 'FractalNoise': {
        const speed   = num(id, 'speed', props, 'speed', 0.3)
        const scale   = num(id, 'scale', props, 'scale', 0.15)
        const octaves = Number(props.octaves ?? 4)
        const palette = pal(id, 'paletteIn', props, 'palette', 'forest')
        out = { frame: evalFractalNoise(speed, scale, octaves, t, palette, W, H) }
        break
      }

      case 'GaborNoise': {
        const speed       = num(id, 'speed', props, 'speed', 0.5)
        const scale       = num(id, 'scale', props, 'scale', 0.35)
        const frequency   = num(id, 'frequency', props, 'frequency', 1.2)
        const orientation = Number(props.orientation ?? 45)
        const palette     = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalGaborNoise(speed, scale, frequency, orientation, t, palette, W, H) }
        break
      }

      case 'PaletteGradient': {
        const angle   = Number(props.angle ?? 45)
        const repeat  = Number(props.repeat ?? 1)
        const speed   = num(id, 'speed', props, 'speed', 0)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalPaletteGradient(angle, repeat, speed, t, palette, W, H) }
        break
      }

      case 'Image': {
        const img = asImage(props.image)
        out = { frame: img ? sampleImageToFrame(img, W, H) : blankFrame(W, H) }
        break
      }

      case 'Blobs': {
        const speed = num(id, 'speed', props, 'speed', 0.6)
        const scale = num(id, 'scale', props, 'scale', 0.22)
        const count = Number(props.count ?? 3)
        const palette = pal(id, 'paletteIn', props, 'palette', 'lava')
        out = { frame: evalBlobs(speed, scale, count, t, palette, W, H) }
        break
      }

      case 'FlowField': {
        const speed = num(id, 'speed', props, 'speed', 1)
        const scale = num(id, 'scale', props, 'scale', 0.08)
        const count = Number(props.count ?? 80)
        const fade = Number(props.fade ?? 0.9)
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalFlowField(stateKey(id), speed, scale, count, fade, t, palette, W, H) }
        break
      }

      case 'Starfield': {
        const speed = num(id, 'speed', props, 'speed', 1)
        const count = Number(props.count ?? 60)
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 255) / 255),
          g: byte(Number(props.g ?? 255) / 255),
          b: byte(Number(props.b ?? 255) / 255),
        }
        out = { frame: evalStarfield(stateKey(id), speed, count, color, W, H) }
        break
      }

      case 'PlasmaFractal': {
        const speed = num(id, 'speed', props, 'speed', 1)
        const scale = num(id, 'scale', props, 'scale', 0.15)
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalPlasmaFractal(speed, scale, t, palette, W, H) }
        break
      }

      case 'AudioFlow': {
        const bass = num(id, 'bass', props, 'bass', 0.5)
        const mids = num(id, 'mids', props, 'mids', 0.5)
        const treble = num(id, 'treble', props, 'treble', 0.3)
        const speed = num(id, 'speed', props, 'speed', 1)
        const scale = num(id, 'scale', props, 'scale', 0.2)
        const palette = pal(id, 'paletteIn', props, 'palette', 'party')
        out = { frame: evalAudioFlow(bass, mids, treble, speed, scale, t, palette, W, H) }
        break
      }

      case 'ReactionDiffusion': {
        const feed  = num(id, 'feed', props, 'feed', 0.055)
        const kill  = num(id, 'kill', props, 'kill', 0.062)
        const iters = Math.max(1, Math.min(20, Math.floor(Number(props.speed ?? 8))))
        const palette = pal(id, 'paletteIn', props, 'palette', 'ocean')
        out = { frame: evalReactionDiffusion(stateKey(id), feed, kill, iters, palette, W, H) }
        break
      }

      case 'GameOfLife': {
        const colorIn = input(id, 'color', null) as RGB | null
        const color = colorIn ?? {
          r: byte(Number(props.r ?? 0)   / 255),
          g: byte(Number(props.g ?? 255) / 255),
          b: byte(Number(props.b ?? 70)  / 255),
        }
        const speed = num(id, 'speed', props, 'speed', 8)
        const fade = Number(props.fade ?? 0.75)
        out = { frame: evalGameOfLife(stateKey(id), color, speed, fade, tick, W, H) }
        break
      }

      // ── Transition nodes ──────────────────────────────────────────────
      case 'Crossfade': {
        const fa = input(id, 'a', null) as Frame | null
        const fb = input(id, 'b', null) as Frame | null
        const mix = num(id, 't', props, 't', 0.5)
        const ca = fa ?? blankFrame(W, H)
        const cb = fb ?? blankFrame(W, H)
        out = {
          frame: ca.map((row, y) =>
            row.map((px, x) => ({
              r: Math.round(px.r * (1 - mix) + cb[y][x].r * mix),
              g: Math.round(px.g * (1 - mix) + cb[y][x].g * mix),
              b: Math.round(px.b * (1 - mix) + cb[y][x].b * mix),
            }))
          ),
        }
        break
      }

      case 'Wipe': {
        const fa = input(id, 'a', null) as Frame | null
        const fb = input(id, 'b', null) as Frame | null
        const tt = num(id, 't', props, 't', 0.5)
        const dir = String(props.direction ?? 'right')
        out = { frame: evalWipe(fa ?? blankFrame(W, H), fb ?? blankFrame(W, H), tt, dir, W, H) }
        break
      }

      case 'Dissolve': {
        const fa = input(id, 'a', null) as Frame | null
        const fb = input(id, 'b', null) as Frame | null
        const tt = num(id, 't', props, 't', 0.5)
        out = { frame: evalDissolve(fa ?? blankFrame(W, H), fb ?? blankFrame(W, H), tt, W, H) }
        break
      }

      case 'PatternMaster': {
        const frames = [
          input(id, 'p0', null) as Frame | null,
          input(id, 'p1', null) as Frame | null,
          input(id, 'p2', null) as Frame | null,
          input(id, 'p3', null) as Frame | null,
        ]
        const beat = input(id, 'beat', false) as boolean
        const mode = String(props.mode ?? 'cycle')
        const interval = Number(props.interval ?? 4)
        out = { frame: evalPatternMaster(stateKey(id), frames, beat, mode, interval, t, W, H) }
        break
      }

      case 'Sequencer': {
        const frames = [
          input(id, 'p0', null) as Frame | null,
          input(id, 'p1', null) as Frame | null,
          input(id, 'p2', null) as Frame | null,
          input(id, 'p3', null) as Frame | null,
        ]
        const interval = Number(props.interval ?? 4)
        const fade = Number(props.fade ?? 1)
        out = { frame: evalSequencer(frames, interval, fade, t, W, H) }
        break
      }

      case 'CustomFormula': {
        const a = num(id, 'a', props, 'a', 0)
        const b = num(id, 'b', props, 'b', 0)
        const formula = String(props.formula ?? 'sin(x*6+t)*0.5+0.5')
        const palette = pal(id, 'paletteIn', props, 'palette', 'rainbow')
        out = { frame: evalCustomFormula(formula, a, b, palette, t, W, H) }
        break
      }

      // ── New FastLED spec nodes ────────────────────────────────────────
      case 'CHSV': {
        const hue = num(id, 'hue', props, 'hue', 128)
        const sat = num(id, 'sat', props, 'sat', 255)
        const val = num(id, 'val', props, 'val', 255)
        out = { rgb: hsv(hue / 255 * 360, sat / 255, val / 255) }
        break
      }

      case 'PaletteSelector':
        out = { palette: String(props.palette ?? 'rainbow').toLowerCase() }
        break

      case 'CustomPalette': {
        // Build a palette from connected color inputs (in order); unconnected
        // slots are skipped. Falls back to rainbow when nothing is wired.
        const colors: RGB[] = []
        for (const port of ['color0', 'color1', 'color2', 'color3']) {
          const c = input(id, port, null) as RGB | null
          if (c) colors.push(c)
        }
        out = { palette: colors.length > 0 ? colors : 'rainbow' }
        break
      }

      case 'PaletteBlend': {
        // Sample both palettes at 16 stops and lerp per entry → a real blend.
        const amount = Math.max(0, Math.min(1, num(id, 'amount', props, 'amount', 128) / 255))
        const palA = pal(id, 'paletteA', props, 'paletteA', 'rainbow')
        const palB = pal(id, 'paletteB', props, 'paletteB', 'ocean')
        const stops: RGB[] = []
        for (let i = 0; i < 16; i++) {
          const ti = i / 15
          const ca = samplePalette(palA, ti), cb = samplePalette(palB, ti)
          stops.push({
            r: Math.round(ca.r * (1 - amount) + cb.r * amount),
            g: Math.round(ca.g * (1 - amount) + cb.g * amount),
            b: Math.round(ca.b * (1 - amount) + cb.b * amount),
          })
        }
        out = { palette: stops }
        break
      }

      case 'BeatSin': {
        const bpm = Number(props.bpm ?? 60)
        const lo  = Number(props.low  ?? 0)
        const hi  = Number(props.high ?? 255)
        const phase = (t * bpm / 60) % 1
        out = { value: lo + ((Math.sin(phase * Math.PI * 2) + 1) / 2) * (hi - lo) }
        break
      }

      case 'Fire2012': {
        const cooling  = Number(props.cooling  ?? 55)
        const sparking = Number(props.sparking ?? 120)
        out = { frame: evalFire2012(id, cooling, sparking, W, H) }
        break
      }

      case 'Blur2D': {
        const src = input(id, 'frame', null) as Frame | null
        const amount = num(id, 'amount', props, 'amount', 40)
        if (!src) { out = { frame: blankFrame(W, H) }; break }
        out = { frame: evalBlur2D(src, amount, W, H) }
        break
      }

      case 'XYMapper': {
        const x = num(id, 'x', props, 'x', 0)
        const y = num(id, 'y', props, 'y', 0)
        out = { index: Math.floor(x) + Math.floor(y) * W }
        break
      }

      case 'LayerBlend': {
        const fa = input(id, 'a', null) as Frame | null
        const fb = input(id, 'b', null) as Frame | null
        const amount = num(id, 'amount', props, 'amount', 128) / 255
        const ca = fa ?? blankFrame(W, H)
        const cb = fb ?? blankFrame(W, H)
        out = {
          frame: ca.map((row, y) =>
            row.map((px, x) => ({
              r: Math.round(px.r * (1 - amount) + cb[y][x].r * amount),
              g: Math.round(px.g * (1 - amount) + cb[y][x].g * amount),
              b: Math.round(px.b * (1 - amount) + cb[y][x].b * amount),
            }))
          ),
        }
        break
      }

      case 'AudioHue': {
        const bass   = num(id, 'bass',   props, 'bass',   0.5)
        const mids   = num(id, 'mids',   props, 'mids',   0.5)
        const treble = num(id, 'treble', props, 'treble', 0.5)
        out = { hue: (bass * 0.5 + mids * 0.3 + treble * 0.2) * 360 }
        break
      }

      // ── Hardware (stubs) ───────────────────────────────────────────────
      case 'ButtonInput':
        out = { pressed: false }
        break

      case 'PotInput':
        out = { value: 0.5 }
        break

      // ── Groups ─────────────────────────────────────────────────────────
      case 'Group': {
        const groupId = String(props.groupId ?? '')
        const def = groups[groupId]
        // Missing group, or a group that (transitively) contains itself —
        // emit a blank frame rather than recursing forever.
        if (!def || groupStack.has(groupId)) {
          out = { frame: blankFrame(W, H) }
          break
        }
        // Bind the group's exposed parameters from its connected input ports.
        const boundInputs: Record<string, PortValue> = {}
        for (const port of (node.data.inputs as { id: string }[] | undefined) ?? []) {
          boundInputs[port.id] = input(id, port.id, null)
        }
        const frame = evaluateGraph(
          def.nodes, def.edges, tick, W, H, groups,
          `${instancePrefix}${id}/`,
          new Set([...groupStack, groupId]),
          boundInputs,
        ) ?? blankFrame(W, H)
        out = { frame }
        break
      }

      // Carries a bound parameter value into a group subgraph.
      case 'GroupInput':
        out = { out: groupInputs[String(props.paramId ?? '')] ?? null }
        break

      // The frame terminal inside a group subgraph (analogous to MatrixOutput).
      case 'GroupOutput':
        out = { frame: input(id, 'frame', null) }
        break

      // ── Output ─────────────────────────────────────────────────────────
      case 'MatrixOutput':
        out = { frame: input(id, 'frame', null) }
        break

      default:
        out = {}
    }

    memo.set(id, out)
    inProgress.delete(id)
    return out
  }

  // Render only what reaches an explicit terminal: a GroupOutput inside a group
  // subgraph, or a MatrixOutput at the root, each passing through its `frame`
  // input. A graph with no terminal (or an unconnected one) previews nothing —
  // the canvas falls back to its idle animation — so the preview always matches
  // what would actually be flashed.
  const outputNode = nodes.find(n => {
    const nt = (n.data as { nodeType?: string }).nodeType
    return nt === 'GroupOutput' || nt === 'MatrixOutput'
  })
  if (outputNode) {
    const frame = evalNode(outputNode.id).frame
    if (frame) return frame as Frame
  }

  return null
}
