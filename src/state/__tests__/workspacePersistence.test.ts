import { beforeEach, describe, it, expect } from 'vitest'
import { blankWorkspace, captureWorkspace, cloneWorkspace, type PersistedWorkspace } from '../workspacePersistence'
import { blankDeckConfig } from '../performanceDeck'
import { useMusicStore } from '../musicStore'

function clearMusic() {
  useMusicStore.setState({ entries: [] })
}

describe('captureWorkspace', () => {
  beforeEach(clearMusic)

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
        exportMode: 'current-view',
        visibility: { 'output:o1': false },
      },
      trusted: true,
      performanceDeck: undefined,
      displayDocuments: {},
    })
    expect(workspace.buildProfile).toEqual({
      version: 1,
      physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      exportMode: 'current-view',
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
      displayDocuments: {},
    })
    expect(workspace.performanceDeck).toEqual(deck)
  })

  it('omits performanceDeck when the source state has none (undefined passthrough)', () => {
    const workspace = captureWorkspace({
      nodes: [], edges: [], graphData: {}, graphs: {}, activeGraphId: 'root', buildProfile: undefined, trusted: true, performanceDeck: undefined,
      displayDocuments: {},
    })
    expect(workspace.performanceDeck).toBeUndefined()
  })

  it('captures a JSON-safe Music Library manifest without embedding File objects', () => {
    useMusicStore.setState({
      entries: [{
        id: 'song-1',
        file: new File(['audio'], 'track.mp3', { type: 'audio/mpeg', lastModified: 123 }),
        analysis: null,
        show: null,
        status: 'pending',
      }],
    })
    const workspace = captureWorkspace({
      nodes: [], edges: [], graphData: {}, graphs: {}, activeGraphId: 'root', buildProfile: undefined, trusted: true, performanceDeck: undefined,
      displayDocuments: {},
    })

    expect(workspace.musicLibrary).toEqual([expect.objectContaining({
      id: 'song-1', name: 'track.mp3', type: 'audio/mpeg', size: 5, lastModified: 123, status: 'pending',
    })])
    expect(JSON.parse(JSON.stringify(workspace)).musicLibrary[0].file).toBeUndefined()
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

  it('captures and clones the optional custom-display registry', () => {
    const displayDocuments = {
      panel: {
        schemaVersion: 1 as const,
        displayId: 'panel',
        designSize: { width: 320, height: 240 },
        orientation: '0' as const,
        gridSize: 8,
        theme: {
          background: { kind: 'solid' as const, color: '#000000' },
          surfaceColor: '#111111', textColor: '#ffffff', accentColor: '#00aaff',
          warningColor: '#ffaa00', successColor: '#00aa66', inactiveColor: '#777777', disabledColor: '#333333',
          font: 'sans' as const, fontSize: 16, cornerRadius: 4, borderWidth: 1,
        },
        widgets: [],
      },
    }
    const workspace = captureWorkspace({
      nodes: [], edges: [], graphData: {}, graphs: {}, activeGraphId: 'root',
      buildProfile: undefined, trusted: true, performanceDeck: undefined, displayDocuments,
    })
    expect(workspace.displayDocuments).toEqual(displayDocuments)
    expect(workspace.displayDocuments).not.toBe(displayDocuments)
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
