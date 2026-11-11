/**
 * Generate the multi-board clock-sync (D-03) compile fixtures: the leader and
 * the follower of a two-board project, first running one pattern and then the
 * same collection show. See docs/design/multi-board.md, "Keeping boards in
 * time".
 *
 * Each pair is one root graph cut by `boardPartition`, exactly as the Upload
 * tab cuts it, so a sketch here is the one that board would be flashed with.
 * Both boards join the bench Wi-Fi with their own Board's credentials.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import { boardPartition, findCrossBoardIssues } from '../../src/build/boardPartition'
import { findPinConflicts } from '../../src/utils/validateGraph'
import { findDeployBlockingErrorsForBoard } from '../../src/utils/multiBoardValidation'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { useNetworkCredentialsStore } from '../../src/state/peripherals/networkCredentials'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const BOARDS = ['board-root', 'board-2'] as const
const FQBN = 'esp32:esp32:esp32'
for (const id of BOARDS) {
  useNetworkCredentialsStore.getState().setCredentials(id, { ssid: 'bench-network', password: 'fixture-only' })
}

const on2 = { boardId: 'board-2' }
const boards = () => [
  node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin', clockSync: 'leader' }),
  node('board-2', 'Board', { profileId: 'esp32-generic-devkit-38pin', clockSync: 'follower' }),
]

// Two patterns that read the animation clock, so the collection has an order
// to keep and a step to adopt.
const groups = {
  'pattern-a': {
    nodes: [node('plasma', 'Plasma'), node('end', 'GroupOutput')],
    edges: [edge('plasma', 'frame', 'end', 'frame')],
  },
  'pattern-b': {
    nodes: [node('noise', 'Noise'), node('end', 'GroupOutput')],
    edges: [edge('noise', 'frame', 'end', 'frame')],
  },
}

/** The same pattern on each board: only the animation clock is shared. */
const pattern = {
  nodes: [
    ...boards(),
    node('plasma-1', 'Plasma'), node('out-1', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    node('plasma-2', 'Plasma', on2), node('out-2', 'MatrixOutput', { ...on2, width: 8, height: 8, dataPin: 27 }),
  ],
  edges: [edge('plasma-1', 'frame', 'out-1', 'frame'), edge('plasma-2', 'frame', 'out-2', 'frame')],
}

/** The same collection, in the same order, on each board: the follower adopts the leader's picks. */
const show = {
  nodes: [
    ...boards(),
    node('collection-1', 'PatternCollection', { patternIds: ['pattern-a', 'pattern-b'] }),
    node('show-1', 'PatternSlideshow'),
    node('out-1', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    node('collection-2', 'PatternCollection', { ...on2, patternIds: ['pattern-a', 'pattern-b'] }),
    node('show-2', 'PatternSlideshow', on2),
    node('out-2', 'MatrixOutput', { ...on2, width: 8, height: 8, dataPin: 27 }),
  ],
  edges: [
    edge('collection-1', 'patternset', 'show-1', 'patternset'), edge('show-1', 'frame', 'out-1', 'frame'),
    edge('collection-2', 'patternset', 'show-2', 'patternset'), edge('show-2', 'frame', 'out-2', 'frame'),
  ],
}

const graphs = { pattern, show }
for (const [name, graph] of Object.entries(graphs)) {
  const crossing = findCrossBoardIssues(graph.nodes, graph.edges)
  if (crossing.length > 0) throw new Error(`${name}: a wire cannot cross boards: ${JSON.stringify(crossing)}`)
  for (const boardId of BOARDS) {
    const part = boardPartition(graph.nodes, graph.edges, boardId)
    // Each board must keep its own output, or the sketch proves nothing.
    const outputs = part.nodes.filter((entry) => entry.data.nodeType === 'MatrixOutput').map((entry) => entry.id)
    const expected = boardId === 'board-root' ? 'out-1' : 'out-2'
    if (outputs.join() !== expected) throw new Error(`${name} ${boardId}: expected ${expected}, found ${outputs.join() || 'no output'}`)
    const conflicts = findPinConflicts(part.nodes)
    if (conflicts.length > 0) throw new Error(`${name} ${boardId} has pin conflicts: ${conflicts.join('; ')}`)
    const errors = findDeployBlockingErrorsForBoard(graph.nodes, graph.edges, boardId, FQBN, undefined, groups)
    if (errors.length > 0) throw new Error(`${name} ${boardId}: the deploy gate refuses it: ${errors.join('; ')}`)
  }
}

const normal = (boardId: string) => {
  const part = boardPartition(pattern.nodes, pattern.edges, boardId)
  return generateCpp(part.nodes, part.edges, groups)
}
const slideshow = (boardId: string) => {
  const part = boardPartition(show.nodes, show.edges, boardId)
  return generateShowSketch(part.nodes, part.edges, groups)
}

const sketches: Record<string, string> = {
  'pattern-leader': normal('board-root'),
  'pattern-follower': normal('board-2'),
  'show-leader': slideshow('board-root'),
  'show-follower': slideshow('board-2'),
}

for (const [name, source] of Object.entries(sketches)) {
  // Every sketch reads the shared clock over the one network connection.
  const missing = ['uint32_t _syncNowMs()', 'void _netEnsureConnected()', '#include <WiFi.h>']
    .filter((symbol) => !source.includes(symbol))
  if (missing.length) throw new Error(`${name}.ino has no clock sync (missing ${missing.join(', ')})`)
  const follows = source.includes('_syncOffsetMs')
  if (follows !== name.endsWith('follower')) throw new Error(`${name}.ino has the wrong sync role`)
}
// Only a follower running a show holds its own picks while it hears the leader.
for (const [name, source] of Object.entries(sketches)) {
  if (source.includes('bool _syncLocked()') !== (name === 'show-follower')) {
    throw new Error(`${name}.ino: the show lock is in the wrong sketch`)
  }
}

const outDir = resolve(process.argv[2] ?? 'artifacts/clock-sync-compile')
mkdirSync(outDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(sketches)) {
  writeFileSync(resolve(outDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(sketches).length} clock-sync compile fixtures to ${outDir}`)
