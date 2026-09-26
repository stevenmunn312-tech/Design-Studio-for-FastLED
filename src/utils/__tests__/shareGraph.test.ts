import { describe, it, expect, afterEach } from 'vitest'
import { buildShareUrl, readSharedWorkspace, clearShareHash, SHARE_URL_WARN_BYTES, shareUrlSizeWarning } from '../shareGraph'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import type { PersistedWorkspace } from '../../state/workspacePersistence'

const workspace: PersistedWorkspace = {
  nodes: [{ id: 'n1', type: 'studioNode', position: { x: 0, y: 0 }, data: { nodeType: 'SolidColor', category: 'pattern', label: 'Solid', properties: {} } }] as unknown as StudioNode[],
  edges: [] as StudioEdge[],
  graphData: {},
  graphs: {},
  activeGraphId: 'root',
  buildProfile: { version: 1 },
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

  it('warns above about 30 KB and names Save Project File', () => {
    const atLimit = `http://localhost/#share=${'a'.repeat(SHARE_URL_WARN_BYTES)}`.slice(0, SHARE_URL_WARN_BYTES)
    expect(atLimit).toHaveLength(SHARE_URL_WARN_BYTES)
    expect(shareUrlSizeWarning(atLimit)).toBeNull()

    const over = `${atLimit}a`
    expect(shareUrlSizeWarning(over)).toBe(
      'This share link is 31 KB. Links past about 30 KB get cut off by browsers and chat apps. Use Save Project File for a project this size.',
    )
  })

  it('still emits a share URL when the workspace compresses past the warning line', () => {
    const noise = Array.from({ length: 2700 }, (_, i) => (i * 7919).toString(36) + (i * 104729).toString(16)).join('')
    const bulky = {
      ...workspace,
      nodes: [{
        ...workspace.nodes[0],
        data: { ...workspace.nodes[0].data, properties: { noise } },
      }],
    }
    const url = buildShareUrl(bulky)
    expect(url.length).toBeGreaterThan(SHARE_URL_WARN_BYTES)
    expect(url).toContain('#share=')
    expect(shareUrlSizeWarning(url)).toContain('Save Project File')
    window.location.hash = new URL(url).hash
    expect(readSharedWorkspace()).toEqual(bulky)
  })
})
