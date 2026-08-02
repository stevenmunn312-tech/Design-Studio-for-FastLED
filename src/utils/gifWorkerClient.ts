export interface WorkerGifOptions {
  width: number
  height: number
  delayCs: number
  frameCount: number
  frameAt: (index: number) => Uint8ClampedArray
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}

type WorkerResponse =
  | { type: 'ready' }
  | { type: 'frame'; frameCount: number }
  | { type: 'done'; bytes: ArrayBuffer }
  | { type: 'error'; message: string }

/**
 * Rasterise one frame at a time and send it to a dedicated encoder worker.
 * Waiting for each acknowledgement provides backpressure, so a large export
 * cannot queue hundreds of full-resolution RGBA buffers in worker memory.
 */
export function encodeGifInWorker(options: WorkerGifOptions): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gifEncoder.worker.ts', import.meta.url), { type: 'module' })
    let nextFrame = 0
    let settled = false

    const finish = (result: Uint8Array | null, error?: Error) => {
      if (settled) return
      settled = true
      worker.terminate()
      if (error) reject(error)
      else resolve(result)
    }

    const sendNext = () => {
      if (options.isCancelled?.()) {
        finish(null)
        return
      }
      if (nextFrame >= options.frameCount) {
        worker.postMessage({ type: 'finish' })
        return
      }
      const rgba = options.frameAt(nextFrame++)
      const buffer = rgba.buffer as ArrayBuffer
      worker.postMessage({ type: 'frame', rgba: buffer }, [buffer])
    }

    worker.onerror = (event) => finish(null, new Error(event.message || 'GIF encoding worker failed'))
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'error') {
        finish(null, new Error(message.message))
      } else if (message.type === 'done') {
        finish(new Uint8Array(message.bytes))
      } else if (message.type === 'frame') {
        options.onProgress?.(message.frameCount, options.frameCount)
        sendNext()
      } else {
        sendNext()
      }
    }

    worker.postMessage({
      type: 'start',
      width: options.width,
      height: options.height,
      delayCs: options.delayCs,
    })
  })
}
