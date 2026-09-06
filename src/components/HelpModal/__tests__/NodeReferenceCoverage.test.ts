import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { OUTPUT_USE_CASES, PORT_DESCRIPTIONS, TYPE_GLYPH } from '../portCopy'
import { DISPLAY_REFERENCE } from '../displayReference'
import { partOptionsFor } from '../../../state/partOptions'
import { partById } from '../../../state/partCatalogue'
import { exampleGraphSrc, mainPreviewSrc, nodeCardSrc } from '../../../utils/nodeReferenceAssets'

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
  ['OUTPUT_USE_CASES', OUTPUT_USE_CASES],
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
  // The previous generation command failed before writing any files, leaving
  // newly registered displays with broken images while live-example tests passed.
  it.each(NODE_LIBRARY)('has a card, example graph and preview for $type', (node) => {
    for (const source of [nodeCardSrc, exampleGraphSrc, mainPreviewSrc]) {
      const path = resolve(`public${source(node.type)}`)
      const svg = readFileSync(path, 'utf8')
      expect(svg, path).toContain('<svg ')
      expect(svg, path).toContain('role="img"')
      expect(svg, path).not.toMatch(/(?:NaN|Infinity)/)
    }
  })

  it('gives every offered display its own setup instructions', () => {
    const displayTypes = NODE_LIBRARY.filter((node) => partOptionsFor(node.type)
      .some((option) => partById(option.id)?.display)).map((node) => node.type).sort()
    expect(Object.keys(DISPLAY_REFERENCE).sort()).toEqual(displayTypes)
    for (const type of displayTypes) {
      expect(DISPLAY_REFERENCE[type].steps.length).toBeGreaterThan(0)
      expect(DISPLAY_REFERENCE[type].propertyNote).not.toBe('')
    }
  })
})
