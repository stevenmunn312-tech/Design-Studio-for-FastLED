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
