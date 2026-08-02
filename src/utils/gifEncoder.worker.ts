import { GifEncoder } from './gifEncoder'

type Request =
  | { type: 'start'; width: number; height: number; delayCs: number }
  | { type: 'frame'; rgba: ArrayBuffer }
  | { type: 'finish' }

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
      self.postMessage({ type: 'frame', frameCount: encoder.frameCount })
      return
    }
    const bytes = encoder.finish()
    encoder = null
    self.postMessage({ type: 'done', bytes: bytes.buffer }, { transfer: [bytes.buffer] })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
