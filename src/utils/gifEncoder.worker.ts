import { GifEncoder } from './gifEncoder'

// Frames arrive already rasterised to opaque RGBA at output size. Rasterising
// here would mean reimplementing the preview's renderers a second time: the
// diffused styles lean on Canvas-2D `filter` blurs and the standard look on a
// WebGL shader, neither of which is dependably available on an OffscreenCanvas
// across browsers. The worker still owns quantisation and LZW, which is where
// the encode cost actually is.
type Request =
  | { type: 'start'; width: number; height: number; delayCs: number }
  | { type: 'frame'; rgba: ArrayBuffer; final: boolean }

let encoder: GifEncoder | null = null

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const message = event.data
    if (message.type === 'start') {
      encoder = new GifEncoder(message.width, message.height, message.delayCs)
      self.postMessage({ type: 'ready' })
      return
    }
    if (!encoder) throw new Error('GIF encoder worker was not started')
    if (message.type === 'frame') {
      encoder.addFrame(new Uint8ClampedArray(message.rgba))
      const frameCount = encoder.frameCount
      if (message.final) {
        const bytes = encoder.finish()
        encoder = null
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
