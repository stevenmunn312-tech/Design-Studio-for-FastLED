import type { StudioNode, StudioEdge } from './graphStore'
import { useAudioStore } from './audioStore'

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

function solidFrame(color: RGB, W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ ...color })))
}

function blankFrame(W = DEFAULT_W, H = DEFAULT_H): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))
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

function samplePalette(palette: string, t: number): RGB {
  const h = ((t % 1) + 1) % 1
  switch (palette) {
    case 'heat':
      if (h < 0.33) return { r: Math.round(h * 3 * 255), g: 0, b: 0 }
      if (h < 0.66) return { r: 255, g: Math.round(((h - 0.33) / 0.33) * 255), b: 0 }
      return { r: 255, g: 255, b: Math.round(((h - 0.66) / 0.34) * 255) }
    case 'ocean':
      return hsv(200 + h * 40, 0.8 + h * 0.2, h * 0.9 + 0.1)
    case 'lava':
      return hsv(h * 40, 1, h > 0.08 ? 0.9 : h * 11)
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

// ── Main entry point ──────────────────────────────────────────────────────────

type PortValue = number | boolean | RGB | Frame | null

export function evaluateGraph(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
): Frame | null {
  const W = gridW
  const H = gridH
  if (nodes.length === 0) return null

  const t = tick / 60   // seconds at assumed 60 fps

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

  // Resolve one input port: walk the edge map, fall back to `fallback`
  function input(nodeId: string, portId: string, fallback: PortValue): PortValue {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (!up) return fallback
    return evalNode(up.srcId)[up.srcPort] ?? fallback
  }

  function num(nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def = 0): number {
    return Number(input(nodeId, portId, Number(props[propKey] ?? def)))
  }

  function evalNode(id: string): Record<string, PortValue> {
    if (memo.has(id)) return memo.get(id)!
    const node = nodeMap.get(id)
    if (!node) return {}

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
        out = { frame: evalFire(id, intensity, W, H) }
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
        out = { frame: evalBeatFlash(id, beatVal, baseFrame, decay, W, H) }
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
        out = { frame: evalParticles(id, rate, color, decay, W, H) }
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
        out = { color: samplePalette(String(props.palette ?? 'rainbow'), tt) }
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
        const prev = counterVals.get(id) ?? 0
        const next = (prev + speed / 60) % 1
        counterVals.set(id, next)
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

      // ── Hardware (stubs) ───────────────────────────────────────────────
      case 'ButtonInput':
        out = { pressed: false }
        break

      case 'PotInput':
        out = { value: 0.5 }
        break

      // ── Output ─────────────────────────────────────────────────────────
      case 'MatrixOutput':
        out = { frame: input(id, 'frame', null) }
        break

      default:
        out = {}
    }

    memo.set(id, out)
    return out
  }

  // 1. Prefer an explicit MatrixOutput node
  const outputNode = nodes.find(n => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
  if (outputNode) {
    const frame = evalNode(outputNode.id).frame
    if (frame) return frame as Frame
  }

  // 2. Fallback: render the first pattern node that produces a frame
  for (const n of nodes) {
    if ((n.data as { category?: string }).category === 'pattern') {
      const frame = evalNode(n.id).frame
      if (frame) return frame as Frame
    }
  }

  return null
}
