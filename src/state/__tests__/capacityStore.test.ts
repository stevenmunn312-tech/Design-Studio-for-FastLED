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

  it('drops the reading when there is nothing left to build', async () => {
    // The whole point of the null request. Leaving the old numbers up meant a
    // graph that stopped being buildable still showed a reading — from a
    // design that no longer existed — at status 'measured'.
    const { useCapacityStore } = await freshStore()
    const { request } = useCapacityStore.getState()

    request('CODE', 'esp32:esp32:esp32', true)
    await vi.advanceTimersByTimeAsync(1300)
    expect(useCapacityStore.getState().status).toBe('measured')
    expect(useCapacityStore.getState().result).not.toBeNull()

    request(null, 'esp32:esp32:esp32', true)
    expect(useCapacityStore.getState().status).toBe('nothing-to-measure')
    expect(useCapacityStore.getState().result).toBeNull()
  })

  it('retries instead of publishing a build-serialization collision', async () => {
    // The helper serializes builds, so a check that lands during an Upload
    // comes back having compiled nothing. Publishing that non-answer stranded
    // the meter on it — reported as a compile *failure* — until the user
    // happened to edit the graph, because the effect that asks for a check
    // only re-fires on a graph or board change.
    const { useCapacityStore } = await freshStore()
    const { request } = useCapacityStore.getState()

    compileCheck.mockResolvedValueOnce({
      ok: false, overflow: false, busy: true, target: 'esp32:esp32:esp32', flash: null, ram: null,
      error: 'Another build is running — not measured',
    } as never)

    request('CODE', 'esp32:esp32:esp32', true)
    await vi.advanceTimersByTimeAsync(1300)
    expect(useCapacityStore.getState().status).toBe('checking')
    expect(useCapacityStore.getState().result).toBeNull()

    await vi.advanceTimersByTimeAsync(3100)
    expect(compileCheck).toHaveBeenCalledTimes(2)
    expect(useCapacityStore.getState().status).toBe('measured')
    expect(useCapacityStore.getState().result?.ok).toBe(true)
  })

  it('does not carry a sketch reading over to the player, or back', async () => {
    // Same board, different binary. Showing one subject's numbers under the
    // other's name is the same lie a board switch would be.
    const { useCapacityStore } = await freshStore()
    const { request } = useCapacityStore.getState()

    request('CODE', 'esp32:esp32:esp32', true, undefined, 'sketch')
    await vi.advanceTimersByTimeAsync(1300)
    expect(useCapacityStore.getState().result).not.toBeNull()
    expect(useCapacityStore.getState().subject).toBe('sketch')

    request('PLAYER', 'esp32:esp32:esp32', true, undefined, 'player')
    expect(useCapacityStore.getState().status).toBe('checking')
    expect(useCapacityStore.getState().result).toBeNull()
    expect(useCapacityStore.getState().subject).toBe('player')
  })

  it('re-checks the same code when only the subject changed', async () => {
    // The cache key has to include the subject, or switching a graph into a
    // show with identical source would be swallowed as a repeat.
    const { useCapacityStore } = await freshStore()
    const { request } = useCapacityStore.getState()

    request('SAME', 'esp32:esp32:esp32', true, undefined, 'sketch')
    await vi.advanceTimersByTimeAsync(1300)
    expect(compileCheck).toHaveBeenCalledTimes(1)

    request('SAME', 'esp32:esp32:esp32', true, undefined, 'player')
    await vi.advanceTimersByTimeAsync(1300)
    expect(compileCheck).toHaveBeenCalledTimes(2)
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
