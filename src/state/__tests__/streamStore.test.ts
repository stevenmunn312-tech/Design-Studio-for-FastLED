import { beforeEach, describe, expect, it, vi } from 'vitest'

const startStream = vi.fn(async () => ({ ok: true }))
const sendStreamFrame = vi.fn<(packet: Uint8Array) => Promise<boolean>>(async () => true)
const stopStream = vi.fn(async () => {})

vi.mock('../../utils/backendClient', () => ({ startStream, sendStreamFrame, stopStream }))

async function freshStore() {
  vi.resetModules()
  return import('../streamStore')
}

const LAYOUT = { outputId: '', width: 16, height: 16, serpentine: false, baud: 921600 }

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

  it('sends the frame as published, even if the evaluator recycles the buffer afterwards', async () => {
    const { useStreamStore, publishStreamFrame } = await freshStore()
    await useStreamStore.getState().start('COM3', LAYOUT)

    // A pooled evaluator frame: published, then handed to a different node and
    // overwritten before the throttled send loop next fires.
    const pooled = frame(16, 16)
    pooled[0][0] = { r: 10, g: 20, b: 30 }
    publishStreamFrame(pooled, 16, 16)
    for (const row of pooled) for (const px of row) { px.r = 255; px.g = 255; px.b = 255 }

    await vi.advanceTimersByTimeAsync(100)

    expect(sendStreamFrame).toHaveBeenCalled()
    const packet = sendStreamFrame.mock.calls[0][0]
    // Pixel (0,0) is the first RGB triple after the 6-byte Adalight header.
    expect([...packet.slice(6, 9)]).toEqual([10, 20, 30])
  })

  it('streams the flashed output route even when another route is selected in the preview', async () => {
    const { useStreamStore, publishStreamFrame, publishOutputStreamFrame } = await freshStore()
    const layout = { ...LAYOUT, outputId: 'ice-output' }
    await useStreamStore.getState().start('COM3', layout)

    const selectedPreview = frame(16, 16)
    selectedPreview[0][0] = { r: 255, g: 0, b: 0 }
    publishStreamFrame(selectedPreview, 16, 16, 'warm-output')

    const streamedOutput = frame(16, 16)
    streamedOutput[0][0] = { r: 3, g: 80, b: 220 }
    publishOutputStreamFrame(streamedOutput, 16, 16, 'ice-output')

    await vi.advanceTimersByTimeAsync(100)

    expect(sendStreamFrame).toHaveBeenCalled()
    const packet = sendStreamFrame.mock.calls[0][0]
    expect([...packet.slice(6, 9)]).toEqual([3, 80, 220])
  })

  it('keeps snapshot copies stable while later frames are published', async () => {
    const { publishStreamFrame, latestStreamFrameCopy } = await freshStore()

    const first = frame(4, 4)
    first[1][2] = { r: 1, g: 2, b: 3 }
    publishStreamFrame(first, 4, 4)
    const snapshot = latestStreamFrameCopy()!

    const second = frame(4, 4)
    second[1][2] = { r: 9, g: 9, b: 9 }
    publishStreamFrame(second, 4, 4)

    const at = (1 * 4 + 2) * 3
    expect([...snapshot.bytes.slice(at, at + 3)]).toEqual([1, 2, 3])
    expect([...latestStreamFrameCopy()!.bytes.slice(at, at + 3)]).toEqual([9, 9, 9])
  })

  it('drops the buffer on a degenerate published size', async () => {
    const { publishStreamFrame, latestStreamFrameCopy } = await freshStore()
    publishStreamFrame(frame(4, 4), 4, 4)
    expect(latestStreamFrameCopy()).not.toBeNull()
    publishStreamFrame([], 0, 0)
    expect(latestStreamFrameCopy()).toBeNull()
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
