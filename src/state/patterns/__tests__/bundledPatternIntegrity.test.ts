import { describe, expect, it } from 'vitest'
import { BUNDLED_PATTERNS } from '../bundledPatterns'
import { NODE_LIBRARY } from '../../nodeLibrary'

/*
 * A bundled graph is converted by hand when a node changes, and nothing
 * stopped one being missed: the seed helpers take any setting, and a JSON
 * seed keeps the port list it was saved with. Two misses each ran for
 * months. Gradient Frame's `vertical` became `angle`, and two backdrops ran
 * sideways. Five pattern nodes traded their Color input for a palette, and
 * six audio patterns kept wiring a colour from the music into a port that
 * was gone, so they drew on a default palette instead.
 *
 * Both checks ask the library, not the ports saved in the graph.
 */
describe('bundled pattern graphs against the node library', () => {
  const definitions = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))
  // Custom Palette keeps its stops in two lists the library does not default.
  const unlisted = new Set(['colors', 'positions'])

  it('wire only ports their nodes still have', () => {
    const dead: string[] = []
    for (const pattern of BUNDLED_PATTERNS) {
      const byId = new Map(pattern.subgraph.nodes.map((node) => [node.id, node]))
      for (const edge of pattern.subgraph.edges) {
        const source = definitions.get(String(byId.get(edge.source)?.data.nodeType))
        const target = definitions.get(String(byId.get(edge.target)?.data.nodeType))
        if (source && !source.outputs.some((port) => port.id === edge.sourceHandle)) {
          dead.push(`${pattern.name}: ${source.type} has no output ${edge.sourceHandle}`)
        }
        if (target && !target.inputs.some((port) => port.id === edge.targetHandle)) {
          dead.push(`${pattern.name}: ${target.type} has no input ${edge.targetHandle}`)
        }
      }
    }
    expect(dead).toEqual([])
  })

  it('carry only settings their nodes still have', () => {
    const stray: string[] = []
    for (const pattern of BUNDLED_PATTERNS) {
      for (const node of pattern.subgraph.nodes) {
        const definition = definitions.get(String(node.data.nodeType))
        if (!definition) continue
        const known = new Set(Object.keys(definition.defaultProperties ?? {}))
        for (const key of Object.keys(node.data.properties ?? {})) {
          if (!known.has(key) && !unlisted.has(key)) stray.push(`${pattern.name}: ${definition.type} has no setting ${key}`)
        }
      }
    }
    expect(stray).toEqual([])
  })
})
