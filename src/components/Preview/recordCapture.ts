import { evaluateGraphFull, type Frame, type GroupRegistry } from '../../state/graphEvaluator'
import { masterSpeedFromOutputs, MASTER_SPEED_DEFAULT } from '../../state/masterSpeed'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { idleFrame } from './idleFrame'
import { outputRenderPasses, outputRenderPassFor, outputRoutes, routeFrame } from '../../state/outputRouting'
import { applyShowPlaybackSignal } from './showPlaybackSignal'
import type { RecordedAudioFrame } from './recordAudio'
import type { ShowFile } from '../../types/showFile'
import { controllerSettings } from '../../state/controllerSettings'

// Offline capture engine for the preview recorder: evaluates the graph
// deterministically from t = 0 at the chosen capture fps — independent of the
// live render loop — under its own evaluator-state namespace, so stateful
// nodes (Fire, Particles, …) are neither disturbed in the live preview nor
// double-advanced (the same isolation trick evaluateScalarSeries and the show
// preview use). Each rendered frame is copied to packed RGB bytes immediately,
// because evaluator frames are pooled and recycled between passes.
//
// The per-frame pipeline mirrors LEDPreview's render loop step for step —
// evaluate on the shared composition canvas, route into the selected output,
// apply the master brightness, then the show-playback overlay — so a recording
// cannot show something the live matrix never did.

/** Mirrors the shape LEDPreview reads out of `showPlayback`, minus the live
 *  position: an offline capture advances that on its own clock. */
export interface CaptureShowPlayback {
  nodeId: string | null
  show: ShowFile | null
  posMs: number
  useGroupInputs: boolean
}

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
  /** Seconds of frames to render and discard before the clip starts, so
   *  simulation nodes (Fire, Trails, Particles, Game of Life, …) are in a
   *  settled state at frame 0 rather than the blank one they hold at boot. */
  warmupSec?: number
  /** A show the preview is currently overlaying (PerformanceGenerator's
   *  "Show in main LED preview"). Its `posMs` is the clip's start position. */
  showPlayback?: CaptureShowPlayback | null
  /** One pre-recorded live-audio frame per captured frame (see recordAudio.ts).
   *  Without it the evaluator reads the mic store directly, which an offline
   *  render samples far faster than real time — freezing the reaction. */
  audioTimeline?: RecordedAudioFrame[] | null
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}

function masterBrightnessScale(brightness: number): number {
  return brightness >= 255 ? 1 : brightness / 255
}

/** LEDPreview's applyMasterBrightness, in place. Safe to mutate here because
 *  the frame is routeFrame's own fresh per-call allocation, never the
 *  evaluator's pooled buffer. */
function scaleFrame(frame: Frame, scale: number): Frame {
  if (scale === 1) return frame
  for (const row of frame) for (const px of row) { px.r *= scale; px.g *= scale; px.b *= scale }
  return frame
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

// Animated GIFs retain every full raster frame. Keep the combined raster
// workload bounded so large matrices and long clips cannot create a
// hundreds-of-megabytes final Blob even though each individual dimension is
// within the canvas limit. 16M pixels is 64 MB of transient RGBA work before
// palette compression and remains practical on mainstream browsers.
export const MAX_GIF_RASTER_PIXELS = 16_000_000

export function gifScaleLimit(
  gridW: number,
  gridH: number,
  frameCount: number,
  maxOutputPx: number,
  rasterBudget = MAX_GIF_RASTER_PIXELS,
): number {
  const dimensionLimit = Math.floor(maxOutputPx / Math.max(gridW, gridH))
  const animationLimit = Math.floor(Math.sqrt(rasterBudget / Math.max(1, gridW * gridH * frameCount)))
  return Math.max(2, Math.min(dimensionLimit, animationLimit))
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
  const warmup = Math.max(0, Math.round((opts.warmupSec ?? 0) * fps))
  const routes = outputRoutes(nodes)
  const route = routes.find((candidate) => candidate.id === opts.outputId) ?? routes[0]
  // compositionDims falls back to a hardcoded 16x16 when there's no route to
  // size against (e.g. a hardware-agnostic shared pattern with MatrixOutput
  // stripped) — but frameToBytes below packs bytes at outW/outH, which falls
  // back to the caller's gridW/gridH in that same case. Without this, a
  // 32x32 capture request would evaluate at 16x16 and then read a phantom
  // 32x32 region out of it, leaving 3/4 of the packed frame black.
  const renderPass = route ? outputRenderPassFor(route, outputRenderPasses(nodes, edges)) : null
  const composition = renderPass ? { w: renderPass.width, h: renderPass.height } : { w: gridW, h: gridH }
  const brightness = masterBrightnessScale(controllerSettings(nodes).brightness)
  // The routed frame's true shape. gridW/gridH is the caller's expectation and
  // only applies when there is no route to size against.
  const outW = route?.width ?? gridW
  const outH = route?.height ?? gridH
  const playback = opts.showPlayback ?? null
  const audioTimeline = opts.audioTimeline ?? null
  // evaluateGraph returns the first terminal, so reorder only the terminal
  // list to make the chosen route first while preserving every dependency.
  const evaluationNodes = route
    ? [route.node, ...nodes.filter((node) => node.id !== route.id)]
    : nodes

  const frames: Uint8ClampedArray[] = []
  // tick/60 = seconds, so one captured frame is this many ticks apart. Warm-up
  // frames occupy the seconds before the clip, so the recorded window still
  // begins at a whole number of frames from the warmed-up state.
  const tickStep = 60 / fps
  /*
   * Master Speed, accumulated exactly as the live preview accumulates it:
   * `tick += step * speed`, using the speed the previous frame resolved. A
   * recording that ignored the knob would play back at a different rate from
   * the preview it was captured from, which is the kind of silent disagreement
   * the shared helper exists to prevent. See state/masterSpeed.ts.
   */
  let tick = 0
  let elapsedTick = 0
  let speed = MASTER_SPEED_DEFAULT
  for (let i = 0; i < warmup + renderCount; i++) {
    if (opts.isCancelled?.()) return null
    if (i > 0) {
      tick += tickStep * speed
      elapsedTick += tickStep
    }
    // Warm-up frames sit before the recorded window, so they hold the clip's
    // opening audio rather than running off the front of the timeline.
    const audio = audioTimeline
      ? audioTimeline[Math.min(audioTimeline.length - 1, Math.max(0, i - warmup))] ?? null
      : null
    // The full form for its outputs map, and `auxNodes: false` so the work is
    // the reachable set this always evaluated — Master Speed is a sink, so it
    // is in that set rather than an extra pass.
    const pass = evaluateGraphFull(
      evaluationNodes, edges, tick, composition.w, composition.h, groups, false, trusted,
      `${prefix}${renderPass?.key ?? `${composition.w}x${composition.h}`}/`, audio, elapsedTick,
    )
    speed = masterSpeedFromOutputs(evaluationNodes, pass.outputs)
    const rendered = pass.frame
    const routed = route ? routeFrame(rendered, route, composition.w, composition.h) : rendered
    // Same order as LEDPreview's loop: route → master brightness → idle
    // fallback (undimmed; it isn't real output) → show-playback overlay.
    let frame = routed && route ? scaleFrame(routed, brightness) : routed
    if (!frame) frame = idleFrame(tick, outW, outH)
    if (playback) {
      const posMs = playback.posMs + ((i - warmup) * 1000) / fps
      frame = applyShowPlaybackSignal(frame, { ...playback, posMs }, outW, outH, groups, trusted)
    }
    if (i >= warmup) frames.push(frameToBytes(frame, 1, 1, outW, outH))
    opts.onProgress?.(i + 1, warmup + renderCount)
    // Yield periodically: keeps the UI responsive and lets the live preview
    // loop advance the evaluator's frame pool so capture evaluations reuse
    // buffers instead of growing the pool for the whole run.
    if ((i + 1) % YIELD_EVERY === 0) await yieldToUi()
  }

  return blend > 0 ? applyLoopBlend(frames, total, blend) : frames
}
