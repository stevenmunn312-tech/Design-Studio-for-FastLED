import { GifEncoder } from './gifEncoder'
import { rasterizeRecordedFrame, type RecordRasterStyle } from './recordRasterizer'

type Request =
  | { type: 'start'; width: number; height: number; gridW: number; gridH: number; scale: number; style: RecordRasterStyle; delayCs: number }
  | { type: 'frame'; rgb: ArrayBuffer; final: boolean }

let encoder: GifEncoder | null = null
let rasterConfig: { gridW: number; gridH: number; scale: number; style: RecordRasterStyle } | null = null

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const message = event.data
    if (message.type === 'start') {
      encoder = new GifEncoder(message.width, message.height, message.delayCs)
      rasterConfig = { gridW: message.gridW, gridH: message.gridH, scale: message.scale, style: message.style }
      self.postMessage({ type: 'ready' })
      return
    }
    if (!encoder || !rasterConfig) throw new Error('GIF encoder worker was not started')
    if (message.type === 'frame') {
      const rgba = rasterizeRecordedFrame(
        new Uint8ClampedArray(message.rgb),
        rasterConfig.gridW,
        rasterConfig.gridH,
        rasterConfig.scale,
        rasterConfig.style,
      )
      encoder.addFrame(rgba)
      const frameCount = encoder.frameCount
      if (message.final) {
        const bytes = encoder.finish()
        encoder = null
        rasterConfig = null
        self.postMessage({ type: 'done', frameCount, bytes: bytes.buffer }, { transfer: [bytes.buffer] })
      } else {
        self.postMessage({ type: 'frame', frameCount })
      }
      return
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
