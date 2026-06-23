import { describe, it, expect } from 'vitest'
import { NODE_LIBRARY, NODE_DESCRIPTIONS } from '../nodeLibrary'

describe('nodeLibrary', () => {
  it('every node in the shelf has a tooltip description', () => {
    const missing = NODE_LIBRARY.filter((n) => !NODE_DESCRIPTIONS[n.type]).map((n) => n.type)
    expect(missing).toEqual([])
  })

  it('descriptions are concise single lines', () => {
    for (const [type, desc] of Object.entries(NODE_DESCRIPTIONS)) {
      expect(desc, type).not.toContain('\n')
      expect(desc.length, type).toBeLessThanOrEqual(80)
    }
  })
})
