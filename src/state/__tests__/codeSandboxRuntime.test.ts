import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { evalCodeAsync, disposeCodeSandbox, getCodeError } from '../codeSandboxRuntime'
import type { RunRequest } from '../codeSandbox.worker'

// jsdom has no real Worker implementation, so codeSandboxRuntime's message
// protocol / timeout / respawn logic is exercised here against a fake Worker
// that the test controls directly (grabbing the constructed instance to fire
// a simulated response, or letting a timeout elapse with no response at all).
// `Worker` is looked up as a global at call time (inside evalCodeAsync), so
// stubbing it in beforeEach — before any test body runs — is sufficient; no
// module re-import is needed.

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  posted: RunRequest[] = []
  terminated = false
  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(msg: RunRequest) { this.posted.push(msg) }
  terminate() { this.terminated = true }
}

function respond(worker: FakeWorker, postedIndex: number, pixels: Uint8ClampedArray, error: string | null = null) {
  const id = worker.posted[postedIndex].id
  worker.onmessage?.({ data: { id, pixels, error } } as MessageEvent)
}

describe('codeSandboxRuntime', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('evalCodeAsync returns a blank frame before any worker response arrives', () => {
    const frame = evalCodeAsync('k-blank', '', 'leds[0] = CRGB::Red;', null, 0, 2, 2)
    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 0 })
    expect(FakeWorker.instances.length).toBe(1)
    expect(FakeWorker.instances[0].posted.length).toBe(1)
  })

  it('reflects the worker response on the next call (decoupled cadence)', () => {
    evalCodeAsync('k-resp', '', 'leds[0] = CRGB::Red;', null, 0, 2, 2)
    const worker = FakeWorker.instances[0]
    const pixels = new Uint8ClampedArray(2 * 2 * 3)
    pixels[0] = 200; pixels[1] = 100; pixels[2] = 50
    respond(worker, 0, pixels)

    const frame = evalCodeAsync('k-resp', '', 'leds[0] = CRGB::Red;', null, 1 / 60, 2, 2)
    expect(frame[0][0]).toEqual({ r: 200, g: 100, b: 50 })
  })

  it('ignores a stale response that has been superseded by a newer request', () => {
    evalCodeAsync('k-stale', '', 'leds[0] = CRGB::Red;', null, 0, 2, 2)
    evalCodeAsync('k-stale', '', 'leds[0] = CRGB::Red;', null, 1 / 60, 2, 2) // supersedes request 0
    const worker = FakeWorker.instances[0]
    const stalePixels = new Uint8ClampedArray(2 * 2 * 3)
    stalePixels[0] = 9
    respond(worker, 0, stalePixels) // response to the superseded request 0 — must be ignored

    const frame = evalCodeAsync('k-stale', '', 'leds[0] = CRGB::Red;', null, 2 / 60, 2, 2)
    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 0 }) // still blank — stale response never applied
  })

  it('surfaces a worker error via getCodeError, clearing it on the next clean response', () => {
    evalCodeAsync('k-err', '', 'someUndefinedFn();', null, 0, 2, 2)
    const worker = FakeWorker.instances[0]
    respond(worker, 0, new Uint8ClampedArray(2 * 2 * 3), 'someUndefinedFn is not defined')
    expect(getCodeError('k-err')).toBe('someUndefinedFn is not defined')

    evalCodeAsync('k-err', '', 'leds[0] = CRGB::Red;', null, 1 / 60, 2, 2)
    respond(worker, 1, new Uint8ClampedArray(2 * 2 * 3))
    expect(getCodeError('k-err')).toBeNull()
  })

  it('kills and respawns a worker that does not respond within the timeout budget', () => {
    vi.useFakeTimers()
    evalCodeAsync('k-timeout', '', 'while(true){}', null, 0, 2, 2)
    const worker = FakeWorker.instances[0]
    expect(worker.terminated).toBe(false)

    vi.advanceTimersByTime(150) // past the ~100ms run budget, no response ever sent

    expect(worker.terminated).toBe(true)
    expect(getCodeError('k-timeout')).toMatch(/timed out/i)

    // Next call respawns a fresh worker instance.
    evalCodeAsync('k-timeout', '', 'while(true){}', null, 1 / 60, 2, 2)
    expect(FakeWorker.instances.length).toBe(2)
    expect(FakeWorker.instances[1]).not.toBe(worker)
  })

  it('a response arriving just before the timeout cancels it (no spurious respawn)', () => {
    vi.useFakeTimers()
    evalCodeAsync('k-late', '', 'leds[0] = CRGB::Red;', null, 0, 2, 2)
    const worker = FakeWorker.instances[0]
    vi.advanceTimersByTime(50)
    respond(worker, 0, new Uint8ClampedArray(2 * 2 * 3))
    vi.advanceTimersByTime(100) // past the original budget, but the timeout was cleared on response

    expect(worker.terminated).toBe(false)
    expect(getCodeError('k-late')).toBeNull()
  })

  it('disposeCodeSandbox terminates the worker and clears its error state', () => {
    evalCodeAsync('k-dispose', '', 'someUndefinedFn();', null, 0, 2, 2)
    const worker = FakeWorker.instances[0]
    respond(worker, 0, new Uint8ClampedArray(2 * 2 * 3), 'boom')
    expect(getCodeError('k-dispose')).toBe('boom')

    disposeCodeSandbox('k-dispose')
    expect(worker.terminated).toBe(true)
    expect(getCodeError('k-dispose')).toBeNull()
  })

  it('fails closed (blank frame + error) when Worker cannot be constructed, never falling back to unsandboxed eval', () => {
    vi.stubGlobal('Worker', class {
      constructor() { throw new Error('Worker is not defined in this environment') }
    })
    const frame = evalCodeAsync('k-nosupport', '', 'leds[0] = CRGB::Red;', null, 0, 2, 2)
    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 0 })
    expect(getCodeError('k-nosupport')).toMatch(/unavailable/i)
  })
})
