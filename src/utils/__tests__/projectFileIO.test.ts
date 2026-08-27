import { describe, it, expect } from 'vitest'
import { parseProjectFile } from '../projectFileIO'

// todo.md's P0 trust-boundary item: a project file must never be able to
// self-declare its way past the trust gate by setting `trusted: true` in its
// own JSON — parseProjectFile forces `trusted: false` unconditionally on
// every project file it parses, regardless of what the file claims.
describe('parseProjectFile — trust boundary', () => {
  it('forces trusted:false on a bare-workspace file, even if the file claims trusted:true', () => {
    const text = JSON.stringify({ nodes: [], edges: [], trusted: true })
    const project = parseProjectFile(text, 'fallback')
    expect(project.workspace.trusted).toBe(false)
  })

  it('forces trusted:false on a full SavedProject file, even if the file claims trusted:true', () => {
    const text = JSON.stringify({
      id: 'proj-1',
      name: 'Someone else’s project',
      createdAt: 0,
      updatedAt: 0,
      workspace: { nodes: [], edges: [], trusted: true },
    })
    const project = parseProjectFile(text, 'fallback')
    expect(project.workspace.trusted).toBe(false)
  })

  it('a bare-workspace file with no trusted field at all also comes back untrusted', () => {
    const text = JSON.stringify({ nodes: [], edges: [] })
    const project = parseProjectFile(text, 'fallback')
    expect(project.workspace.trusted).toBe(false)
  })
})

describe('parseProjectFile — display document boundary', () => {
  it('normalizes imported display documents and drops invalid entries', () => {
    const text = JSON.stringify({
      nodes: [], edges: [],
      displayDocuments: {
        arbitraryKey: {
          schemaVersion: 1,
          displayId: 'panel',
          designSize: { width: 320, height: 240 },
          orientation: 'sideways',
          gridSize: 8,
          theme: { background: { kind: 'image', assetId: '../../secret.png' } },
          widgets: [
            { id: 'ok', type: 'Button', label: 'Go', bounds: { x: 0, y: 0, width: 80, height: 48 }, properties: { pressed: false } },
            { id: 'bad', type: 'Executable', label: 'No', bounds: { x: 0, y: 0, width: 80, height: 48 }, properties: { code: 'run()' } },
          ],
        },
        invalid: { schemaVersion: 99, displayId: 'old' },
      },
    })
    const documents = parseProjectFile(text, 'fallback').workspace.displayDocuments
    expect(Object.keys(documents ?? {})).toEqual(['panel'])
    expect(documents?.panel.orientation).toBe('0')
    expect(documents?.panel.theme.background).toEqual({ kind: 'solid', color: '#080b12' })
    expect(documents?.panel.widgets.map((widget) => widget.id)).toEqual(['ok'])
  })

  it('loads a missing registry as empty when the graph store consumes it', () => {
    const project = parseProjectFile(JSON.stringify({ nodes: [], edges: [] }), 'fallback')
    expect(project.workspace.displayDocuments).toEqual({})
  })
})
