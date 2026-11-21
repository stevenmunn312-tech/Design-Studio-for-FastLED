// The v1 save-format baseline (frozen 2026-11-21; versioning-and-releases.md).
//
// A saved project names node types, port ids (on edges and exposed inputs)
// and property keys. Removing or renaming any of them after v1.0.0 makes a v1
// save lose that node, wire or value, so this test holds every name the v1
// format uses. Adding is free: a new type, port or property is not checked.
//
// A deliberate removal or rename needs a migration from format 1, a raised
// SAVE_FORMAT_VERSION (saveFormat.ts) and a release note. Then regenerate the
// baseline for the new format:
//   UPDATE_SAVE_BASELINE=1 npx vitest run src/state/__tests__/saveFormatBaseline.test.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY } from '../nodeLibrary'
import { SAVE_FORMAT_VERSION } from '../saveFormat'
import { DISPLAY_DOCUMENT_SCHEMA_VERSION } from '../displays/displayDocument'

interface NodeShape {
  inputs: string[]
  outputs: string[]
  properties: string[]
}

interface Baseline {
  formatVersion: number
  displayDocumentSchemaVersion: number
  nodes: Record<string, NodeShape>
}

// Vitest runs from the repository root; the jsdom environment has no file URL.
const BASELINE_PATH = resolve('src/state/__tests__/saveFormatBaseline.json')

function currentShapes(): Record<string, NodeShape> {
  const sorted = (ids: Iterable<string>) => [...new Set(ids)].sort()
  return Object.fromEntries([...NODE_LIBRARY]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((def) => [def.type, {
      inputs: sorted([...def.inputs, ...(def.variantInputs ?? [])].map((port) => port.id)),
      outputs: sorted(def.outputs.map((port) => port.id)),
      properties: sorted(Object.keys(def.defaultProperties ?? {})),
    }]))
}

if (process.env.UPDATE_SAVE_BASELINE === '1') {
  const baseline: Baseline = {
    formatVersion: SAVE_FORMAT_VERSION,
    displayDocumentSchemaVersion: DISPLAY_DOCUMENT_SCHEMA_VERSION,
    nodes: currentShapes(),
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`)
}

describe('v1 save-format baseline', () => {
  const baseline = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
    : null

  it('exists for the current format', () => {
    expect(baseline, 'saveFormatBaseline.json is missing').not.toBeNull()
    expect(baseline!.formatVersion).toBe(SAVE_FORMAT_VERSION)
  })

  it('keeps the display document schema the format was frozen with', () => {
    // A display document with another schemaVersion is dropped on load, so a
    // schema change must also raise SAVE_FORMAT_VERSION with a migration.
    expect(DISPLAY_DOCUMENT_SCHEMA_VERSION).toBe(baseline!.displayDocumentSchemaVersion)
  })

  it('still knows every node type, port and property a saved file can name', () => {
    const current = currentShapes()
    const missing: string[] = []
    for (const [type, shape] of Object.entries(baseline!.nodes)) {
      const now = current[type]
      if (!now) { missing.push(`node type ${type}`); continue }
      for (const id of shape.inputs) if (!now.inputs.includes(id)) missing.push(`${type} input ${id}`)
      for (const id of shape.outputs) if (!now.outputs.includes(id)) missing.push(`${type} output ${id}`)
      for (const key of shape.properties) if (!now.properties.includes(key)) missing.push(`${type} property ${key}`)
    }
    expect(missing, 'Removed or renamed after the v1 format freeze; v1 saves name these. Add a migration and raise SAVE_FORMAT_VERSION (see this file\'s header).').toEqual([])
  })
})
