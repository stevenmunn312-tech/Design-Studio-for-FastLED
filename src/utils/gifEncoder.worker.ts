import { GifEncoder } from './gifEncoder'

type Request =
  | { type: 'start'; width: number; height: number; delayCs: number }
  | { type: 'frame'; rgba: ArrayBuffer; final: boolean }

let encoder: GifEncoder | null = null
let output = new Blob([], { type: 'image/gif' })

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const message = event.data
    if (message.type === 'start') {
      encoder = new GifEncoder(message.width, message.height, message.delayCs)
      output = new Blob([], { type: 'image/gif' })
      self.postMessage({ type: 'ready' })
      return
    }
    if (!encoder) throw new Error('GIF encoder worker was not started')
    if (message.type === 'frame') {
      encoder.addFrame(new Uint8ClampedArray(message.rgba))
      // Extend an immutable Blob as each frame completes. Blob-to-Blob
      // composition is zero-copy in browsers, keeps the encoder's byte arrays
      // bounded to one frame, and makes finalisation a two-part append instead
      // of a large contiguous allocation or hundreds-part main-thread merge.
      const frameCount = encoder.frameCount
      if (message.final) {
        output = new Blob([output, ...encoder.drainParts(), ...encoder.finishParts()], { type: 'image/gif' })
        const blob = output
        encoder = null
        output = new Blob([], { type: 'image/gif' })
        self.postMessage({ type: 'done', frameCount, blob })
      } else {
        output = new Blob([output, ...encoder.drainParts()], { type: 'image/gif' })
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
