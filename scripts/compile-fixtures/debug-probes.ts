/**
 * Generate the Debug node's diagnostic sketches, one per probe kind and board
 * family it can be sent to, so each is built before a user flashes it.
 *
 * Each probe is generated from the same profile the node uses, for a part on
 * the board the manifest names.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioNode } from '../../src/state/graphStore'
import { debugProfileFor } from '../../src/state/debug/debugProfiles'
import { debugContextFor } from '../../src/state/debug/debugProfile'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  if (!definition) throw new Error(`no node type ${nodeType}`)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

const BOARDS = {
  esp32: { fqbn: 'esp32:esp32:esp32', profileId: 'esp32-generic-devkit-38pin' },
  uno: { fqbn: 'arduino:avr:uno', profileId: 'arduino-uno-r3-dip' },
} as const

/** Probe fixtures: a name, the part as configured, and the boards to build it on. */
const PARTS: { name: string; nodeType: string; properties: Record<string, unknown>; boards: Record<keyof typeof BOARDS, Record<string, unknown>> }[] = [
  { name: 'pot', nodeType: 'PotInput', properties: {}, boards: { esp32: { pin: 34 }, uno: { pin: 14 } } },
]

const fixtures: Record<string, { fqbn: string; source: string }> = {}
for (const part of PARTS) {
  for (const [boardKey, pinProps] of Object.entries(part.boards) as [keyof typeof BOARDS, Record<string, unknown>][]) {
    const board = BOARDS[boardKey]
    const target = node('part', part.nodeType, { ...part.properties, ...pinProps })
    const ctx = debugContextFor(target, [node('board-root', 'Board', { profileId: board.profileId })])
    const probe = debugProfileFor(target)?.probe
    const source = probe?.sketch(ctx)
    if (!probe || !source) throw new Error(`${part.name}: no probe sketch`)
    if (!source.includes(`FLS_DBG v=1 probe=${probe.kind}`)) throw new Error(`${part.name}: sketch does not print its probe lines`)
    fixtures[`${part.name}-${boardKey}`] = { fqbn: board.fqbn, source }
  }
}

const outputDir = resolve(process.argv[2] ?? 'artifacts/debug-probes-compile')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { fqbn: string; bytes: number; sha256: string }> = {}
for (const [name, { fqbn, source }] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { fqbn, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} debug probe sketches to ${outputDir}`)
