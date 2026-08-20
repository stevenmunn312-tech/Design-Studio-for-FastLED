import { describe, it, expect } from 'vitest'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { OUTPUT_USE_CASES, PORT_DESCRIPTIONS, TYPE_GLYPH } from '../portCopy'

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
