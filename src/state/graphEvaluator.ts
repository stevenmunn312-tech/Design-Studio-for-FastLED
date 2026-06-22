import type { StudioNode, StudioEdge } from './graphStore'

export interface RGB { r: number; g: number; b: number }
export type Frame = RGB[][]   // row-major [y][x], always 16×16

const W = 16
const H = 16

// ── Persistent state for stateful pattern nodes ───────────────────────────────
const fireHeat = new Map<string, number[][]>()

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

function solidFrame(color: RGB): Frame {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => ({ ...color })))
}

// ── Pattern evaluators ────────────────────────────────────────────────────────
function evalNoiseField(speed: number, scale: number, t: number): Frame {
  return Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => {
      const v = (Math.sin(x * scale * 0.5 + t * speed) +
                 Math.cos(y * scale * 0.5 + t * speed * 0.7)) / 2
      return hsv((v + 1) * 180 + t * 30, 1, 0.85)
    })
  )
}

function evalPlasma(speed: number, t: number): Frame {
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

function evalFire(nodeId: string, intensity: number): Frame {
  if (!fireHeat.has(nodeId)) {
    fireHeat.set(nodeId, Array.from({ length: H }, () => Array(W).fill(0)))
  }
  const heat = fireHeat.get(nodeId)!
  const cooling = 0.05

  // Cool every cell
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = Math.max(0, heat[y][x] - cooling - Math.random() * cooling)

  // Rise: blend upward from the row below
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W; x++)
      heat[y][x] = (
        heat[y][x] +
        heat[y + 1][Math.max(0, x - 1)] +
        heat[y + 1][x] +
        heat[y + 1][Math.min(W - 1, x + 1)]
      ) / 4

  // Sparks at the bottom row
  const sparking = 0.4 + intensity * 0.55
  for (let x = 0; x < W; x++)
    if (Math.random() < sparking)
      heat[H - 1][x] = Math.min(1, 0.75 + Math.random() * 0.25)

  // Heat → colour: black → red → yellow → white
  return heat.map(row =>
    row.map(h => {
      if (h < 0.33) return { r: byte(h * 3),       g: 0,               b: 0 }
      if (h < 0.66) return { r: 255,                g: byte((h - 0.33) * 3), b: 0 }
                    return { r: 255,                g: 255,             b: byte((h - 0.66) * 3) }
    })
  )
}

function evalSpectrumBars(bass: number, mids: number, treble: number): Frame {
  const frame: Frame = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 }))
  )
  const bands: Array<{ start: number; end: number; val: number; hueBase: number }> = [
    { start: 0,  end: 5,  val: bass,   hueBase: 0   },
    { start: 6,  end: 10, val: mids,   hueBase: 180 },
    { start: 11, end: 15, val: treble, hueBase: 270 },
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

// ── Main entry point ──────────────────────────────────────────────────────────

type PortValue = number | boolean | RGB | Frame | null

export function evaluateGraph(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number
): Frame | null {
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

      case 'Lerp': {
        const a  = num(id, 'a', props, 'a', 0)
        const b  = num(id, 'b', props, 'b', 1)
        const tt = num(id, 't', props, 't', 0.5)
        out = { result: a + (b - a) * tt }
        break
      }

      // ── Audio (stubs — animating until Web Audio API is wired up) ──────
      case 'MicInput':
        out = { audio: null }
        break

      case 'FFTAnalyzer':
        // Animated placeholders so downstream pattern nodes still react
        out = {
          bass:   (Math.sin(t * 2.1) + 1) / 2,
          mids:   (Math.sin(t * 3.7 + 1.0) + 1) / 2,
          treble: (Math.sin(t * 5.3 + 2.0) + 1) / 2,
        }
        break

      case 'BeatDetect':
        out = { beat: (Math.sin(t * Math.PI * 2) > 0.9), bpm: 120 }
        break

      // ── Pattern ────────────────────────────────────────────────────────
      case 'SolidColor':
        out = {
          frame: solidFrame({
            r: byte(Number(props.r ?? 255) / 255),
            g: byte(Number(props.g ?? 0)   / 255),
            b: byte(Number(props.b ?? 128) / 255),
          }),
        }
        break

      case 'NoiseField': {
        const speed = num(id, 'speed', props, 'speed', 1)
        const scale = num(id, 'scale', props, 'scale', 1)
        out = { frame: evalNoiseField(speed, scale, t) }
        break
      }

      case 'Plasma': {
        const speed = num(id, 'speed', props, 'speed', 1)
        out = { frame: evalPlasma(speed, t) }
        break
      }

      case 'Fire': {
        const intensity = num(id, 'intensity', props, 'intensity', 0.7)
        out = { frame: evalFire(id, intensity) }
        break
      }

      case 'SpectrumBars': {
        const bass   = num(id, 'bass',   props, 'bass',   (Math.sin(t * 2.1) + 1) / 2)
        const mids   = num(id, 'mids',   props, 'mids',   (Math.sin(t * 3.7 + 1) + 1) / 2)
        const treble = num(id, 'treble', props, 'treble', (Math.sin(t * 5.3 + 2) + 1) / 2)
        out = { frame: evalSpectrumBars(bass, mids, treble) }
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
