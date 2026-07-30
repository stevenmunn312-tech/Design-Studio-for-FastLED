import { beforeEach, describe, expect, it, vi } from 'vitest'

const compileCheck = vi.fn(async () => ({
  ok: true, overflow: false, target: 'esp32:esp32:esp32', flash: null, ram: null,
}))

vi.mock('../../utils/backendClient', () => ({ compileCheck }))

async function freshStore() {
  vi.resetModules()
  return import('../capacityStore')
}

describe('capacityStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    compileCheck.mockClear()
  })

  it('re-checks once the toolchain becomes ready, without needing a code or board change', async () => {
    const { useCapacityStore } = await freshStore()
    const { request } = useCapacityStore.getState()

    // Core not installed yet: nothing measurable.
    request('CODE', 'esp32:esp32:esp32', false, 'arduino-cli')
    expect(useCapacityStore.getState().status).toBe('toolchain-missing')
    expect(compileCheck).not.toHaveBeenCalled()

    // Core installed — same sketch, same board, same engine. The cache key must
    // not swallow this, or the meter stays pinned to 'toolchain-missing'.
    request('CODE', 'esp32:esp32:esp32', true, 'arduino-cli')
    expect(useCapacityStore.getState().status).toBe('checking')

    await vi.advanceTimersByTimeAsync(2000)
    expect(compileCheck).toHaveBeenCalledTimes(1)
    expect(useCapacityStore.getState().status).toBe('measured')
  })

  it('still de-duplicates repeat requests once a check has actually run', async () => {
    const { useCapacityStore } = await freshStore()
    const { request } = useCapacityStore.getState()

    request('CODE', 'esp32:esp32:esp32', true, 'fbuild')
    await vi.advanceTimersByTimeAsync(2000)
    expect(compileCheck).toHaveBeenCalledTimes(1)

    request('CODE', 'esp32:esp32:esp32', true, 'fbuild')
    await vi.advanceTimersByTimeAsync(2000)
    expect(compileCheck).toHaveBeenCalledTimes(1)
  })
})
