import { describe, it, expect, afterEach } from 'vitest'
import { buildShareUrl, readSharedWorkspace, clearShareHash } from '../shareGraph'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { PersistedWorkspace } from '../../state/workspacePersistence'

const workspace: PersistedWorkspace = {
  nodes: [{ id: 'n1', type: 'studioNode', position: { x: 0, y: 0 }, data: { nodeType: 'SolidColor', category: 'pattern', label: 'Solid', properties: {} } }] as unknown as StudioNode[],
  edges: [] as StudioEdge[],
  graphData: {},
  graphs: {},
  activeGraphId: 'root',
  buildProfile: {
    version: 1,
    physicalBoardProfileId: 'seeed-xiao-esp32s3',
  },
  displayDocuments: {
    panel: {
      schemaVersion: 1,
      displayId: 'panel',
      designSize: { width: 320, height: 240 },
      orientation: '0',
      gridSize: 8,
      theme: {
        background: { kind: 'image', assetId: 'background:01-neon-orbit:320x240' },
        surfaceColor: '#111111', textColor: '#ffffff', accentColor: '#00aaff',
        warningColor: '#ffaa00', successColor: '#00aa66', inactiveColor: '#777777', disabledColor: '#333333',
        font: 'sans', fontSize: 16, cornerRadius: 4, borderWidth: 1,
      },
      widgets: [{
        id: 'art', type: 'Image/Icon', label: 'Artwork',
        bounds: { x: 0, y: 0, width: 48, height: 48 },
        properties: { assetId: 'icon:power', tint: true },
      }],
    },
  },
}

afterEach(() => clearShareHash())

describe('shareGraph', () => {
  it('round-trips a workspace through the URL hash', () => {
    const url = buildShareUrl(workspace)
    const hash = new URL(url).hash
    window.location.hash = hash

    const decoded = readSharedWorkspace()
    expect(decoded).toEqual(workspace)
  })

  it('returns null when there is no share hash', () => {
    clearShareHash()
    expect(readSharedWorkspace()).toBeNull()
  })

  it('returns null for a corrupt share hash', () => {
    window.location.hash = 'share=not-valid-compressed-data'
    expect(readSharedWorkspace()).toBeNull()
  })
})
