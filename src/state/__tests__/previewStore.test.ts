import { describe, it, expect, beforeEach } from 'vitest'
import { usePreviewStore } from '../previewStore'

// A minimal 1×1 frame; a fresh object every call, like the evaluator's pool.
const frame = () => [[{ r: 9, g: 8, b: 7 }]]

function publish(entries: Record<string, Record<string, unknown>>) {
  usePreviewStore.getState().setOutputs(new Map(Object.entries(entries)))
}

const published = (nodeId: string) => usePreviewStore.getState().outputs.get(nodeId)?.frame

describe('previewStore frame copies', () => {
  beforeEach(() => usePreviewStore.getState().clear())

  it('double-buffers frames through two persistent store-owned buffers', () => {
    publish({ a: { frame: frame() } })
    const c1 = published('a')
    publish({ a: { frame: frame() } })
    const c2 = published('a')
    publish({ a: { frame: frame() } })
    const c3 = published('a')
    expect(c2).not.toBe(c1)   // identity flips every publish (change detection)
    expect(c3).toBe(c1)       // …by alternating between the same two buffers
  })

  it('forgets the copy buffers of nodes that stop publishing', () => {
    publish({ a: { frame: frame() } })
    const before = published('a')
    // 'a' was deleted from the graph: the next publish no longer contains it,
    // so its two copy buffers must be released rather than retained forever.
    publish({ b: { value: 1 } })
    expect(published('a')).toBeUndefined()
    // Re-adding a node with the same id starts from fresh buffers.
    publish({ a: { frame: frame() } })
    expect(published('a')).not.toBe(before)
    publish({ a: { frame: frame() } })
    expect(published('a')).not.toBe(before)
  })

  it('publishes a live Stereo VU frame without replacing other node previews', () => {
    publish({ vu: { status: 'ready' }, matrix: { frame: frame() } })
    const matrixBefore = usePreviewStore.getState().outputs.get('matrix')
    const vu = { active: true, left: [{ r: 1, g: 2, b: 3 }], right: [] }

    usePreviewStore.getState().setStereoVu('vu', vu)

    expect(usePreviewStore.getState().outputs.get('vu')).toEqual({ status: 'ready', vu })
    expect(usePreviewStore.getState().outputs.get('matrix')).toBe(matrixBefore)
  })
})
