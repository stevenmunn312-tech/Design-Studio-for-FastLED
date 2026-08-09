import { describe, it, expect } from 'vitest'
import { blankWorkspace, captureWorkspace, cloneWorkspace, type PersistedWorkspace } from '../workspacePersistence'
import { blankDeckConfig } from '../performanceDeck'

describe('captureWorkspace', () => {
  it('includes buildProfile when present on the source state', () => {
    const workspace = captureWorkspace({
      nodes: [],
      edges: [],
      graphData: {},
      graphs: {},
      activeGraphId: 'root',
      buildProfile: {
        version: 1,
        physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
        visibility: { 'output:o1': false },
      },
      trusted: true,
      performanceDeck: undefined,
    })
    expect(workspace.buildProfile).toEqual({
      version: 1,
      physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      visibility: { 'output:o1': false },
    })
  })

  it('includes performanceDeck when present on the source state', () => {
    const deck = { ...blankDeckConfig(), scenes: [{ id: 's1', name: 'A', values: {}, createdAt: 0, updatedAt: 0 }] }
    const workspace = captureWorkspace({
      nodes: [],
      edges: [],
      graphData: {},
      graphs: {},
      activeGraphId: 'root',
      buildProfile: undefined,
      trusted: true,
      performanceDeck: deck,
    })
    expect(workspace.performanceDeck).toEqual(deck)
  })

  it('omits performanceDeck when the source state has none (undefined passthrough)', () => {
    const workspace = captureWorkspace({
      nodes: [], edges: [], graphData: {}, graphs: {}, activeGraphId: 'root', buildProfile: undefined, trusted: true, performanceDeck: undefined,
    })
    expect(workspace.performanceDeck).toBeUndefined()
  })
})

describe('PersistedWorkspace round-tripping', () => {
  it('an old-shaped workspace literal (no performanceDeck key) still type-checks and clones unchanged', () => {
    const legacy: PersistedWorkspace = { nodes: [], edges: [], trusted: true }
    const cloned = cloneWorkspace(legacy)
    expect(cloned).toEqual(legacy)
    expect(cloned.buildProfile).toBeUndefined()
    expect(cloned.performanceDeck).toBeUndefined()
  })

  it('blankWorkspace has no performanceDeck field', () => {
    expect(blankWorkspace().performanceDeck).toBeUndefined()
  })

  it('a workspace with performanceDeck round-trips through cloneWorkspace unchanged', () => {
    const workspace: PersistedWorkspace = {
      nodes: [], edges: [],
      buildProfile: {
        version: 1,
        physicalBoardProfileId: 'seeed-xiao-esp32s3',
        outputs: { out1: { ledProfileId: 'ws2812-class-5v' } },
      },
      performanceDeck: {
        pins: [{ id: 'p1', nodeId: 'n1', propertyKey: 'speed', label: 'Speed', kind: 'fader', createdAt: 0 }],
        scenes: [],
        midiBindings: [],
        keyBindings: [],
      },
    }
    expect(cloneWorkspace(workspace)).toEqual(workspace)
  })
})
