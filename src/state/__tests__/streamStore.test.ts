import { beforeEach, describe, expect, it, vi } from 'vitest'

const startStream = vi.fn(async () => ({ ok: true }))
const sendStreamFrame = vi.fn(async () => true)
const stopStream = vi.fn(async () => {})

vi.mock('../../utils/backendClient', () => ({ startStream, sendStreamFrame, stopStream }))

async function freshStore() {
  vi.resetModules()
  return import('../streamStore')
}

const LAYOUT = { width: 16, height: 16, baud: 921600, map: [] } as never

function frame(width: number, height: number) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ r: 0, g: 0, b: 0 })))
}

describe('streamStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    startStream.mockClear()
    sendStreamFrame.mockClear()
    stopStream.mockClear()
  })

  it('explains a matrix/receiver size mismatch instead of silently dropping frames', async () => {
    const { useStreamStore, publishStreamFrame } = await freshStore()
    await useStreamStore.getState().start('COM3', LAYOUT)

    // The matrix was resized after the receiver was flashed for 16×16.
    publishStreamFrame(frame(32, 8), 32, 8)
    await vi.advanceTimersByTimeAsync(200)

    expect(sendStreamFrame).not.toHaveBeenCalled()
    const error = useStreamStore.getState().error ?? ''
    expect(error).toContain('32×8')
    expect(error).toContain('16×16')
    expect(error).toMatch(/re-flash/i)
  })

  it('clears the mismatch message once the sizes line up again', async () => {
    const { useStreamStore, publishStreamFrame } = await freshStore()
    await useStreamStore.getState().start('COM3', LAYOUT)

    publishStreamFrame(frame(32, 8), 32, 8)
    await vi.advanceTimersByTimeAsync(100)
    expect(useStreamStore.getState().error).toBeTruthy()

    publishStreamFrame(frame(16, 16), 16, 16)
    await vi.advanceTimersByTimeAsync(100)

    expect(useStreamStore.getState().error).toBeNull()
    expect(sendStreamFrame).toHaveBeenCalled()
  })
})
