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
      // Ship completed frame chunks immediately. Blob structured-cloning is
      // effectively zero-copy and lets the main thread compose the final file
      // without one huge end-of-export allocation in either thread.
      const chunk = new Blob(encoder.drainParts(), { type: 'image/gif' })
      self.postMessage({ type: 'frame', frameCount: encoder.frameCount, chunk })
      return
    }
    const chunk = new Blob(encoder.finishParts(), { type: 'image/gif' })
    encoder = null
    self.postMessage({ type: 'done', chunk })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
