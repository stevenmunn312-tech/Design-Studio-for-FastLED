import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROOT_GRAPH_ID, restoreWorkspaceSnapshot, useGraphStore, type StudioNode } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'
import { clearPatternContentTrustForTests, isContentKnown } from '../patterns/patternTrust'
import { createDisplayDocument } from '../displays/displayEditor'
import { captureWorkspace } from '../workspacePersistence'
import { loadSnapshots, pushSnapshot } from '../snapshotHistory'
import { registerMusicLibraryPersistence, type PersistedMusicEntry } from '../player/musicLibraryPersistence'

function node(id: string, nodeType = 'SolidColor', properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: definition?.category ?? 'pattern', properties,
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [] },
  } as StudioNode
}

describe('workspace history boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.getState().loadGraph([], [])
    clearPatternContentTrustForTests()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    registerMusicLibraryPersistence(() => [], () => undefined)
  })

  it('never pushes the previous project after loading and clearing history', () => {
    useGraphStore.getState().loadGraph([node('project-a')], [])
    useGraphStore.getState().updateNodeProperty('project-a', 'r', 99)
    useGraphStore.getState().loadGraph([node('project-b')], [])
    useGraphStore.temporal.getState().clear()
    vi.advanceTimersByTime(500)
    expect(useGraphStore.temporal.getState().pastStates).toEqual([])
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().nodes.some((entry) => entry.id === 'project-b')).toBe(true)
    expect(useGraphStore.getState().nodes.some((entry) => entry.id === 'project-a')).toBe(false)
    useGraphStore.getState().updateNodeProperty('project-b', 'r', 12)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().nodes.find((entry) => entry.id === 'project-b')?.data.properties.r).toBeUndefined()
  })

  it('flushes root edits before entering a group and keeps each history in its graph', async () => {
    useGraphStore.getState().loadGraph([node('root'), node('group', 'Group', { groupId: 'g' })], [], {
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' }, g: { id: 'g', name: 'Group' } },
      graphData: { g: { nodes: [node('inner', 'SolidColor', { r: 0 })], edges: [] } },
    })
    useGraphStore.getState().updateNodeProperty('root', 'r', 10)
    useGraphStore.getState().enterGraph('g')
    await Promise.resolve()
    vi.advanceTimersByTime(500)
    expect(useGraphStore.temporal.getState().pastStates).toEqual([])
    useGraphStore.getState().updateNodeProperty('inner', 'r', 20)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().nodes.map((entry) => entry.id)).toEqual(['inner'])
    expect(useGraphStore.getState().nodes[0].data.properties.r).toBe(0)
    useGraphStore.getState().enterGraph(ROOT_GRAPH_ID)
    await Promise.resolve()
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().nodes.find((entry) => entry.id === 'root')?.data.properties.r).toBeUndefined()
  })

  it('does not trust or remember foreign code restored by undo', () => {
    const foreign = node('foreign', 'Code', { code: 'return 123456789;' })
    useGraphStore.getState().loadGraph([foreign], [], { trusted: false })
    expect(useGraphStore.getState().trusted).toBe(false)
    useGraphStore.getState().deleteNode('foreign')
    expect(useGraphStore.getState().trusted).toBe(true)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().trusted).toBe(false)
    expect(isContentKnown([foreign])).toBe(false)
    useGraphStore.temporal.getState().redo()
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().trusted).toBe(false)
    expect(isContentKnown([foreign])).toBe(false)
    useGraphStore.getState().setTrusted(true)
    expect(isContentKnown([foreign])).toBe(true)
  })

  it('restores complete recovery content and reverses it with undo and redo', () => {
    let music: PersistedMusicEntry[] = [{ id: 'track-a', name: 'A' } as PersistedMusicEntry]
    registerMusicLibraryPersistence(() => music, (entries) => { music = entries })
    useGraphStore.getState().loadGraph([node('before')], [], { musicLibrary: music })
    const before = captureWorkspace(useGraphStore.getState())
    const display = createDisplayDocument('screen', 240, 320)
    const foreign = node('foreign', 'Code', { code: 'return 987654321;' })
    const recoveredMusic = [{ id: 'track-b', name: 'B' } as PersistedMusicEntry]
    const workspace = {
      nodes: [foreign, node('panel', 'TransportDisplay', { displayId: 'screen', tftLayout: 'Custom design' })],
      edges: [], trusted: false, displayDocuments: { screen: display }, musicLibrary: recoveredMusic,
    }
    restoreWorkspaceSnapshot(workspace)
    vi.advanceTimersByTime(500)
    expect(useGraphStore.getState().trusted).toBe(false)
    expect(useGraphStore.getState().displayDocuments.screen).toEqual(display)
    expect(music).toEqual(recoveredMusic)
    expect(useGraphStore.temporal.getState().pastStates).toHaveLength(1)
    useGraphStore.temporal.getState().undo()
    expect(captureWorkspace(useGraphStore.getState())).toEqual(before)
    useGraphStore.temporal.getState().redo()
    expect(useGraphStore.getState().trusted).toBe(false)
    expect(useGraphStore.getState().displayDocuments.screen).toEqual(display)
    expect(music).toEqual(recoveredMusic)
    expect(isContentKnown([foreign])).toBe(false)
  })

  it('includes music metadata in captured rolling snapshots', () => {
    const music = [{ id: 'track', name: 'Saved track' } as PersistedMusicEntry]
    registerMusicLibraryPersistence(() => music, () => undefined)
    pushSnapshot(captureWorkspace(useGraphStore.getState()))
    expect(loadSnapshots()[0].workspace.musicLibrary).toEqual(music)
  })
})
