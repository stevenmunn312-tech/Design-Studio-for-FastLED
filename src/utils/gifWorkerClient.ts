import type { RecordRasterStyle } from './recordRasterizer'

export interface WorkerGifOptions {
  width: number
  height: number
  gridW: number
  gridH: number
  scale: number
  style: RecordRasterStyle
  delayCs: number
  frameCount: number
  frameAt: (index: number) => Uint8ClampedArray
  onProgress?: (done: number, total: number) => void
  onFinalizing?: () => void
  isCancelled?: () => boolean
}

type WorkerResponse =
  | { type: 'ready' }
  | { type: 'frame'; frameCount: number }
  | { type: 'done'; frameCount: number; bytes: ArrayBuffer }
  | { type: 'error'; message: string }

/**
 * Rasterise one frame at a time and send it to a dedicated encoder worker.
 * Waiting for each acknowledgement provides backpressure, so a large export
 * cannot queue hundreds of full-resolution RGBA buffers in worker memory.
 */
export function encodeGifInWorker(options: WorkerGifOptions): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gifEncoder.worker.ts', import.meta.url), { type: 'module' })
    let nextFrame = 0
    let settled = false

    const finish = (result: Blob | null, error?: Error) => {
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
      const rgb = options.frameAt(nextFrame++)
      const final = nextFrame >= options.frameCount
      if (final) options.onFinalizing?.()
      const buffer = rgb.buffer as ArrayBuffer
      worker.postMessage({ type: 'frame', rgb: buffer, final }, [buffer])
    }

    worker.onerror = (event) => finish(null, new Error(event.message || 'GIF encoding worker failed'))
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      try {
        const message = event.data
        if (message.type === 'error') {
          finish(null, new Error(message.message))
        } else if (message.type === 'done') {
          options.onProgress?.(message.frameCount, options.frameCount)
          finish(new Blob([message.bytes], { type: 'image/gif' }))
        } else if (message.type === 'frame') {
          options.onProgress?.(message.frameCount, options.frameCount)
          sendNext()
        } else {
          sendNext()
        }
      } catch (error) {
        finish(null, error instanceof Error ? error : new Error(String(error)))
      }
    }

    worker.postMessage({
      type: 'start',
      width: options.width,
      height: options.height,
      gridW: options.gridW,
      gridH: options.gridH,
      scale: options.scale,
      style: options.style,
      delayCs: options.delayCs,
    })
  })
}
