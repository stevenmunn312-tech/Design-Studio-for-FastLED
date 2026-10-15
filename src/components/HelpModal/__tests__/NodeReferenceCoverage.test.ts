import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { PORT_DESCRIPTIONS, TYPE_GLYPH } from '../portCopy'
import { NODE_REFERENCE } from '../reference'
import { exampleGraphSrc, mainPreviewSrc, nodeCardSrc } from '../../../utils/nodeReferenceAssets'
import { DISPLAY_NODE_TYPES } from '../../../utils/validateGraph'

/**
 * The Node Reference is generated from NODE_LIBRARY, so it can never list a
 * node that no longer exists — but the copy it keys by *port dataType* is
 * hand-written, and that does drift. `SDCard` and `PerformanceGenerator` both
 * became portless, which killed the `sdcard` and `shows` types outright while
 * the reference kept describing how to wire them; meanwhile `dmx` and `image`
 * arrived with no entry at all and fell back to generic text.
 *
 * Both directions are failures, so both are asserted here.
 */
const LIVE_PORT_TYPES = (() => {
  const types = new Set<string>()
  for (const node of NODE_LIBRARY) {
    for (const port of node.inputs) types.add(port.dataType)
    for (const port of node.outputs) types.add(port.dataType)
  }
  return types
})()

const MAPS: Array<[string, Record<string, string>]> = [
  ['TYPE_GLYPH', TYPE_GLYPH],
  ['PORT_DESCRIPTIONS', PORT_DESCRIPTIONS],
]

describe('Node Reference port-type coverage', () => {
  it('found the port types to check against', () => {
    // Guards the two assertions below from passing vacuously if the library
    // shape ever changes under them.
    expect(LIVE_PORT_TYPES.size).toBeGreaterThan(8)
    expect(LIVE_PORT_TYPES.has('frame')).toBe(true)
  })

  it('has at least one port carrying every dataType it writes about', () => {
    for (const [name, map] of MAPS) {
      const dead = Object.keys(map).filter((type) => !LIVE_PORT_TYPES.has(type))
      expect(dead, `${name} describes dataTypes no node port carries`).toEqual([])
    }
  })

  it('writes about every dataType a port actually carries', () => {
    for (const [name, map] of MAPS) {
      const missing = [...LIVE_PORT_TYPES].filter((type) => !(type in map)).sort()
      expect(missing, `${name} is missing live dataTypes`).toEqual([])
    }
  })

  it('covers the same set of dataTypes in every map', () => {
    const [, first] = MAPS[0]
    for (const [name, map] of MAPS.slice(1)) {
      expect(Object.keys(map).sort(), `${name} disagrees with TYPE_GLYPH`)
        .toEqual(Object.keys(first).sort())
    }
  })
})

describe('Node Reference generated assets', () => {
  it('shows the Music Player default sockets and expanded timing controls', () => {
    const svg = readFileSync(resolve(`public${nodeCardSrc('PatternMaster')}`), 'utf8')
    expect(svg).toContain('Expose input…')
    // The player is 280 px wide so this label fits the shared label column.
    expect(svg).toContain('Beat Transitions')
    expect(svg).toContain('min hold (s)')
    expect(svg).toContain('max hold (s)')
    expect(svg).toContain('▾ TIMING')
    expect(svg).not.toContain('Play / Pause')
    expect(svg).not.toContain('Previous Pattern')
  })
  // The previous generation command failed before writing any files, leaving
  // newly registered displays with broken images while live-example tests passed.
  it.each(NODE_LIBRARY)('has a card, example graph and preview for $type', (node) => {
    for (const source of [nodeCardSrc, exampleGraphSrc, mainPreviewSrc]) {
      const path = resolve(`public${source(node.type)}`)
      const svg = readFileSync(path, 'utf8')
      expect(svg, path).toContain('<svg ')
      expect(svg, path).toContain('role="img"')
      // Embedded part thumbnails are base64, which can spell anything.
      expect(svg.replace(/data:[^"]+/g, ''), path).not.toMatch(/(?:NaN|Infinity)/)
    }
  })

  it('gives every offered display its own setup instructions', () => {
    // `Display` (the screen-design document) is not a library node, so it has
    // no article; every display that is gets numbered set-up steps.
    const libraryDisplays = [...DISPLAY_NODE_TYPES].filter((type) => NODE_LIBRARY.some((node) => node.type === type))
    expect(libraryDisplays.length).toBeGreaterThan(0)
    for (const type of libraryDisplays) {
      expect(NODE_REFERENCE[type].steps?.length, type).toBeGreaterThan(0)
    }
  })
})

/*
 * Every node gets a page written for it. Copy that fell back to category
 * boilerplate read the same on every page and drifted from what each node
 * does, so the reference now has no fallback: a missing entry is a failure.
 */
describe('Node Reference entries', () => {
  it('covers exactly the library', () => {
    expect(Object.keys(NODE_REFERENCE).sort()).toEqual(NODE_LIBRARY.map((node) => node.type).sort())
  })

  it.each(NODE_LIBRARY)('writes an overview for $type that is more than its one-line description', (node) => {
    const entry = NODE_REFERENCE[node.type]
    expect(entry.overview.length, node.type).toBeGreaterThan(0)
    expect(entry.overview.join(' ').length, node.type).toBeGreaterThan(120)
  })

  it('describes only ports the node has', () => {
    for (const node of NODE_LIBRARY) {
      const entry = NODE_REFERENCE[node.type]
      const inputs = new Set(node.inputs.map((port) => port.id))
      const outputs = new Set(node.outputs.map((port) => port.id))
      for (const id of Object.keys(entry.inputs ?? {})) expect(inputs.has(id), `${node.type} input ${id}`).toBe(true)
      for (const id of Object.keys(entry.outputs ?? {})) expect(outputs.has(id), `${node.type} output ${id}`).toBe(true)
    }
  })

  it('gives every workflow example an outcome instead of a picture', () => {
    for (const node of NODE_LIBRARY) {
      const entry = NODE_REFERENCE[node.type]
      if (entry.example.previewMode === 'workflow') expect(entry.outcome, node.type).toBeTruthy()
    }
  })
})
