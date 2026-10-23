import { describe, expect, it } from 'vitest'
import { boardLinkUploadNotes } from '../boardLinkFlash'
import { boardLinkSchema } from '../../../build/boardPartition'
import { normalizeProjectUploadTargets, normalizeUploadTarget, type ProjectUploadTargets } from '../../uploadTargets'
import type { StudioEdge, StudioNode } from '../../graphStore'

/*
 * The Upload tab's note that a linked board runs an older link: every linked
 * sketch drops frames carrying another schema hash, so a change to the link
 * means flashing every linked board. See docs/design/board-links.md, "Upload".
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`, source, target, sourceHandle, targetHandle } as StudioEdge
}

const nodes = [
  node('board-root', 'Board'),
  node('board-2', 'Board'),
  node('board-3', 'Board'),
  node('p1', 'SolidColor'),
  node('fade', 'BrightnessMod'),
  node('out1', 'MatrixOutput'),
  node('out3', 'MatrixOutput', { boardId: 'board-3' }),
  node('pot', 'PotInput', { boardId: 'board-2' }),
  node('knob', 'PotInput', { boardId: 'board-2' }),
]
const base = [edge('p1', 'frame', 'fade', 'frame'), edge('fade', 'frame', 'out1', 'frame'), edge('p1', 'frame', 'out3', 'frame')]
const linkedEdges = [...base, edge('pot', 'value', 'fade', 'brightness')]
const changedEdges = [...linkedEdges, edge('knob', 'value', 'fade', 'speed')]

const flashed = (hashes: Record<string, number | undefined>): ProjectUploadTargets => Object.fromEntries(
  Object.entries(hashes).map(([key, linkSchemaHash]) => [key, {
    selectedFqbn: 'esp32:esp32:esp32', selectedPort: 'COM3',
    ...(linkSchemaHash === undefined ? {} : { linkSchemaHash }),
  }]))

describe('boardLinkUploadNotes', () => {
  const before = boardLinkSchema(nodes, linkedEdges).hash
  const after = boardLinkSchema(nodes, changedEdges).hash

  it('names every other linked board flashed with an older link', () => {
    expect(before).not.toBe(after)
    const targets = flashed({ 'board-root': before, 'board-2': before })
    expect(boardLinkUploadNotes(nodes, linkedEdges, targets, 'board-root')).toEqual([])
    expect(boardLinkUploadNotes(nodes, changedEdges, targets, 'board-root'))
      .toEqual(['The link changed since Board 2 was uploaded. Upload Board 2 as well.'])
    // From Board 2's tab it is Board 1 that is behind; the board on screen is
    // the one about to be uploaded, so it is never its own note.
    expect(boardLinkUploadNotes(nodes, changedEdges, targets, 'board-2'))
      .toEqual(['The link changed since Board 1 was uploaded. Upload Board 1 as well.'])
    // Once flashed with the new link, it says nothing.
    expect(boardLinkUploadNotes(nodes, changedEdges, flashed({ 'board-root': before, 'board-2': after }), 'board-root')).toEqual([])
  })

  it('keeps quiet about a board with no recorded flash, and an unlinked board flashed without a link', () => {
    // Board 2 has never been uploaded from this project; Board 3 runs no link,
    // and still takes no part in one.
    const targets = flashed({ 'board-root': before, 'board-2': undefined, 'board-3': 0 })
    expect(boardLinkUploadNotes(nodes, changedEdges, targets, 'board-root')).toEqual([])
    expect(boardLinkUploadNotes(nodes, changedEdges, undefined, 'board-root')).toEqual([])
  })

  it('calls a board behind once it joins a link it was flashed without, or keeps one that is gone', () => {
    expect(boardLinkUploadNotes(nodes, linkedEdges, flashed({ 'board-2': 0 }), 'board-root'))
      .toEqual(['The link changed since Board 2 was uploaded. Upload Board 2 as well.'])
    expect(boardLinkUploadNotes(nodes, base, flashed({ 'board-2': before }), 'board-root'))
      .toEqual(['The link changed since Board 2 was uploaded. Upload Board 2 as well.'])
  })

  it('reads the primary under the conventional key whatever its id', () => {
    const renamed = nodes.map((entry) => (entry.id === 'board-root' ? { ...entry, id: 'b1' } : entry))
    expect(boardLinkUploadNotes(renamed, changedEdges, flashed({ 'board-root': before }), 'board-2'))
      .toEqual(['The link changed since Board 1 was uploaded. Upload Board 1 as well.'])
  })

  it('keeps a recorded hash through a save and refuses one no schema makes', () => {
    expect(normalizeUploadTarget({ selectedFqbn: 'a', selectedPort: 'b', linkSchemaHash: 3735928559 }))
      .toEqual({ selectedFqbn: 'a', selectedPort: 'b', linkSchemaHash: 3735928559 })
    expect(normalizeUploadTarget({ selectedFqbn: 'a', selectedPort: 'b', linkSchemaHash: -1 }))
      .toEqual({ selectedFqbn: 'a', selectedPort: 'b' })
    expect(normalizeUploadTarget({ selectedFqbn: 'a', selectedPort: 'b', linkSchemaHash: '12' }))
      .toEqual({ selectedFqbn: 'a', selectedPort: 'b' })
    expect(normalizeProjectUploadTargets({ uploadTargets: { 'board-2': { selectedFqbn: 'a', selectedPort: 'b', linkSchemaHash: 7 } } })
      .uploadTargets).toEqual({ 'board-2': { selectedFqbn: 'a', selectedPort: 'b', linkSchemaHash: 7 } })
  })
})
