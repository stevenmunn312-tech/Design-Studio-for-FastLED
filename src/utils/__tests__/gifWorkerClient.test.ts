import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeGifInWorker } from '../gifWorkerClient'

type Response =
  | { type: 'ready' }
  | { type: 'frame'; frameCount: number }
  | { type: 'done'; bytes: ArrayBuffer }

class FakeWorker {
  static instances: FakeWorker[] = []

  onmessage: ((event: MessageEvent<Response>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: string[] = []
  readonly transfers: Transferable[][] = []
  terminated = false
  private frames = 0

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: { type: string }, transfer: Transferable[] = []) {
    this.messages.push(message.type)
    this.transfers.push(transfer)
    queueMicrotask(() => {
      if (message.type === 'start') this.respond({ type: 'ready' })
      else if (message.type === 'frame') this.respond({ type: 'frame', frameCount: ++this.frames })
      else this.respond({ type: 'done', bytes: Uint8Array.from([0x47, 0x49, 0x46]).buffer })
    })
  }

  terminate() {
    this.terminated = true
  }

  private respond(data: Response) {
    this.onmessage?.({ data } as MessageEvent<Response>)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeWorker.instances = []
})

describe('encodeGifInWorker', () => {
  it('uses one-frame backpressure and reports worker progress', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const progress: number[] = []
    const frameAt = vi.fn(() => new Uint8ClampedArray(16))

    const bytes = await encodeGifInWorker({
      width: 2,
      height: 2,
      delayCs: 5,
      frameCount: 3,
      frameAt,
      onProgress: (done) => progress.push(done),
    })

    const worker = FakeWorker.instances[0]
    expect([...bytes!]).toEqual([0x47, 0x49, 0x46])
    expect(worker.messages).toEqual(['start', 'frame', 'frame', 'frame', 'finish'])
    expect(worker.transfers.slice(1, 4).every((items) => items.length === 1)).toBe(true)
    expect(frameAt).toHaveBeenCalledTimes(3)
    expect(progress).toEqual([1, 2, 3])
    expect(worker.terminated).toBe(true)
  })

  it('terminates without rasterising a frame when cancelled', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const frameAt = vi.fn(() => new Uint8ClampedArray(16))

    const bytes = await encodeGifInWorker({
      width: 2,
      height: 2,
      delayCs: 5,
      frameCount: 3,
      frameAt,
      isCancelled: () => true,
    })

    const worker = FakeWorker.instances[0]
    expect(bytes).toBeNull()
    expect(frameAt).not.toHaveBeenCalled()
    expect(worker.messages).toEqual(['start'])
    expect(worker.terminated).toBe(true)
  })
})
