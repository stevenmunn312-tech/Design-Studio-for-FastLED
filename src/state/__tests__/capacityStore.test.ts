import { beforeEach, describe, expect, it, vi } from 'vitest'

const compileCheck = vi.fn(async () => ({
  ok: true, overflow: false, target: 'esp32:esp32:esp32', flash: null, ram: null,
}))

vi.mock('../../utils/backendClient', () => ({ compileCheck }))

async function freshStore() {
  vi.resetModules()
  return import('../capacityStore')
}

const TARGET = { code: 'CODE', fqbn: 'esp32:esp32:esp32', toolchainReady: true, subject: 'sketch' } as const

describe('capacityStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    compileCheck.mockClear()
    compileCheck.mockResolvedValue({
      ok: true, overflow: false, target: 'esp32:esp32:esp32', flash: null, ram: null,
    })
  })

  it('never compiles anything on its own', async () => {
    // The whole point of making the meter user-initiated. A background check is
    // a full board compile per edit pause, and — because the helper serializes
    // builds on one project directory — it can take the build lock ahead of the
    // user's own Upload, which then waits on a build nobody asked for.
    // Publishing a target must stay free.
    const { useCapacityStore } = await freshStore()
    const { setTarget } = useCapacityStore.getState()

    setTarget(TARGET)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(compileCheck).not.toHaveBeenCalled()
    expect(useCapacityStore.getState().status).toBe('idle')
  })

  it('measures when asked, and only then', async () => {
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()

    setTarget(TARGET)
    check()
    await vi.advanceTimersByTimeAsync(0)

    expect(compileCheck).toHaveBeenCalledTimes(1)
    expect(useCapacityStore.getState().status).toBe('measured')
    expect(useCapacityStore.getState().result?.ok).toBe(true)
  })

  it('marks a reading stale once the graph moves on, without dropping it', async () => {
    // The cost of manual checking: a reading can outlive the design it
    // measured. It still says roughly where you stand, so it stays — but it
    // must never look current (in particular `MatrixOutputDeployPopup` blocks
    // an upload on a 'measured' overflow, never a stale one).
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()

    setTarget(TARGET)
    check()
    await vi.advanceTimersByTimeAsync(0)
    expect(useCapacityStore.getState().status).toBe('measured')

    setTarget({ ...TARGET, code: 'CODE WITH ONE MORE PATTERN' })
    expect(useCapacityStore.getState().status).toBe('stale')
    expect(useCapacityStore.getState().result).not.toBeNull()

    // ...and current again the moment the graph comes back to what was measured.
    setTarget(TARGET)
    expect(useCapacityStore.getState().status).toBe('measured')
  })

  it('treats a board or engine switch as staleness too, not just a code edit', async () => {
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()

    setTarget({ ...TARGET, engineTag: 'fbuild' })
    check()
    await vi.advanceTimersByTimeAsync(0)

    setTarget({ ...TARGET, engineTag: 'arduino-cli' })
    expect(useCapacityStore.getState().status).toBe('stale')
  })

  it('does not carry a sketch reading over to the player, or back', async () => {
    // Same board, different binary. Showing one subject's numbers under the
    // other's name is the same lie a board switch would be.
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()

    setTarget(TARGET)
    check()
    await vi.advanceTimersByTimeAsync(0)
    expect(useCapacityStore.getState().subject).toBe('sketch')

    setTarget({ ...TARGET, code: 'PLAYER', subject: 'player' })
    expect(useCapacityStore.getState().status).toBe('stale')
  })

  it('drops the reading when there is nothing left to build', async () => {
    // Leaving the old numbers up meant a graph that stopped being buildable
    // still showed a reading — from a design that no longer existed.
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()

    setTarget(TARGET)
    check()
    await vi.advanceTimersByTimeAsync(0)
    expect(useCapacityStore.getState().result).not.toBeNull()

    setTarget({ ...TARGET, code: null })
    expect(useCapacityStore.getState().status).toBe('nothing-to-measure')
    expect(useCapacityStore.getState().result).toBeNull()
  })

  it('refuses to check what it cannot build', async () => {
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()

    setTarget({ ...TARGET, toolchainReady: false })
    check()
    await vi.advanceTimersByTimeAsync(0)
    expect(compileCheck).not.toHaveBeenCalled()
    expect(useCapacityStore.getState().status).toBe('toolchain-missing')

    setTarget({ ...TARGET, code: null })
    check()
    await vi.advanceTimersByTimeAsync(0)
    expect(compileCheck).not.toHaveBeenCalled()
  })

  it('tracks preparation failures and retries even while every target has null code', async () => {
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()
    setTarget(TARGET)
    check()
    await vi.advanceTimersByTimeAsync(0)
    compileCheck.mockClear()

    setTarget({ ...TARGET, code: null, preparing: true })
    expect(useCapacityStore.getState().status).toBe('preparing')
    expect(useCapacityStore.getState().result).toBeNull()
    check()
    for (const preparationError of ['Panel: Power failed', 'Panel: Play failed']) {
      setTarget({ ...TARGET, code: null, preparationError })
      expect(useCapacityStore.getState().status).toBe('preparation-failed')
      expect(useCapacityStore.getState().target?.preparationError).toBe(preparationError)
      check()
    }
    setTarget({ ...TARGET, code: null, preparing: true })
    expect(useCapacityStore.getState().status).toBe('preparing')
    check()
    expect(compileCheck).not.toHaveBeenCalled()
    setTarget(TARGET)
    expect(useCapacityStore.getState().status).toBe('idle')
  })

  it('retries a build-serialization collision, then reports it', async () => {
    // The helper serializes builds, so a check pressed during an Upload comes
    // back having compiled nothing. The user asked for this one, so retry
    // rather than making them press again — but not forever, or a
    // walked-away-from session polls a busy helper indefinitely.
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()

    compileCheck.mockResolvedValue({
      ok: false, overflow: false, busy: true, target: 'esp32:esp32:esp32', flash: null, ram: null,
      error: 'Another build is running — not measured',
    } as never)

    setTarget(TARGET)
    check()
    await vi.advanceTimersByTimeAsync(0)
    expect(useCapacityStore.getState().status).toBe('checking')

    await vi.advanceTimersByTimeAsync(20_000)
    expect(compileCheck).toHaveBeenCalledTimes(4) // the press, plus three retries
    expect(useCapacityStore.getState().result?.busy).toBe(true)
  })

  it('abandons an in-flight check when the graph changes under it', async () => {
    const { useCapacityStore } = await freshStore()
    const { setTarget, check } = useCapacityStore.getState()

    let release: (value: unknown) => void = () => {}
    compileCheck.mockReturnValueOnce(new Promise((resolve) => { release = resolve }) as never)

    setTarget(TARGET)
    check()
    expect(useCapacityStore.getState().status).toBe('checking')

    setTarget({ ...TARGET, code: 'SOMETHING ELSE' })
    release({ ok: true, overflow: false, target: 'esp32:esp32:esp32', flash: null, ram: null })
    await vi.advanceTimersByTimeAsync(0)

    // The answer described the graph as it was, not as it is.
    expect(useCapacityStore.getState().result).toBeNull()
    expect(useCapacityStore.getState().status).toBe('idle')
  })
})
