import type { Frame } from '../../state/graphEvaluator'
import type { PreviewStyle } from './previewStyles'
import { createDiffusionScratch, renderPreviewFrame, type DiffusionScratch } from './frameCanvas'
import { WebGLLEDRenderer } from './webglRenderer'
import { expandFlatFrame } from '../../utils/recordRasterizer'

// Rasteriser for the preview recorder. `preview` runs each captured frame
// through the *same* renderers the on-screen matrix uses — the WebGL shader
// when available, the Canvas-2D diffusion/LED path otherwise — so an export
// carries the user's chosen preview style, its cross-LED bloom, and its
// substrate instead of a lookalike approximation that inevitably drifts.
// `pixels` stays a pure per-pixel expansion: exact LED colours, no glow, for
// documentation and bug reports.

export type RecordRasterStyle = 'preview' | 'pixels'

export interface RecordRenderer {
  /** Rasterise one packed-RGB capture frame into opaque RGBA at output size. */
  render(rgb: Uint8ClampedArray): Uint8ClampedArray
  dispose(): void
}

export interface RecordRendererOptions {
  gridW: number
  gridH: number
  scale: number
  style: RecordRasterStyle
  /** Ignored for `pixels`; the live preview's effective style otherwise. */
  previewStyle: PreviewStyle
}

/** Reusable RGB[][] view over a packed-RGB capture frame — the canvas
 *  renderers take a Frame, and allocating one per exported frame is pure
 *  garbage on a long clip. */
function makeFrameBuffer(gridW: number, gridH: number): Frame {
  return Array.from({ length: gridH }, () =>
    Array.from({ length: gridW }, () => ({ r: 0, g: 0, b: 0 })))
}

function fillFrameBuffer(frame: Frame, rgb: Uint8ClampedArray, gridW: number, gridH: number): Frame {
  let at = 0
  for (let y = 0; y < gridH; y++) {
    const row = frame[y]
    for (let x = 0; x < gridW; x++) {
      const px = row[x]
      px.r = rgb[at++]
      px.g = rgb[at++]
      px.b = rgb[at++]
    }
  }
  return frame
}

class FlatRecordRenderer implements RecordRenderer {
  constructor(private readonly gridW: number, private readonly gridH: number, private readonly scale: number) {}

  render(rgb: Uint8ClampedArray): Uint8ClampedArray {
    return expandFlatFrame(rgb, this.gridW, this.gridH, this.scale)
  }

  dispose(): void {}
}

class PreviewRecordRenderer implements RecordRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly frame: Frame
  private readonly gl: WebGLLEDRenderer | null
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly scratch: DiffusionScratch | null
  // WebGL output is read back by blitting into a 2D canvas: a canvas has a
  // single context type, so the GL canvas cannot serve getImageData itself.
  private readonly readback: HTMLCanvasElement | null
  private readonly readbackCtx: CanvasRenderingContext2D | null

  constructor(private readonly opts: RecordRendererOptions) {
    const outW = opts.gridW * opts.scale
    const outH = opts.gridH * opts.scale
    this.canvas = document.createElement('canvas')
    this.canvas.width = outW
    this.canvas.height = outH
    this.frame = makeFrameBuffer(opts.gridW, opts.gridH)

    let gl: WebGLLEDRenderer | null = null
    try {
      gl = new WebGLLEDRenderer(this.canvas, { preserveDrawingBuffer: true })
    } catch {
      gl = null
    }
    this.gl = gl

    if (gl) {
      this.ctx = null
      this.scratch = null
      this.readback = document.createElement('canvas')
      this.readback.width = outW
      this.readback.height = outH
      this.readbackCtx = this.readback.getContext('2d')
      if (!this.readbackCtx) throw new Error('Could not create an export canvas')
    } else {
      this.ctx = this.canvas.getContext('2d')
      if (!this.ctx) throw new Error('Could not create an export canvas')
      this.scratch = createDiffusionScratch()
      this.readback = null
      this.readbackCtx = null
    }
  }

  render(rgb: Uint8ClampedArray): Uint8ClampedArray {
    const { gridW, gridH, scale, previewStyle } = this.opts
    const outW = gridW * scale
    const outH = gridH * scale
    fillFrameBuffer(this.frame, rgb, gridW, gridH)

    if (this.gl && this.readbackCtx) {
      this.gl.render(this.frame, gridW, gridH, scale, previewStyle)
      // Read back in the same task as the draw, while the drawing buffer is
      // still guaranteed live (and preserveDrawingBuffer keeps it so).
      this.readbackCtx.clearRect(0, 0, outW, outH)
      this.readbackCtx.drawImage(this.canvas, 0, 0)
      return this.readbackCtx.getImageData(0, 0, outW, outH).data
    }

    const ctx = this.ctx!
    renderPreviewFrame(ctx, this.frame, scale, previewStyle, this.scratch ?? undefined)
    return ctx.getImageData(0, 0, outW, outH).data
  }

  dispose(): void {
    this.gl?.destroy()
  }
}

export function createRecordRenderer(opts: RecordRendererOptions): RecordRenderer {
  if (opts.style === 'pixels') return new FlatRecordRenderer(opts.gridW, opts.gridH, opts.scale)
  return new PreviewRecordRenderer(opts)
}
