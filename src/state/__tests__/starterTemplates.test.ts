import { describe, it, expect } from 'vitest'
import { STARTER_TEMPLATES } from '../starterTemplates'
import { NODE_LIBRARY, portsCompatible } from '../nodeLibrary'
import { validateGraph } from '../../utils/validateGraph'
import type { StudioNodeData } from '../graphStore'

const LIBRARY_DEF = new Map(NODE_LIBRARY.map((d) => [d.type, d]))

describe('starterTemplates', () => {
  it('has unique ids', () => {
    const ids = STARTER_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const template of STARTER_TEMPLATES) {
    it(`"${template.name}" builds a well-formed, type-compatible graph`, () => {
      const { nodes, edges } = template.build()
      expect(nodes.length).toBeGreaterThan(0)

      const nodeIds = new Set(nodes.map((n) => n.id))
      expect(nodeIds.size).toBe(nodes.length)

      for (const node of nodes) {
        const data = node.data as StudioNodeData
        expect(LIBRARY_DEF.has(data.nodeType)).toBe(true)
      }

      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source)
        const tgt = nodes.find((n) => n.id === edge.target)
        expect(src, `source node ${edge.source} exists`).toBeTruthy()
        expect(tgt, `target node ${edge.target} exists`).toBeTruthy()
        const srcDef = LIBRARY_DEF.get((src!.data as StudioNodeData).nodeType)!
        const tgtDef = LIBRARY_DEF.get((tgt!.data as StudioNodeData).nodeType)!
        const outPort = srcDef.outputs.find((p) => p.id === edge.sourceHandle)
        const inPort = tgtDef.inputs.find((p) => p.id === edge.targetHandle)
        expect(outPort, `${srcDef.type} has output "${edge.sourceHandle}"`).toBeTruthy()
        expect(inPort, `${tgtDef.type} has input "${edge.targetHandle}"`).toBeTruthy()
        expect(portsCompatible(outPort!.dataType, inPort!.dataType)).toBe(true)
      }

      // Loading a template shouldn't trip graph validation's hard errors
      // (missing MatrixOutput, unconnected Frame input, etc). Warnings are
      // fine — e.g. the show pipeline's Pattern Collection starts empty.
      const { errors } = validateGraph(nodes, edges)
      expect(errors).toEqual([])
    })
  }
})
