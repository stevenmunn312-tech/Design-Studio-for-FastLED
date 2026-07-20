import { evaluateGraph, type Frame, type GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { idleFrame } from './idleFrame'
import { renderGridFrame } from './frameCanvas'
import { compositionDims, outputRoutes, routeFrame } from '../../state/outputRouting'

// Offline capture engine for the preview recorder: evaluates the graph
// deterministically from t = 0 at the chosen capture fps — independent of the
// live render loop — under its own evaluator-state namespace, so stateful
// nodes (Fire, Particles, …) are neither disturbed in the live preview nor
// double-advanced (the same isolation trick evaluateScalarSeries and the show
// preview use). Each rendered frame is copied to packed RGB bytes immediately,
// because evaluator frames are pooled and recycled between passes.

export type RecordStyle = 'leds' | 'pixels'

export interface CaptureOptions {
  nodes: StudioNode[]
  edges: StudioEdge[]
  groups: GroupRegistry
  trusted: boolean
  gridW: number
  gridH: number
  outputId?: string
  fps: number
  durationSec: number
  /** Crossfade the opening frames into the frames past the end so the
   *  animation wraps without a visible cut. */
  seamlessLoop: boolean
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}

function masterBrightnessScale(output: StudioNode | undefined): number {
  if (!output) return 1
  const raw = Number((output.data.properties as { brightness?: unknown }).brightness)
  const brightness = Number.isFinite(raw) ? Math.max(0, Math.min(255, raw)) : 200
  return brightness >= 255 ? 1 : brightness / 255
}

/** Fold a (possibly supersampled) frame down to packed RGB bytes, averaging
 *  each factor×factor block and applying the master brightness — the byte-
 *  level equivalent of LEDPreview's downscaleFrame + applyMasterBrightness. */
export function frameToBytes(frame: Frame, factor: number, brightnessScale: number, w: number, h: number): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(w * h * 3)
  const n = factor * factor
  let at = 0
  for (let y = 0; y < h; y++) {
    const by = y * factor
    for (let x = 0; x < w; x++) {
      const bx = x * factor
      let r = 0, g = 0, b = 0
      for (let dy = 0; dy < factor; dy++) {
        const row = frame[by + dy]
        for (let dx = 0; dx < factor; dx++) {
          const px = row?.[bx + dx]
          if (px) { r += px.r; g += px.g; b += px.b }
        }
      }
      // Uint8ClampedArray assignment rounds and clamps to 0–255.
      bytes[at++] = (r / n) * brightnessScale
      bytes[at++] = (g / n) * brightnessScale
      bytes[at++] = (b / n) * brightnessScale
    }
  }
  return bytes
}

/** Crossfade the first `blend` frames toward the `blend` frames rendered past
 *  the loop point, in place, and drop the tail: result[i] leans on raw[total+i]
 *  at the wrap (i = 0) and returns to raw[i] by the end of the window, so
 *  frame total-1 → frame 0 continues seamlessly. Exported for tests. */
export function applyLoopBlend(raw: Uint8ClampedArray[], total: number, blend: number): Uint8ClampedArray[] {
  for (let i = 0; i < blend; i++) {
    const a = raw[total + i]   // continuation past the end — dominant at the wrap
    const b = raw[i]           // the original opening frame — dominant at window end
    const w = (i + 1) / blend
    const mixed = new Uint8ClampedArray(b.length)
    for (let p = 0; p < b.length; p++) mixed[p] = a[p] * (1 - w) + b[p] * w
    raw[i] = mixed
  }
  return raw.slice(0, total)
}

/** How many frames the seamless-loop crossfade spans for a given capture. */
export function loopBlendFrames(totalFrames: number, fps: number): number {
  return Math.min(Math.round(fps * 1.5), Math.floor(totalFrames / 3))
}

// Distinct evaluator-state namespace per capture run, so every recording
// starts stateful nodes from a fresh t = 0 (the idle-TTL sweep reclaims the
// abandoned namespaces a few seconds after the capture ends).
let captureSerial = 0

// Yield the main thread between work chunks. A MessageChannel post is used
// instead of setTimeout(0) because timer callbacks are throttled (up to
// once-per-minute) in hidden tabs — an export left running in a background
// tab would crawl; message tasks are exempt.
const yieldChannel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null
export function yieldToUi(): Promise<void> {
  if (!yieldChannel) return new Promise((resolve) => setTimeout(resolve, 0))
  return new Promise((resolve) => {
    yieldChannel.port1.onmessage = () => resolve()
    yieldChannel.port2.postMessage(null)
  })
}
const YIELD_EVERY = 16

/** Render the capture sequence as packed-RGB byte frames. Resolves null when
 *  cancelled via `isCancelled`. */
export async function captureSequence(opts: CaptureOptions): Promise<Uint8ClampedArray[] | null> {
  const { nodes, edges, groups, trusted, gridW, gridH, fps, durationSec, seamlessLoop } = opts
  const prefix = `__record_${captureSerial++}/`
  const total = Math.max(1, Math.round(durationSec * fps))
  const blend = seamlessLoop ? loopBlendFrames(total, fps) : 0
  const renderCount = total + blend
  const routes = outputRoutes(nodes)
  const route = routes.find((candidate) => candidate.id === opts.outputId) ?? routes[0]
  const composition = compositionDims(nodes)
  const brightness = masterBrightnessScale(route?.node)
  // evaluateGraph returns the first terminal, so reorder only the terminal
  // list to make the chosen route first while preserving every dependency.
  const evaluationNodes = route
    ? [route.node, ...nodes.filter((node) => node.id !== route.id)]
    : nodes

  const frames: Uint8ClampedArray[] = []
  for (let i = 0; i < renderCount; i++) {
    if (opts.isCancelled?.()) return null
    // tick/60 = seconds, so frame i of an fps-rate capture sits at i/fps sec.
    const tick = (i * 60) / fps
    const rendered = evaluateGraph(evaluationNodes, edges, tick, composition.w, composition.h, groups, prefix, new Set(), {}, null, trusted)
    const routed = route ? routeFrame(rendered, route, composition.w, composition.h) : rendered
    frames.push(routed
      ? frameToBytes(routed, 1, brightness, gridW, gridH)
      // Same fallback as the live loop: no terminal frame shows the idle
      // shimmer (rendered at grid resolution, undimmed — it isn't real output).
      : frameToBytes(idleFrame(tick, gridW, gridH), 1, 1, gridW, gridH))
    opts.onProgress?.(i + 1, renderCount)
    // Yield periodically: keeps the UI responsive and lets the live preview
    // loop advance the evaluator's frame pool so capture evaluations reuse
    // buffers instead of growing the pool for the whole run.
    if ((i + 1) % YIELD_EVERY === 0) await yieldToUi()
  }

  return blend > 0 ? applyLoopBlend(frames, total, blend) : frames
}

// ── Rasterisation (shared by PNG / GIF / WebM export) ────────────────────────

// Scratch Frame reused when the LED-look renderer needs RGB[][] input.
let scratchFrame: Frame = []

function bytesToFrame(bytes: Uint8ClampedArray, w: number, h: number): Frame {
  if (scratchFrame.length !== h || (scratchFrame[0]?.length ?? 0) !== w) {
    scratchFrame = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ r: 0, g: 0, b: 0 })))
  }
  let at = 0
  for (let y = 0; y < h; y++) {
    const row = scratchFrame[y]
    for (let x = 0; x < w; x++) {
      const px = row[x]
      px.r = bytes[at++]
      px.g = bytes[at++]
      px.b = bytes[at++]
    }
  }
  return scratchFrame
}

/** Draw one captured byte frame at `scale` px per LED: either the preview's
 *  LED-disc look (via the shared renderGridFrame) or crisp flat pixels
 *  (nearest-neighbour blocks — exact colours, ideal for docs/bug reports). */
export function drawCapturedFrame(
  ctx: CanvasRenderingContext2D,
  bytes: Uint8ClampedArray,
  w: number,
  h: number,
  scale: number,
  style: RecordStyle,
): void {
  if (style === 'leds') {
    renderGridFrame(ctx, bytesToFrame(bytes, w, h), scale)
    return
  }
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w * scale, h * scale)
  let at = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = bytes[at++], g = bytes[at++], b = bytes[at++]
      if (r === 0 && g === 0 && b === 0) continue
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
}
