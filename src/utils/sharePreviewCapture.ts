import { captureSequence } from '../components/Preview/recordCapture'
import { createRecordRenderer } from '../components/Preview/recordRenderer'
import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'

// Headless, dialog-free capture for community sharing — a short looping WebM
// clip so the gallery can show a real animation without every visitor's
// browser running a live evaluator per card. Fixed at the site's standard
// 32x32 preview size regardless of the pattern's actual hardware target,
// matching how MatrixOutput is already stripped for hardware-agnostic
// sharing. Mirrors RecordPopup's own exportWebm, minus the dialog/UI state.

const GRID = 32
const DURATION_SEC = 5
const FPS = 20
const SCALE = 8
const WARMUP_SEC = 2

function pickWebmMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const mime of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return null
}

export interface SharePreviewCaptureOptions {
  nodes: StudioNode[]
  edges: StudioEdge[]
  groups?: GroupRegistry
  trusted?: boolean
}

/** Returns null when WebM recording isn't available, or the graph has
 *  nothing to render — callers should share without a captured clip in that
 *  case, not fail the share itself. */
export async function captureSharePreview(opts: SharePreviewCaptureOptions): Promise<Blob | null> {
  const webmMime = pickWebmMime()
  if (!webmMime) return null
  if (opts.nodes.length === 0) return null

  const frames = await captureSequence({
    nodes: opts.nodes,
    edges: opts.edges,
    groups: opts.groups ?? {},
    trusted: opts.trusted === true,
    gridW: GRID,
    gridH: GRID,
    fps: FPS,
    durationSec: DURATION_SEC,
    seamlessLoop: true,
    warmupSec: WARMUP_SEC,
  })
  if (!frames || frames.length === 0) return null

  const outW = GRID * SCALE
  const outH = GRID * SCALE
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const renderer = createRecordRenderer({ gridW: GRID, gridH: GRID, scale: SCALE, style: 'preview', previewStyle: 'standard' })
  const stream = canvas.captureStream(FPS)
  const recorder = new MediaRecorder(stream, { mimeType: webmMime, videoBitsPerSecond: 2_000_000 })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }

  const drawFrame = (frame: Uint8ClampedArray) => {
    ctx.putImageData(new ImageData(renderer.render(frame), outW, outH), 0, 0)
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
    recorder.onerror = () => resolve(null)
    drawFrame(frames[0])
    recorder.start()
    const started = performance.now()
    let drawn = 1
    const tick = () => {
      const due = Math.min(frames.length, Math.floor(((performance.now() - started) / 1000) * FPS) + 1)
      if (drawn < due) {
        drawFrame(frames[due - 1])
        drawn = due
      }
      if (drawn >= frames.length) {
        setTimeout(() => recorder.stop(), 1000 / FPS + 120)
        return
      }
      setTimeout(tick, 1000 / FPS / 2)
    }
    setTimeout(tick, 1000 / FPS / 2)
  })
  renderer.dispose()
  return blob
}
